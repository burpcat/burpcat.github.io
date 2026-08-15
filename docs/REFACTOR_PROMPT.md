# Engine Refactor Prompt

Paste the block below into a **fresh Claude Code session** at the repo root to
refactor the site engine. It's intentionally self-contained. Run it *after* the
UI-fix PR has merged, so the refactor starts from a clean, working baseline.

---

```
You are refactoring the "engine" of my Eleventy static site (burpieland). This
is a BEHAVIOR-PRESERVING refactor for readability and safe future changes — NOT
a redesign. The site must look and behave identically before and after.

FIRST, read `docs/ENGINE_REFERENCE.md` in full — it's a function-to-function
map with a blast-radius ranking. Treat it as the source of truth for what
touches what, and UPDATE it as you change things.

Context: no bundler, no module system. Each file in `src/js/*.js` is one IIFE;
they coordinate only through DOM classes/attributes on <html>/<body> and a
`window.__site` object. Build: `npx @11ty/eleventy` (full: `npm run build`).
Templates are Nunjucks; config is `.eleventy.js`; build scripts in `scripts/`.

Target refactors, in priority order (do the smallest, safest first):

1. Decompose `src/js/spiral.js` (currently one ~700-line IIFE). Split its
   concerns into clearly separated sections or small files loaded in order:
   (a) geometry/keyframes (pure), (b) the timeline/phase-state-machine,
   (c) the renderer (canvas draw fns), (d) mode observers, (e) sessionStorage
   persistence. Break up the monster `frame()` into named steps
   (advanceClock, advancePhase, renderScene, persist). Keep the exact visual
   output and timing.

2. Replace the ad-hoc `window.__site` bridge + the three MutationObservers with
   ONE small `modes` module that owns theme / calm / reading / medium: it reads
   initial state, exposes `get(name)`, `set(name, value)`, and
   `subscribe(name, cb)`, and is the single place that touches the DOM
   classes/attributes and localStorage for those modes. spiral.js and the
   welcome popup become subscribers instead of pollers. Preserve the
   anti-flash `<head>` script (it must stay inline and synchronous).

3. Make `reading-mode` have a SINGLE source of truth: one `isBlogUrl(url)`
   helper used by both the build-time template condition (via a computed data
   value or shortcode) and `nav.js`, instead of the duplicated `"/blog/" in url`
   literals.

4. Introduce a `--display-font` CSS custom property in `:root` and use it for
   all heading declarations (Bricolage Grotesque is currently hardcoded in ~8
   places in `src/css/style.css`). Confirm `--mono` is used for every code/mono
   context (some chrome still hardcodes `'Courier New'`).

5. Dedupe: (a) extract the shared "latest GitHub push" logic used by both
   `scripts/fetch-github.js` (build) and site.js's status IIFE (runtime) into
   one small helper each imports/copies from a single documented source;
   (b) replace `scripts/og-images.js`'s hand-rolled front-matter parser with
   the same YAML/gray-matter parser Eleventy already uses.

6. Replace the inline `onclick="openModal(...)"` / `closeModal()` handlers in
   `base.njk` + the two global functions in site.js with proper
   `addEventListener` wiring, so no client function is window-global.

7. If the bookmarks feature is ever restored, escape the `innerHTML` list sink
   in `bookmarks.js` (build the DOM with textContent, not string concatenation).

Constraints:
- Keep the build green after EVERY change: run `npx @11ty/eleventy` and fix any
  error before moving on. Commit atomically, one refactor step per commit.
- Do NOT change the rendered HTML/CSS output in any user-visible way. If you're
  unsure a change is behavior-preserving, stop and ask.
- After each structural change, update `docs/ENGINE_REFERENCE.md` (function
  tables + contracts) so it stays accurate.
- Verify in a real browser at the end: home, /blog/, a post, plus toggling
  theme / calm / medium and a soft-navigation between pages — everything must
  behave exactly as before.
```

---

## Why this is separate from the UI fixes

A full engine refactor touches the highest blast-radius code (`spiral.js:frame()`,
the mode wiring, the markdown pipeline). Bundling it with visual bug-fixes would
make regressions hard to bisect. Ship the fixes first; refactor from green.
