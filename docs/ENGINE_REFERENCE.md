# Engine Reference — burpieland

A function-to-function map of the site "engine" so a change can be scoped by
**blast radius** before it's made. Covers the client JS (`src/js/*.js`), the
Eleventy build config (`.eleventy.js`), and the build scripts (`scripts/*.js`),
plus the DOM/CSS contracts that wire them together.

> Maintenance: when you add/rename a function, a `window.__site` bridge, a
> storage key, or a `<html>/<body>` class/attribute, update the relevant table
> here. Line numbers drift — treat them as hints, grep the name to confirm.

---

## Architecture at a glance

- **No module system, no bundler.** Every client file is a single IIFE shipped
  verbatim (`addPassthroughCopy("src/js")`). They coordinate **only** through
  the DOM (classes/attributes on `<html>`/`<body>`) and the `window.__site`
  object — there are no imports between them.
- **Load order** (`src/_includes/base.njk`, end of `<body>`): `site.js`,
  `nav.js`, `spiral.js`, `mermaid-init.js`, then deferred `embeds.js`,
  `lightbox.js`. (`bookmarks.js` was retired.)
- **Navigation is soft/pjax** (`nav.js`): clicks are intercepted, the next
  page is fetched and its `#main` swapped in. `#sceneSky` / `#calmAudio` live
  *outside* `#main`, so they survive a soft-nav; `sessionStorage` continuity is
  for hard reloads / direct URL entry.
- **Build-time → runtime handoffs**: `collections.posts.length` →
  `data-post-count` → strand count; `weather.json` → `--chitra-color*` CSS vars
  → the star's color; `github.json` → the "currently building" status (then
  refreshed client-side).

---

## `src/js/spiral.js` — animated canvas background (largest, highest blast radius)

One IIFE driving `<canvas id="sceneSky">`. Reads modes live via MutationObserver; never writes them.

| Function | Purpose | Inlinks | Outlinks / side effects |
|---|---|---|---|
| `catmullRom1D` / `upsampleCurve` / `toPoints` | Resample hand-traced 40pt curves to 256pt keyframes | module init (`pageKeyframes`) | pure math |
| `goldenKeyframe` | Procedural golden-spiral coil keyframe | module init | pure |
| `extendEnd` / `extendKeyframe` | Bleed curve ends off-screen | module init | pure |
| `easeInOut` / `smoothstep` / `lerpPoints` | Easing + keyframe interpolation | `pointsAtL`, `back` phase | pure |
| `pointsAtL(L)` | Curve points at continuous leg-progress `L∈[0,1]` | `frame`, `drawStatic` | `lerpPoints` |
| `anchorParam` / `anchorPoint` / `sampleAtIndex` | Point locked under the orb | `frame`, `drawStatic` | pure |
| `speedFwd` / `speedBack` / `calibrateNorm` | Per-position playback speed + leg calibration | phase machine (init for NORM_*) | pure |
| `updateTimings()` | Recompute leg durations from `calm` multiplier | init, calm/reading MutationObservers | reads `readingMode()` |
| `saveState` / `loadState` | Persist `{phase,L,Lsmoothed,holdElapsed}` | `frame` (save each frame), init (load) | **sessionStorage `spiral-phase-v1`** |
| `isLightMode` / `isAboutPage` / `readingMode` | Read `data-theme`/`data-page`/`reading-mode` off `<html>` | throughout | DOM reads |
| `resize` | Canvas backing size / DPR / center | resize listener (debounced), init | may call `drawStatic` |
| `paintSky` | Gradient fill from `--sky-top/--sky-bottom` | `frame`, `drawStatic` | canvas |
| `chitraRgb` | Read `--chitra-color-rgb` | strands/orb/frame | `getComputedStyle` |
| `rgbToHsl` / `hslToRgb` | Hue-fan the strands | `drawStrands` only | pure |
| `strokeMorph` | **Core** curve stroke (under-glow + crisp) | `frame`, `drawStatic`, `drawStrands` | canvas |
| `drawStrands` | One hue-shifted strand per post (`POST_COUNT`, cap 12) | `frame`, `drawStatic` | `chitraRgb`, hsl, `strokeMorph` |
| `drawOrb` | Center star/orb, beat pulse, moon crescent | `frame`, `drawStatic` | canvas |
| `updateThemeMix` | Advance 600ms sun↔moon crossfade | `frame` | written by theme MutationObserver |
| **`frame(ts)`** | **Per-frame driver** — dt, theme mix, beat/music-gate slew, hum, 5-state phase machine, persistence, sky, dispatch, rAF | rAF self-recursion (via `start`) | ~everything; reads `#calmAudio.paused/currentTime`, CSS vars; writes sessionStorage |
| `drawStatic` | Single frame when frozen (reduced-motion) | `resize`, `setFrozen`, theme observer, init | render path |
| `start` / `stop` / `setFrozen` | rAF lifecycle | visibility + reduced-motion listeners, init | — |

**Module-scope observers/listeners**: MutationObserver on `<html data-theme>`
(theme crossfade), on `<html class>` (`reading-mode` → `updateTimings`), on
`<body class>` (`calm-mode` → `updateTimings`); `resize` (debounced),
`visibilitychange`, `prefers-reduced-motion`.

**Blast radius**: `frame()` and the three observers are the hottest edit points
— they join `data-theme` (site.js), `calm-mode` (site.js), `reading-mode`
(base.njk + nav.js), `#calmAudio` (site.js), and `--chitra-color*`
(fetch-weather.js) with no compile-time link. Renaming any of those elsewhere
breaks the animation silently.

---

## `src/js/site.js` — six independent IIFEs

| IIFE / function | Purpose | Inlinks | Side effects / bridges |
|---|---|---|---|
| **A. modal** `openModal(mode)` / `closeModal()` | Auth modal (placeholder) | inline `onclick=` in `base.njk` + Escape keydown | **only global (non-IIFE) fns**; toggle `.open` on `#authModal` |
| **B. theme** `applyTheme(theme, announce)` / `announceTheme` | Set `data-theme`, icon, toast | `#themeSwitch` click, OS-change, `window.__site.setTheme` | **localStorage `theme`**; `window.__site.setTheme`; `.theme-toast` element |
| **C. calm** `apply(on)` | Toggle `body.calm-mode` | `#calmToggle` click, init, `window.__site.setCalmMode` | **localStorage `calm-mode`**; `window.__site.setCalmMode` |
| **D. music** `setMusicOn`/`render`/`tryResume`/`saveAudio` | Background audio | `#muteToggle`, `tryResume`, `window.__site.setMusicOn` | **sessionStorage `music-on`, `calm-audio`**; `window.__site.setMusicOn`, `.audio` |
| **E. welcome** `open`/`close`/`trapKeydown`/`sync*` | First-visit popup | init (if not welcomed) | **localStorage `welcomed`**; consumes all `window.__site.*` |
| **F. status** `render`/`fromCache`/`toCache` | Live "currently building" | init fetch | **sessionStorage `github-status-cache`**; rewrites `#statusText` |
| **medium** `apply(on, forceLight)` | Blog-post Medium reading skin | `#mediumToggle` click, init | **localStorage `medium-mode`**; toggles `html.medium-mode`; forces `data-theme=light` via `setTheme` on activation |

Duplicated logic: IIFE **F** re-implements `scripts/fetch-github.js`'s
"find first PushEvent" at runtime; the theme decision is also duplicated in
`base.njk`'s anti-flash `<head>` script.

---

## `src/js/nav.js` — soft navigation (pjax)

`mainEl`, `isRoutable`, `reviveScripts` (re-executes swapped-in `<script>`s —
this is what re-runs the blog search init), `syncSiblingRegion` (`.hero-caption`
/ `.blogroll`), **`applySwap`** (swaps `<title>`, meta, `data-page`, nav,
`#main`; **recomputes `html.reading-mode` from the URL** — the runtime source of
truth after first load), `navigateTo` (fetch + DOMParser + history; hard-nav
fallback on failure). Listeners: `click`, `popstate`.

**Contract**: `reading-mode` has two writers — `base.njk:2` (build-time,
initial) and `nav.js` `applySwap` (runtime) — both using the `"/blog/" in url`
rule as separate literals. Change the blog URL scheme → touch both.

---

## `src/js/mermaid-init.js` — lazy diagram renderer (self-hosted)

Early-exits unless `pre.language-mermaid` exists. `loadLocal()` injects
`/js/vendor/mermaid.min.js` (self-hosted UMD → `globalThis.mermaid`);
`loadCdn()` is the jsdelivr `+esm` fallback. `renderAll(mermaid)` calls
`mermaid.render()` per block and replaces each `<pre>` with `<div class=mermaid>`.
Coupling: the `pre.language-mermaid` class comes from Prism (`syntaxHighlight`
in `.eleventy.js`).

## `src/js/embeds.js` / `src/js/lightbox.js`

- **embeds**: hydrate `.embed-tweet[data-tweet]` / `.embed-gist[data-gist]`
  (markup emitted by `lib/markdown-it-embeds.js` — rename = silent break).
- **lightbox**: delegated click on `.post-body img` → zoom overlay; `close`/`onKey`.

## `src/js/bookmarks.js` — retired

The save button, `#savedPosts`, and this script tag were removed. The file
remains on disk but is no longer loaded. (localStorage `burpcat:bookmarks`.)

---

## `.eleventy.js` — build config

- **Helpers**: `slugify` (shared by `markdownItAnchor` + the `slug` filter — keeps heading IDs and tag slugs in agreement), `calloutContainer` (`:::note/tip/warn/info`).
- **`amendLibrary("md", …)`**: the single markdown pipeline (anchors, footnotes, task-lists, deflist, KaTeX, embeds, callouts). **Every post body passes through it — high blast radius.** Downstream consumers depend on its output shape: `toc` regexes `id="…"` from anchor output; `embeds.js`/`mermaid-init.js` depend on emitted class names.
- **Plugins**: `rssPlugin`, `syntaxHighlight` (Prism → `pre.language-*`), `eleventyImageTransformPlugin`.
- **Collections**: `posts` (glob, newest-first — feeds `data-post-count`), `tagList`, `seriesMap`.
- **Filters**: `limit`, `dotDate`, `readingTime`, `isRecent`, `isoDate`, `slug`, `selectByTag`, `displayTags` (strips the blanket `posts` tag — must be piped anywhere tags render), `toc` (≥2 headings), `relatedPosts` (tag-overlap scoring).
- Config: `markdownTemplateEngine: false` (post bodies skip Nunjucks so `{{ }}` in prose/code is literal).

## `scripts/*.js` — build-time

- **fetch-github.js** `main()` → `github.json` (dup of site.js IIFE F).
- **fetch-weather.js** `bucketFor` / `main()` → `weather.json` → `--chitra-color*`.
- **og-images.js** `fileSlug` / `frontMatter` (naive YAML — dup of Eleventy's parser) / `card` / `render` / `main()` → `_site/og/*.png`. Must run after Eleventy; its slug must match `page.fileSlug`.

---

## Cross-cutting state contracts

### `window.__site.*` (all set + consumed within `site.js`)
| Property | Set by | Read by |
|---|---|---|
| `setTheme(theme, announce)` | theme IIFE | welcome popup, medium-mode activation |
| `setCalmMode(on)` | calm IIFE | welcome popup |
| `setMusicOn(on, isGesture)` | music IIFE | welcome popup "enter" |
| `audio` (raw `<audio>`) | music IIFE | welcome popup (resets currentTime) |

### localStorage
| Key | Writer | Reader |
|---|---|---|
| `theme` | theme IIFE + `base.njk` anti-flash | anti-flash, theme IIFE |
| `calm-mode` | calm IIFE | calm IIFE init |
| `medium-mode` | medium IIFE | medium IIFE init |
| `welcomed` | welcome close | welcome IIFE guard |

### sessionStorage
| Key | Writer | Reader |
|---|---|---|
| `spiral-phase-v1` | spiral `saveState` | spiral `loadState` (validated) |
| `music-on` / `calm-audio` | music IIFE | music IIFE init |
| `github-status-cache` | status IIFE | status IIFE (3-min TTL) |

### `<html>` / `<body>` classes & data-attributes
| Attr/class | Set by | JS readers | CSS readers |
|---|---|---|---|
| `data-theme` | anti-flash → `applyTheme` | spiral observer, `isLightMode`/`isAboutPage` | `[data-theme="dark"]` throughout |
| `data-page` | `base.njk` → `nav.js` | `isAboutPage` | `[data-page="about"]` |
| `data-post-count` | `base.njk` (build) | `POST_COUNT` | — |
| `class="reading-mode"` | `base.njk` (build) → `nav.js` (runtime) | `readingMode()` + observer | width/scene rules |
| `body.calm-mode` | calm IIFE | spiral observer | scene blur, animation kills |
| `html.medium-mode` | medium IIFE | — | Medium skin + theme-switch glow |
| `#sceneSky` | `base.njk` (owned by spiral.js) | spiral.js | `.scene-sky` fade-in |
| `#calmAudio` | `base.njk` (owned by music IIFE) | spiral.js (read-only beat sync) | — |
| `--chitra-color*` | `base.njk` (from weather.json) | `chitraRgb` | any `var(--chitra-color)` |

---

## Blast-radius ranking (edit these carefully)
1. **`spiral.js:frame()`** — timing, theming, audio-sync, persistence, all render dispatch in one function.
2. **`spiral.js` mode-observers** — the only wiring of `data-theme`/`reading-mode`/`calm-mode` into the animation.
3. **`window.__site` bridge** — informal, unenforced; rename → welcome popup silently breaks.
4. **`.eleventy.js` `amendLibrary`** — every post body; `toc`/`embeds`/`mermaid` depend on its output.
5. **Duplicated GitHub-fetch** (site.js ↔ fetch-github.js) & **front-matter parse** (og-images.js ↔ Eleventy) — can drift.
6. **Dual `reading-mode` writers** (base.njk ↔ nav.js) — keep the URL rule in sync.
7. **Class-name couplings** — Prism↔mermaid (`pre.language-mermaid`), embeds↔markdown plugin.
