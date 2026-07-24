---
title: "Spec-driven, feature-driven, and the thing that actually predicted quality"
date: 2026-07-24
excerpt: "I built two projects a few weeks apart, one spec-first and one feature-first, to see which discipline held up better. By the end the labels had almost swapped — and neither one was what predicted where the effort paid off."
tags: ["engineering","ai","process"]
crosspost: {"devto":true}
---

*I built two projects a few weeks apart, one spec-first and one feature-first, to see which discipline held up better. By the end the labels had almost swapped — and neither one was what predicted where the effort paid off.*

Over about three weeks I shipped two unrelated tools. The first, `shrutz`, is a macOS wallpaper rotator with an unusual twist: it advances based on your *active* keyboard-and-mouse time, not the wall clock, so the picture only changes while you're actually at the machine. It's a ~2,300-line bash daemon with a Swift menu-bar companion. The second, `slap`, is a cold-outreach CLI built on the GMass API — ~7,000 lines of Python across nineteen modules with a local dashboard.

I built `shrutz` "spec-driven": the plan was to write the spec first and let it drive everything. I built `slap` "feature-driven": scope a feature, build it, ship it, move to the next. That was the intent. The git history tells a more honest and more useful story.

## The labels inverted almost immediately

`slap`, my *feature-driven* project, is the one that actually got a spec. Day one opened against a 468-line numbered build brief — sections 0 through 14, ending in a literal "Build Order" — and every step in that order went through a review pass before it was allowed to commit. In its first five commits it laid down about 28% of all the code the project would ever contain. If you squint, that's the most spec-driven day of either project.

`shrutz`, my *spec-driven* project, spent its first two weeks as pure organic growth: direct-to-master commits with messages like `FULL POWER`, no branches, no pull requests, no spec. The one document that reads like a spec — a project-context file establishing invariants and design rules — was written *after* the rotation engine, the weather feature, the gallery, and the JSON API had already shipped. It's a description of what existed, not a plan for what to build. A single genuine spec-conformance loop does appear in `shrutz`, but only in one place, and that place is the tell.

## What actually predicted where rigor paid off: verifiability

The `shrutz` spec loop shows up exclusively around the menu-bar app's *visual design*. There's a folder of human-approved mockups, and each build was checked against them by capturing a real screenshot from the live window server and writing a conformance report comparing pixel dimensions and source-code constants to the reference. Nothing else in `shrutz` got that treatment. The daemon logic — idle detection, the two-path wallpaper apply, shuffle-state persistence — grew by feel and was mostly fine.

`slap` did the exact same thing on a completely different surface. Its heaviest upfront rigor went into verifying the *external API contract* it couldn't see into. Before any dependent code was written, probe scripts hit the real GMass API and caught three places where the documentation was wrong: stop-on-reply is configured per-stage, not with one global flag; the send endpoint wants the campaign ID in the URL path, not the body (the documented form returns HTTP 400); attachments are JSON-only and reject multipart with a 415. Those findings were pinned in a control sheet that also lists, explicitly, the things that *can never* be verified from code — for instance, whether GMass actually honors a stop-on-reply is write-only, with no read-back, so a 200 on send is the strongest signal obtainable.

Two projects, two methodologies, and both independently concentrated their most disciplined, spec-like work on exactly the surface where correctness cannot be checked any other way — a rendered pixel, a third party's live behavior. Everywhere the result *was* verifiable — core logic you can exercise with a test — both projects grew by accretion and did fine. `slap`'s core files have a churn ratio near 1.0 (almost every line ever written is still there) and the entire history contains zero real reverts. The methodology label didn't predict quality. Verifiability did.

## Where it broke, and what the failures had in common

**Specs go stale, and your process can lose even a written fix.** `slap`'s main context doc still says a major feature isn't built yet. The frustrating part: a complete fix for that staleness exists — a full rewrite on a branch named `docs/sync-living-docs`. It was written, then never merged, so the correction has sat one `git merge` away from reality for the life of the project. The doc isn't stale because nobody noticed; it's stale because iteration outran its own paperwork. `shrutz` has the mirror-image fossil: a CI config that still auto-merges a branch straight to master with no review gate, left over from a same-day commit literally titled "removed PR necessity," contradicted by every reviewed merge since. In both cases a written artifact outlived the reality it described. Prose that has to be kept in sync by hand won't be.

**Diff-scoped review has one structural blind spot: invariants that span call sites.** `slap`'s worst bug is a bug that came back. GMass rewrites `<a href>` links for click tracking, so a plain-text email — with no anchor tag to rewrite — silently defeats `clickTracking: true`. I fixed it once in the draft-creation path by converting to minimal HTML. Three weeks later the identical root cause surfaced in the follow-up-message path, a different function carrying the same invariant that never got the conversion. No review of either diff could have caught the second one, because the defect isn't *in* the diff — it's in a call site the diff doesn't touch. `shrutz` learned the same lesson from a naming-drift crash: the installer created a wallpaper set at one path but seeded state with a different default string, so the daemon looked for a directory that didn't exist and `launchd` cheerfully restarted it into a crash loop. The fix wasn't to correct the string — it was to make the two values *derive from one source* so they can't drift:

```diff
 WALLS_DEFAULT="$LIB/wallpapers/hassan"
+ACTIVE_SET_DEFAULT="$(basename "$WALLS_DEFAULT")"   # keep state in sync with the dir we actually create
 ...
-    printf 'CURRENT_INDEX=0\nACTIVE_SECONDS=0\nACTIVE_SET=default\n'      > "$LIB/state"
+    printf 'CURRENT_INDEX=0\nACTIVE_SECONDS=0\nACTIVE_SET=%s\n' "$ACTIVE_SET_DEFAULT" > "$LIB/state"
```

**Review before commit is worth more than fixing after.** `slap`'s rework looks alarming by one measure and trivial by another: 17.5% of commits were post-hoc fixes to already-shipped behavior, but those fixes were only ~4.3% of all lines changed. The gap is the whole point. A read-only review pass ran over every diff before it was allowed to commit, and the bugs it caught never became separate fix commits — they were folded into the commit that introduced the feature. One migration commit quietly notes that three distinct bugs, including an uncaught error path and a resurface edge case, were fixed inside it before it ever entered history. The rework that *did* leak through was small and concentrated in core logic, not in the largest module.

That review pass earned its keep most on a bug that would never have shown up in a test written by someone who didn't already know the trap. `slap` needed to add a value to a SQLite `CHECK` constraint, which means rebuilding the table. The first attempt used `executescript()` — which force-commits any pending transaction before it runs, *including the `BEGIN` the same function just opened*. A crash between the rename and the drop would have permanently stranded the append-only event log, the app's single source of truth. The fix is boring; the test is not:

```python
def _migrate_events_check_constraint(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='events'"
    ).fetchone()
    if row is None or "'stopped'" in row[0]:
        return  # fresh db, or already migrated
    conn.execute("BEGIN")
    try:
        conn.execute("ALTER TABLE events RENAME TO events_pre_stopped_migration")
        conn.execute(_EVENTS_TABLE_SQL)          # execute(), never executescript()
        conn.execute("INSERT INTO events (...) SELECT ... FROM events_pre_stopped_migration")
        conn.execute("DROP TABLE events_pre_stopped_migration")
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
```

The regression test injects a crash immediately after the rename (a `Connection` subclass that raises on one specific statement) and asserts the database lands back in its original, unmigrated state. That's a correctness *guarantee*, not a happy-path check — and it only exists because someone reviewed the migration before it shipped, not after it corrupted something.

**Manual verification catches what tests can't — in both methodologies.** The tidy story would be "spec-driven means verified, feature-driven means you catch bugs by hand later." It isn't true. `slap`'s most spec-driven day shipped a real concurrency bug — the dashboard closed over one SQLite connection at startup, and SQLite connections are only usable on their creating thread, so every request after the first, dispatched on a fresh thread by the real server, blew up. No test caught it. A human clicking around a browser did. The regression test written afterward has to spin up a real threaded server on a real socket, because the synchronous test client structurally cannot reach the bug:

```python
@pytest.mark.slow
def test_dashboard_survives_real_concurrent_request_threads(tmp_path, monkeypatch):
    # Flask's test_client() runs requests synchronously on the calling thread,
    # so it can't reproduce this. A real WSGI server dispatches each request on
    # its own thread, and sqlite3 connections are only usable on the thread
    # that opened them. This spins up a real server on a real socket to prove
    # requests from different threads all succeed.
    ...
```

## What I'd actually take to the next project

The methodology name was the least useful thing I decided. Here's what I'd keep.

Find the surfaces you can't verify with an ordinary test — a rendered UI, a third party's real behavior, hardware sleep/wake — and spend your specification budget *there*, up front, building the verification harness before the feature. That's where "spec-driven" earned its keep in both projects, and it earned nothing extra anywhere else. On verifiable core logic, iterating with good tests was plenty, and trying to over-specify it would have just produced more prose to keep in sync.

Don't write documentation you have to maintain by hand; it will lie, and it will lie fastest exactly when the code is moving fastest. Prefer a spec that verifies itself — a screenshot audit, an API probe, a failing test — over a paragraph that depends on your discipline. If a doc can't be executed, assume it's already wrong.

Review before the commit, not after. Folding a fix into the commit that introduced the problem is worth more than a clean revert history, and it's the single reason my "feature-driven" project's rework stayed at 4% of lines instead of ballooning.

And treat cross-call-site invariants as their own thing to review. Diff-scoped review — human or automated — is structurally blind to "this rule must hold everywhere," and that blindness is where my most annoying bug hid for three weeks. When a rule has to hold in more than one place, make the places derive from one source, or write down the invariant and grep for every site that touches it. That, more than any methodology, is what "spec-driven" should have meant all along.
