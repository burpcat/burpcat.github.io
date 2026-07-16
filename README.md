# I like doing fun things — this page is a one-of-a-kind example.

This is a personal website. It has a blog, an about page, and a guestbook — the bar was on the floor. It also has a hand-traced, BPM-synced canvas animation, a named star that only shows up in reader mode and only dances when there's actually music playing, and a GitHub Action that checks the weather in Boston every morning so a hidden feature can pick the right color. None of this was required. All of it shipped anyway.

If you're here to judge the code, this exists so you don't have to reverse-engineer `spiral.js` to find out what you're looking at.

## The showcase

### The Spiral
The moving line behind every page isn't a stock particle effect or a library — it's one `<canvas>`, ~700 lines of hand-written 2D context calls, tracing eight keyframes literally annotated `page2` through `page8` in the source, upsampled from the owner's own hand-drawn sketch via Catmull-Rom interpolation into a dense 256-point curve. It morphs continuously between them, and the last keyframe isn't traced — it's *generated*: a real logarithmic golden spiral, 3.25 turns, built from the actual golden ratio. The whole thing is tempo-locked to a real background track — 135 BPM, E-flat major, Camelot 5B, if you're into that — so the curve's breathing, the pulse of the little orb pinned at screen center, and even reader mode's choreography all derive from the same beat clock as the music you can (optionally) hear.

### Chitra
There's a hidden feature. In reader mode, the single line splits into one glowing strand per blog post — each a subtly different hue, dancing in sync around a small named star. Her name is Chitra, and she's mentioned exactly once in visible text on the site (an aside on the About page, for people who read carefully), plus a quieter second nod if you hover the canvas in reader mode long enough to trigger the browser's native tooltip. Her color isn't hardcoded: a GitHub Action hits a public weather API for Boston's actual current conditions every morning and bakes the result into a CSS variable, so the star — and the whole reading ambience — drifts with the real sky. And because someone thought about it too hard: the strands' wobble and the star's pulse both fade smoothly to stillness if you mute the background music, and warm back up the moment you unmute. A static site does not need audio-reactive visuals with a mute-aware idle state. It has one.

### Soft navigation, no framework required
There is no React, no Vue, no client-side router library, no build step for the frontend beyond templating. Every page here is a genuinely separate static HTML file. And yet clicking around the site never restarts the background music or the canvas animation — because `nav.js` is a hand-rolled, dependency-free client-side router that intercepts same-origin link clicks, fetches the destination as plain HTML, swaps in only the regions that changed, and re-executes any inline `<script>` tags the browser wouldn't otherwise run (so the guestbook's embedded comments still work after a "soft" navigation). Progressive enhancement means if any of this fails, it just falls back to a real page load — today's behavior, no worse for it.

## Everything else that didn't need to exist

- **Sun and moon, rendered, not swapped.** The orb crossfades between a sun-glow and a moon with a soft crescent bite using nothing but canvas gradients and alpha blending — no image assets, no sprite sheet.
- **Three independently tuned speeds.** Normal, calm mode, and reader mode all move at their own pace, and `prefers-reduced-motion` doesn't just pause the animation — it freezes it to a single, deliberately-composed static frame.
- **A status bar that's actually live.** The "currently building" line is your latest real GitHub push, fetched both at build time and again client-side, so it's never more than a few minutes stale.
- **A guestbook with no backend.** Comments live in this repo's GitHub Discussions, via giscus. There is no database, because there doesn't need to be one.
- **The animation remembers where it was.** Navigate anywhere on the site and the spiral resumes exactly where it left off, via a few bytes in `sessionStorage`, instead of restarting from scratch like a normal multi-page site would.
- **An unprompted essay convincing you to use RSS again**, complete with reader-app recommendations, on a page most sites don't even have.
- **"no analytics OR tracking"** — stated plainly in the footer, and true.

---

Built with Eleventy, vanilla JS and CSS, and a genuinely excessive amount of care, deployed to GitHub Pages via GitHub Actions. No frameworks were harmed in the making of this website.
