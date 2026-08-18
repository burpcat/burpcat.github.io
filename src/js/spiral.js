// ── background scene: morph through the owner's traced curves, then coil, then ping-pong ──
// One canvas, no dependencies. The orb is pinned to screen center at all
// times — it never reads a curve coordinate. The curve is translated so a
// moving anchor point lands under it, and morphs as it goes. There is no
// parametric spiral camera, no rotation, and no infinite self-similar zoom.
// Theme, calm-mode, and reading-mode are read live via MutationObserver, so
// this file needs no wiring from site.js for those. Audio *playback* (play/
// pause/volume) lives in site.js (autoplay needs a real click gesture, which
// the calm-toggle handler already has) — this file only ever *reads*
// #calmAudio's currentTime/paused state, to lock the beat/hum to the track.
(function () {
  const canvas = document.getElementById('sceneSky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const audioEl = document.getElementById('calmAudio'); // safe: base.njk defines it well before this script tag, same as #sceneSky
  const mistBottom = document.querySelector('.scene-mist-bottom');
  const mistTop = document.querySelector('.scene-mist-top');
  // baked in at build time from collections.posts.length — one dancing
  // strand per blog post, reading-mode only (see drawStrands below).
  const POST_COUNT = Math.max(1, parseInt(root.getAttribute('data-post-count'), 10) || 1);

  // ── tuning knobs ──
  const SCALE_X = 0.9;            // curve width as a fraction of viewport width
  const SCALE_Y = 0.72;           // curve height as a fraction of viewport height
  const CY_FACTOR = 0.52;         // orb's vertical position as a fraction of viewport height
  const EXT = 0.5;                // how far (normalized units) open ends bleed past the viewport
  const P = 256;                  // resampled point count shared by every keyframe

  // About page only: the sky itself scrolls through a day, sunrise (orange/
  // yellow) at the top of the page crossfading to sunset (golden red/
  // orange) by the bottom — see aboutSkyColors(), used by paintSky().
  const ABOUT_SUNRISE_SKY = ['#F2A65A', '#FCE29B']; // top, bottom
  const ABOUT_SUNSET_SKY = ['#7A2E1D', '#E8873C'];  // top, bottom

  // Tempo data for the background track: E-flat major, Camelot 5B, 135 BPM.
  const BPM = 135;
  const BEAT = 60 / BPM;          // ~0.444s
  const BAR = BEAT * 4;           // ~1.778s (4/4)
  const BEAT_SLEW_K = 0.1;        // per-frame correction pulling the free clock toward real audio position
  const BEAT_PULSE_SCALE_AMP = 0.03; // orb's beat pulse, ~3% (within the 2-4% range)
  const BEAT_PULSE_SCALE_AMP_READING = 0.06; // reading-mode-only boost — the star's clearest "synced to real audio" cue

  const LEG_SECONDS = 10 * BAR;    // forward travel time (page2 -> spiral), holds excluded — 10 bars, ~17.8s
  const LEG_SECONDS_BACK = 5 * BAR; // return leg: fast, flat unwind (before the low-pass lag) — 5 bars, ~8.9s
  const HOLD_BELL_S = 2.5 * BEAT;   // brief near-stop breath at the page-8 bell — 2.5 beats, ~1.11s
  const HOLD_COIL_S = 5 * BEAT;    // longer humming drift-hold at the golden coil — 5 beats, ~2.22s
  const CALM_MULT = 25;           // calm mode scales every duration above by this
  const READING_MULT = 10;        // reader mode's own (gentler) slowdown — dreamy but visibly moving, not near-frozen like calm mode

  const HUM_SCALE_AMP = 0.012;    // breathing scale, 1.00 <-> 1.012 (mild — softened from the original 1.5%)
  const HUM_ROT_AMP = (0.4 * Math.PI) / 180; // +/- 0.4 degrees (mild — softened from the original 0.5deg)

  const LOWPASS_K = 0.06;         // return-leg lag: smaller = laggier/floatier

  // Reading-mode-only: one strand per blog post, dancing in harmony around
  // the star (Chitra). IDLE_HUM_* gives strands outside the coil-hold a
  // faint life of their own instead of sitting dead still; the hue spread
  // is a subtle fan around Chitra's live weather color, not a rainbow.
  const IDLE_HUM_SCALE_AMP = 0.006;
  const IDLE_HUM_ROT_AMP = (0.3 * Math.PI) / 180;
  // Analogous color-harmony step: each extra strand's hue is nudged a fixed,
  // bounded distance from Chitra's base hue, alternating sides (+18, -18,
  // +36, -36, ...), hard-capped well short of 180 degrees so it can never
  // wander into a clashing hue no matter how many posts (strands) accrue.
  // Each strand's offset depends only on its own index, not the total
  // count, so a newly added strand never recolors ones that already exist.
  const HUE_STEP_DEG = 18;
  const HUE_MAX_SPREAD_DEG = 65;
  const MAX_STRANDS = 12; // safety cap on draw calls as the blog grows
  const BAND_ARM_POINTS = 32; // fixed point count per band-fill arm — cheap, and equal-length arms let any two arms pair up safely
  const ABOUT_TWIN_SPREAD_DEG = 3; // About page's two strands: start together at the star, only barely apart by the screen edge
  // How far a ray may extend from Chitra before it's cut off, as a fraction
  // of min(viewport width, height) — deliberately independent of SCALE_X/Y,
  // which size the *traced curve itself* (originally tuned for one hillside
  // silhouette bleeding off both screen edges) and were never a good proxy
  // for "how long a ray reads as" once that same curve is reused, rotated,
  // once per strand (see reachIndexRange, used by both drawStrands variants).
  const STRAND_REACH_FRAC = 0.24;

  // ── traced keyframes — the owner's sketch, pages 2 through 8 ──
  // Each is a y=f(x) profile: 40 samples, x = i/39 across the width,
  // y in [0,1] with 1 = top of screen. Authoritative — not a formula.
  const CURVES = [
    /* page2 — uphill        */ [0.298,0.312,0.323,0.335,0.346,0.355,0.368,0.381,0.392,0.405,0.416,0.429,0.443,0.452,0.463,0.475,0.487,0.498,0.508,0.517,0.536,0.545,0.555,0.564,0.574,0.586,0.596,0.604,0.615,0.622,0.636,0.648,0.655,0.664,0.673,0.681,0.692,0.700,0.707,0.712],
    /* page3 — rise, small dip */ [0.230,0.254,0.274,0.292,0.314,0.327,0.346,0.362,0.376,0.394,0.407,0.421,0.439,0.453,0.469,0.485,0.500,0.515,0.528,0.543,0.559,0.574,0.586,0.596,0.608,0.619,0.629,0.637,0.644,0.650,0.655,0.658,0.659,0.652,0.641,0.626,0.595,0.572,0.551,0.534],
    /* page4 — bell (this is life) */ [0.291,0.314,0.335,0.359,0.384,0.407,0.431,0.456,0.473,0.499,0.516,0.536,0.556,0.572,0.590,0.604,0.616,0.633,0.642,0.654,0.665,0.672,0.672,0.661,0.639,0.621,0.592,0.562,0.544,0.518,0.497,0.477,0.459,0.449,0.444,0.447,0.449,0.450,0.452,0.457],
    /* page5 — valley then rise */ [0.351,0.371,0.386,0.403,0.424,0.439,0.459,0.476,0.490,0.507,0.519,0.533,0.542,0.551,0.555,0.549,0.528,0.508,0.484,0.451,0.428,0.417,0.416,0.416,0.418,0.420,0.421,0.426,0.443,0.467,0.486,0.503,0.515,0.523,0.532,0.538,0.546,0.556,0.565,0.574],
    /* page6 — plateau then climb */ [0.410,0.441,0.459,0.479,0.494,0.506,0.525,0.538,0.551,0.563,0.568,0.572,0.569,0.560,0.552,0.547,0.547,0.554,0.579,0.593,0.639,0.661,0.682,0.701,0.718,0.737,0.754,0.771,0.790,0.814,0.830,0.843,0.856,0.867,0.880,0.895,0.903,0.912,0.919,0.932],
    /* page7 — steady steep climb */ [0.394,0.415,0.434,0.454,0.472,0.486,0.505,0.525,0.539,0.559,0.576,0.589,0.609,0.627,0.641,0.660,0.677,0.689,0.705,0.721,0.741,0.755,0.765,0.779,0.793,0.802,0.811,0.824,0.836,0.845,0.853,0.860,0.871,0.883,0.892,0.903,0.910,0.917,0.926,0.937],
    /* page8 — balanced bell  */ [0.413,0.417,0.422,0.430,0.445,0.459,0.475,0.499,0.515,0.544,0.570,0.593,0.630,0.651,0.673,0.696,0.710,0.718,0.720,0.720,0.717,0.711,0.698,0.678,0.660,0.633,0.607,0.578,0.551,0.531,0.515,0.501,0.491,0.482,0.476,0.473,0.472,0.474,0.476,0.480],
  ];

  // Catmull-Rom upsample of a 1D y-profile (uniform x-grid) from its native
  // sample count to `outN` points, so every keyframe shares one dense P.
  function catmullRom1D(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  function upsampleCurve(yValues, outN) {
    const n = yValues.length;
    const get = (i) => yValues[Math.max(0, Math.min(n - 1, i))]; // clamp = duplicate endpoint
    const out = new Array(outN);
    for (let j = 0; j < outN; j++) {
      const srcPos = (j / (outN - 1)) * (n - 1);
      const i1 = Math.floor(srcPos);
      const t = srcPos - i1;
      out[j] = catmullRom1D(get(i1 - 1), get(i1), get(i1 + 1), get(i1 + 2), t);
    }
    return out;
  }
  function toPoints(yValues) {
    const n = yValues.length;
    return yValues.map((y, i) => [i / (n - 1), y]);
  }

  // The 8th keyframe: the bell's line winds into a golden coil — at least
  // three full turns, tightly wound at the eye, generated directly at P so
  // the innermost turn reads round, not polygonal. index0 is the
  // outer/open end (extends off-frame); index P-1 is the inner/curled end
  // (never extrapolated — it's the closed heart of the coil). cx/cy biased
  // low-left per the reference frame; tune by eye.
  function goldenKeyframe(N) {
    const K = Math.log(1.6180339887) / (Math.PI / 2);
    const cx = 0.40, cy = 0.62;
    const TURNS = 3.25;
    const thEnd = TURNS * 2 * Math.PI;
    const rOuter = 0.85;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const th = f * thEnd;
      const r = rOuter * Math.exp(-K * th);
      pts.push([cx + r * Math.cos(th + 0.4), cy + r * Math.sin(th + 0.4)]);
    }
    return pts;
  }

  // Extend a point list past one end by continuing that end's tangent —
  // "amount" is how far, in normalized units, past the last real point.
  // amount=0 just duplicates the endpoint (a closed end — no bleed).
  function extendEnd(points, atStart, amount) {
    const n = points.length;
    const a = atStart ? points[0] : points[n - 1];
    const b = atStart ? points[1] : points[n - 2];
    const dx = a[0] - b[0], dy = a[1] - b[1];
    const len = Math.hypot(dx, dy) || 1e-6;
    return [a[0] + (dx / len) * amount, a[1] + (dy / len) * amount];
  }
  function extendKeyframe(points, extStart, extEnd) {
    return [extendEnd(points, true, extStart), ...points, extendEnd(points, false, extEnd)];
  }

  // Every keyframe reads as a fragment of something larger: no loose ends
  // float mid-screen. Page curves bleed off both edges. The spiral's outer
  // arm bleeds off one edge; its inner/curled eye stays closed (a
  // zero-length duplicate, just to keep point counts equal across
  // keyframes so morphing can lerp index-for-index).
  const PREPEND_COUNT = 1;
  const MID_CORE_INDEX = Math.floor(P / 2);       // 128 — the curve's middle sample
  const INNER_CORE_INDEX = P - 1;                 // 255 — the last real sample (page edge, or the coil's eye)
  const MID_ARRAY_INDEX = PREPEND_COUNT + MID_CORE_INDEX;
  const INNER_ARRAY_INDEX = PREPEND_COUNT + INNER_CORE_INDEX;

  const pageKeyframes = CURVES.map((c) => toPoints(upsampleCurve(c, P))).map((pts) => extendKeyframe(pts, EXT, EXT));
  const spiralKeyframe = extendKeyframe(goldenKeyframe(P), EXT, 0);

  // Keyframe order: [page2, page3, page4, page5, page6, page7, page8, SPIRAL] — indices 0..7.
  const KEYFRAMES = pageKeyframes.concat([spiralKeyframe]);
  const NUM_SEGMENTS = KEYFRAMES.length - 1; // 7

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function lerpPoints(A, B, t) {
    const out = new Array(A.length);
    for (let i = 0; i < A.length; i++) {
      out[i] = [A[i][0] + (B[i][0] - A[i][0]) * t, A[i][1] + (B[i][1] - A[i][1]) * t];
    }
    return out;
  }

  // Continuous leg parameter L in [0,1]: L=0 is page 2, L=1 is the golden
  // spiral. The 8 keyframes sit at L = k/7.
  function pointsAtL(L) {
    const Lc = L < 0 ? 0 : L > 1 ? 1 : L;
    const segF = Lc * NUM_SEGMENTS;
    let seg = Math.floor(segF);
    if (seg >= NUM_SEGMENTS) seg = NUM_SEGMENTS - 1;
    const t = easeInOut(segF - seg);
    return lerpPoints(KEYFRAMES[seg], KEYFRAMES[seg + 1], t);
  }

  // Sample a point at a fractional array index (linear interp between the
  // two nearest real points) — used to find the anchor between the mid
  // sample and the inner eye.
  function sampleAtIndex(points, idx) {
    const i0 = Math.floor(idx);
    const i1 = Math.min(points.length - 1, i0 + 1);
    const t = idx - i0;
    return [points[i0][0] + (points[i1][0] - points[i0][0]) * t, points[i0][1] + (points[i1][1] - points[i0][1]) * t];
  }

  const BELL_L = 6 / 7; // page-8 balanced bell
  // Anchor parameter: 0.5 = mid sample (pages ride centered as before);
  // eases to 1.0 = inner eye as L crosses the bell into the spiral, so the
  // coil's eye ends up sitting directly under the centered orb.
  function anchorParam(L) {
    if (L <= BELL_L) return 0.5;
    return 0.5 + 0.5 * easeInOut((L - BELL_L) / (1 - BELL_L));
  }
  function anchorPoint(points, param) {
    const idx = MID_ARRAY_INDEX + (INNER_ARRAY_INDEX - MID_ARRAY_INDEX) * (param - 0.5) / 0.5;
    return sampleAtIndex(points, idx);
  }

  // Forward tempo: two slow zones (a brief bell breath, a long curl-up into
  // the coil), clamped so speed never reaches zero. Backward tempo is flat
  // and fast — the coil unwinds briskly (the dreamy lag is applied at
  // render time via Lsmoothed, not here).
  function speedFwd(L) {
    const dipBell = 0.80 * Math.exp(-((L - BELL_L) ** 2) / (2 * 0.05 ** 2));
    const dipCurl = 0.90 * Math.exp(-((L - 0.95) ** 2) / (2 * 0.10 ** 2));
    return 1 - Math.min(0.96, dipBell + dipCurl);
  }
  function speedBack() {
    return 1;
  }

  // Calibrate NORM once per direction so a full leg takes ~LEG_SECONDS(_BACK),
  // by numerically averaging 1/speed(L) over the leg (midpoint rule).
  function calibrateNorm(speedFn, steps) {
    let sum = 0;
    for (let i = 0; i < steps; i++) sum += 1 / speedFn((i + 0.5) / steps);
    return sum / steps;
  }
  const NORM_FWD = calibrateNorm(speedFwd, 4000);
  const NORM_BACK = calibrateNorm(speedBack, 200);

  // ── state ──
  let W = 0, H = 0, cx = 0, cy = 0, dpr = 1;
  let calm = document.body.classList.contains('calm-mode');
  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frozen = reduced;
  let hidden = document.hidden;
  let rafId = null;
  let lastTs = null;

  // Calm mode (repurposed): the star freezes and rides the scrollbar — low and
  // behind the hills at the top of the page, climbing toward the top as the
  // reader scrolls. calmBlend eases the effect in/out; scrollP is 0..1 page
  // scroll. calmCy() is the scroll-driven orb center used while calm.
  let calmBlend = calm ? 1 : 0;
  let scrollP = 0;
  let scrollTicking = false;
  function calmCy() {
    const base = H * CY_FACTOR;
    return base + (H * (0.90 - 0.80 * scrollP) - base) * calmBlend;
  }
  // About page: the star always rides the scrollbar (its own sun-arc
  // conceit, paired with the sunrise->sunset sky) — no calm-mode gating,
  // unlike calmCy() above, since this is the page's baseline behavior, not
  // an optional mode. Same low-to-high climb as calmCy() uses while calm.
  function aboutCy() {
    return H * (0.90 - 0.80 * scrollP);
  }
  function orbCy() {
    return isAboutPage() ? aboutCy() : calmCy();
  }
  // Faint fog hugging whichever edge the star is currently near — driven
  // directly off scrollP (no extra lerp) so it tracks scroll swiftly rather
  // than lagging behind like the star's own eased calmBlend position.
  // calmBlend gates it to calm mode, easing in/out with everything else.
  function updateMist() {
    if (!mistBottom || !mistTop) return;
    mistBottom.style.opacity = calmBlend * (1 - scrollP);
    mistTop.style.opacity = calmBlend * scrollP;
  }
  function readScroll() {
    const max = (document.documentElement.scrollHeight || 0) - window.innerHeight;
    scrollP = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    scrollTicking = false;
    updateMist();
    if (frozen) drawStatic(); // rAF loop is off under reduced-motion; redraw so the star still tracks
  }
  window.addEventListener('scroll', () => {
    if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(readScroll); }
  }, { passive: true });

  // phase machine: fwd1 (0->bell) -> holdBell -> fwd2 (bell->1) -> holdCoil
  // (humming) -> back (1->0, fast physics but a laggy dreamy render) ->
  // loop to fwd1. Only the forward pass holds; the return is unbroken.
  let phase = 'fwd1';
  let L = 0;
  let Lsmoothed = 0; // what's actually rendered — lags behind L only during 'back'
  let holdElapsed = 0;
  let legSecondsFwd, legSecondsBack, holdBellS, holdCoilS;

  // Beat clock: continuously accumulated (never hard-switched), gently
  // slewed toward real audio position when #calmAudio is playing — a
  // source-switch on every play/pause would snap discontinuously.
  let freeBeatClock = 0;
  // Hum phase: accumulated by delta each frame so a mid-hold frequency
  // change (calm/reading toggling) changes its rate, not its value.
  let humPhaseAccum = 0;
  // Music gate: how much of reading-mode's "dancing" (strand wobble, boosted
  // star pulse) should show, 0..1. Slewed rather than snapped so muting mid-
  // read fades the motion out instead of freezing it instantly.
  const MUSIC_GATE_SLEW_K = 0.04;
  let musicGate = 0;
  function updateTimings() {
    // The gentle reading-mode pace is now the universal default everywhere
    // (the "dancing lines" are site-wide, not blog-only). Calm mode keeps the
    // harsher near-freeze on top, since its lines are scroll-driven and mostly
    // straightened rather than travelling.
    const mult = calm ? CALM_MULT : READING_MULT;
    legSecondsFwd = LEG_SECONDS * mult;
    legSecondsBack = LEG_SECONDS_BACK * mult;
    holdBellS = HOLD_BELL_S * mult;
    holdCoilS = HOLD_COIL_S * mult;
  }
  updateTimings();

  // Orb theme crossfade (sun ↔ moon), ~0.6s, matching the CSS theme transition.
  let themeMix = root.getAttribute('data-theme') === 'dark' ? 1 : 0;
  let themeFrom = themeMix, themeTo = themeMix, themeFadeStart = null;
  const THEME_FADE_MS = 600;

  let cs; // computed style, refreshed once per paint so CSS vars can change live
  const v = (name) => (cs.getPropertyValue(name) || '').trim();

  // ── cross-page continuity ──
  // Every navigation is a full reload, so without this the canvas would
  // restart at page 2 and "splash" on every click. Persist just enough of
  // the phase machine to sessionStorage (per-tab, throttled) and resume
  // from it on the next page's load instead of starting fresh.
  const STORE_KEY = 'spiral-phase-v1';
  const VALID_PHASES = ['fwd1', 'holdBell', 'fwd2', 'holdCoil', 'back'];
  let lastSaveTs = 0;
  function saveState(now) {
    if (now - lastSaveTs < 250) return;
    lastSaveTs = now;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ phase, L, Lsmoothed, holdElapsed }));
    } catch (e) {}
  }
  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (
        VALID_PHASES.indexOf(s.phase) === -1 ||
        typeof s.L !== 'number' || !(s.L >= 0 && s.L <= 1) ||
        typeof s.Lsmoothed !== 'number' || !(s.Lsmoothed >= 0 && s.Lsmoothed <= 1) ||
        typeof s.holdElapsed !== 'number' || !(s.holdElapsed >= 0)
      ) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  // Light theme reads pale — cap the dreaminess so return-leg text stays
  // legible. The about-page override is always dark/warm regardless of
  // data-theme, so it gets the full dark-mode effect too.
  function isLightMode() {
    return root.getAttribute('data-theme') !== 'dark' && root.getAttribute('data-page') !== 'about';
  }

  // About keeps its own fixed warm-clay palette (--orb/--spiral-line) —
  // every other page presents the orb + curve as Chitra, weather-hued.
  function isAboutPage() {
    return root.getAttribute('data-page') === 'about';
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H * CY_FACTOR;
    if (frozen) drawStatic();
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lerpHex(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
  // scrollP=0 (top of page) reads as sunrise; scrollP=1 (bottom) as sunset —
  // reading through the page plays out like a day turning toward dusk.
  function aboutSkyColors() {
    const t = Math.max(0, Math.min(1, scrollP));
    return [
      lerpHex(ABOUT_SUNRISE_SKY[0], ABOUT_SUNSET_SKY[0], t),
      lerpHex(ABOUT_SUNRISE_SKY[1], ABOUT_SUNSET_SKY[1], t),
    ];
  }

  function paintSky(alpha) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (isAboutPage()) {
      const [top, bottom] = aboutSkyColors();
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
    } else {
      g.addColorStop(0, v('--sky-top') || '#F0EAD6');
      g.addColorStop(1, v('--sky-bottom') || '#A28F9D');
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Chitra: the star's live weather color, shown everywhere except the About
  // page (see fetch-weather.js + base.njk), a bare "r,g,b" triplet like
  // --spiral-line already is.
  function chitraRgb() {
    const raw = v('--chitra-color-rgb') || '214,40,40';
    return raw.split(',').map(Number);
  }

  // Standard 0-255 rgb <-> {h:0-360, s:0-1, l:0-1} conversions, used only to
  // fan reading-mode strands out into subtle hue variants of Chitra's color.
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToRgb(h, s, l) {
    if (s === 0) { const gray = Math.round(l * 255); return [gray, gray, gray]; }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hn = h / 360;
    return [
      Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, hn) * 255),
      Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
    ];
  }

  // Translate the curve so `anchor` lands exactly under the orb, then
  // stroke it as a smoothed path (quadratic curves through consecutive
  // midpoints — cheap, never overshoots, kills the faceted-chord look).
  // `hum` wraps a small breathing scale + rotation around the orb, used
  // only while the coil is held. `style` carries the return leg's dreamy
  // trail/opacity ramp (absent = forward defaults). `rgbOverride` lets
  // reading-mode's multiple strands (drawStrands, below) each paint in
  // their own harmonious color instead of --spiral-line.
  function strokeMorph(points, anchor, hum, style, rgbOverride) {
    const rgb = rgbOverride || v('--spiral-line') || '214,40,40';
    const baseAlpha = parseFloat(v('--spiral-alpha')) || 0.42;
    const crispAlpha = baseAlpha * (style ? style.crispMult : 1);
    const underWidth = 11 + (style ? style.underWidthExtra : 0);

    const screenPts = points.map((p) => [
      cx + (p[0] - anchor[0]) * W * SCALE_X,
      cy - (p[1] - anchor[1]) * H * SCALE_Y,
    ]);

    ctx.save();
    if (hum) {
      ctx.translate(cx, cy);
      ctx.rotate(hum.rot);
      ctx.scale(hum.scale, hum.scale);
      ctx.translate(-cx, -cy);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(screenPts[0][0], screenPts[0][1]);
    for (let i = 1; i < screenPts.length - 1; i++) {
      const mx = (screenPts[i][0] + screenPts[i + 1][0]) / 2;
      const my = (screenPts[i][1] + screenPts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(screenPts[i][0], screenPts[i][1], mx, my);
    }
    ctx.lineTo(screenPts[screenPts.length - 1][0], screenPts[screenPts.length - 1][1]);

    // the crisp core line stays thin now that the filled bands (below)
    // carry the color — it's a fine outline, not the main event.
    ctx.lineWidth = underWidth;
    ctx.strokeStyle = `rgba(${rgb}, 0.14)`;
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(${rgb}, ${crispAlpha})`;
    ctx.stroke();
    ctx.restore();
  }

  // Analogous color-harmony step (see the HUE_STEP_DEG comment above):
  // index 0 is the base strand and never calls this; index >=1 alternates
  // sides of the base hue, growing outward, capped at HUE_MAX_SPREAD_DEG.
  function harmoniousHue(baseHue, index) {
    const pair = Math.ceil(index / 2);
    const direction = index % 2 === 1 ? 1 : -1;
    const offset = Math.min(pair * HUE_STEP_DEG, HUE_MAX_SPREAD_DEG) * direction;
    return ((baseHue + offset) % 360 + 360) % 360;
  }

  // The idle "dancing" wobble shared by every strand-like line on the site
  // (ring strands and the About page's twin alike): a small breathing scale
  // + rotation around `baseRotation`, phase-offset so multiple lines don't
  // move in lockstep. This baseline ambient wobble always runs, music or
  // not — only the coil-hold hum boost (`hum` set) is scaled by musicGate,
  // since that boost specifically exists to read as "synced to live audio."
  function computeStrandHum(baseRotation, phaseOffset, hum) {
    const strandPhase = humPhaseAccum + phaseOffset;
    const scaleAmp = hum ? HUM_SCALE_AMP * musicGate : IDLE_HUM_SCALE_AMP;
    const rotAmp = hum ? HUM_ROT_AMP * musicGate : IDLE_HUM_ROT_AMP;
    return {
      scale: 1 + scaleAmp * Math.sin(strandPhase),
      rot: baseRotation + rotAmp * Math.cos(strandPhase),
    };
  }

  // Rotates+scales an absolute screen point about (cx,cy) by the same
  // transform `hum` applies via ctx — used to build each strand's actual
  // on-screen points for the band fill below (fillBand needs real
  // coordinates for two strands at once, which a shared ctx transform can't
  // give us since each strand's rotation differs).
  function rotateScalePoint(px, py, hum) {
    const theta = hum ? hum.rot : 0;
    const s = hum ? hum.scale : 1;
    const dx = px - cx, dy = py - cy;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    return [cx + s * (dx * cos - dy * sin), cy + s * (dx * sin + dy * cos)];
  }

  // Resamples a polyline down to a fixed point count (evenly spaced by
  // fractional index, linearly interpolated) — band-fill polygons don't
  // need every point to read as smooth at this scale, and a fixed count
  // means any two arms (regardless of their original slice length) always
  // have matching lengths, so they can always be paired for a fill.
  function resamplePolyline(pts, count) {
    const n = pts.length;
    const out = new Array(count);
    for (let k = 0; k < count; k++) {
      const t = (k / (count - 1)) * (n - 1);
      const i0 = Math.floor(t), i1 = Math.min(n - 1, i0 + 1), f = t - i0;
      out[k] = [pts[i0][0] + (pts[i1][0] - pts[i0][0]) * f, pts[i0][1] + (pts[i1][1] - pts[i0][1]) * f];
    }
    return out;
  }

  function dist2(a, b) {
    const dx = a[0] - b[0], dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  // Finds how far (array-index-wise) a ray can extend from anchorIdx before
  // its on-screen distance from Chitra (cx,cy) exceeds reachPx, walking
  // outward on each side independently and stopping at the first point past
  // the limit. `screenPts` are pre-hum, anchor-centered screen coordinates
  // (rotation/scale from `hum` barely changes distance-from-center, so it's
  // fine to measure before that's applied). Assumes distance from the anchor
  // grows roughly monotonically moving outward, true for these gently traced
  // curves — a stray wiggle right at the cutoff just costs a slightly early
  // or late trim, never a visual glitch.
  function reachIndexRange(screenPts, anchorIdx, reachPx) {
    const distFromCenter = (p) => Math.hypot(p[0] - cx, p[1] - cy);
    let startIdx = anchorIdx;
    while (startIdx > 0 && distFromCenter(screenPts[startIdx - 1]) <= reachPx) startIdx--;
    let endIdx = anchorIdx;
    while (endIdx < screenPts.length - 1 && distFromCenter(screenPts[endIdx + 1]) <= reachPx) endIdx++;
    return [startIdx, endIdx];
  }

  // Fills the wedge/petal-shaped region between two ring-adjacent strands
  // with a gradient from one's color to the other's — the space *between*
  // the dancing strands reads as a solid color wash, not just two flat
  // lines. Gradient axis runs between each strand's centroid (not a point
  // near the shared center, which both strands pass close to and would
  // give a near-zero-length, unstable axis).
  function fillBand(ptsA, ptsB, rgbA, rgbB, alpha) {
    const n = ptsA.length;
    ctx.beginPath();
    ctx.moveTo(ptsA[0][0], ptsA[0][1]);
    // quadratic-through-midpoints on both legs — same smoothing strokeMorph
    // uses — so the fill's boundary reads as a curve, not a faceted polygon
    for (let i = 1; i < n - 1; i++) {
      const mx = (ptsA[i][0] + ptsA[i + 1][0]) / 2;
      const my = (ptsA[i][1] + ptsA[i + 1][1]) / 2;
      ctx.quadraticCurveTo(ptsA[i][0], ptsA[i][1], mx, my);
    }
    ctx.lineTo(ptsA[n - 1][0], ptsA[n - 1][1]);
    for (let i = n - 1; i > 0; i--) {
      const mx = (ptsB[i][0] + ptsB[i - 1][0]) / 2;
      const my = (ptsB[i][1] + ptsB[i - 1][1]) / 2;
      ctx.quadraticCurveTo(ptsB[i][0], ptsB[i][1], mx, my);
    }
    ctx.lineTo(ptsB[0][0], ptsB[0][1]);
    ctx.closePath();

    let sxA = 0, syA = 0, sxB = 0, syB = 0;
    for (let i = 0; i < n; i++) {
      sxA += ptsA[i][0]; syA += ptsA[i][1];
      sxB += ptsB[i][0]; syB += ptsB[i][1];
    }
    const g = ctx.createLinearGradient(sxA / n, syA / n, sxB / n, syB / n);
    g.addColorStop(0, `rgba(${rgbA}, ${alpha})`);
    g.addColorStop(1, `rgba(${rgbB}, ${alpha})`);
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Reading-mode only: one strand per blog post (POST_COUNT), all sharing
  // the same underlying morph geometry — "synchronous" — but each rotated
  // an even angle around the star and given its own hum phase offset, so
  // they read as dancing in harmony rather than one line traced N times.
  // The base strand (index 0) keeps Chitra's live weather color untouched;
  // every other strand is a harmonious nudge off it (harmoniousHue).
  // Ring-adjacent pairs (strands keep a fixed rotational spacing and never
  // cross, so "adjacent" is stable) get the space between them filled with
  // a gradient — see fillBand. Every strand's curve bleeds off both ends
  // and passes close to the shared anchor point in between, so each strand
  // is split at that anchor into its two arms first, and bands are filled
  // arm-to-arm rather than whole-curve-to-whole-curve — each arm alone
  // sweeps outward from center without crossing back, so the fill polygon
  // stays simple (no self-intersection, no gap at the crossover). Which of
  // the other strand's two arms actually sits on the same visible side
  // (and so is the one to fill against) depends on the rotation between
  // the pair — close together, same-named arms line up; far apart (e.g. a
  // 2-strand ring, 180 degrees), it's the opposite-named arm — so that's
  // picked per seam by comparing actual tip distances, not assumed by
  // name. When bands compete near the shared center, whichever pair is
  // rotating apart/together fastest *this frame* is filled last, i.e. on
  // top, so the liveliest seam always wins.
  function drawStrands(points, anchor, hum, style, anchorParamVal) {
    const N = Math.min(POST_COUNT, MAX_STRANDS);
    const [br, bg, bb] = chitraRgb();
    const [bh, bs, bl] = rgbToHsl(br, bg, bb);

    const basePts = points.map((p) => [
      cx + (p[0] - anchor[0]) * W * SCALE_X,
      cy - (p[1] - anchor[1]) * H * SCALE_Y,
    ]);

    // same index formula anchorPoint() uses — where in `basePts` the anchor
    // itself actually falls — then clamp every ray to STRAND_REACH_FRAC of
    // the viewport from that point (see reachIndexRange), so Chitra always
    // keeps clear background around her regardless of curve zoom or N.
    const idxF = MID_ARRAY_INDEX + (INNER_ARRAY_INDEX - MID_ARRAY_INDEX) * (anchorParamVal - 0.5) / 0.5;
    const anchorIdx = Math.max(0, Math.min(basePts.length - 1, Math.round(idxF)));
    const reachPx = STRAND_REACH_FRAC * Math.min(W, H);
    const [startIdx, endIdx] = reachIndexRange(basePts, anchorIdx, reachPx);
    const trimmedPoints = points.slice(startIdx, endIdx + 1);
    const trimmedBasePts = basePts.slice(startIdx, endIdx + 1);
    const trimmedAnchorIdx = anchorIdx - startIdx;

    const strands = new Array(N);
    for (let i = 0; i < N; i++) {
      const rotation = (2 * Math.PI * i) / N;
      const strandHum = computeStrandHum(rotation, rotation, hum);
      const [r, g, b] = i === 0 ? [br, bg, bb] : hslToRgb(harmoniousHue(bh, i), bs, bl);
      strands[i] = { hum: strandHum, rgb: `${r},${g},${b}`, phase: humPhaseAccum + rotation };
    }

    if (N > 1) {
      // Both arms are ordered center-first, tip-last (armStart's natural
      // slice order is tip-first, so it's reversed) — fillBand needs matching
      // directionality on both sides of a pairing, or its start/end edges
      // connect the wrong ends (a near-center point to a far-tip point).
      const arms = [
        resamplePolyline(trimmedBasePts.slice(0, trimmedAnchorIdx + 1).reverse(), BAND_ARM_POINTS),
        resamplePolyline(trimmedBasePts.slice(trimmedAnchorIdx), BAND_ARM_POINTS),
      ];
      const bandAlpha = isLightMode() ? 0.32 : 0.5;
      const edgeCount = N === 2 ? 1 : N; // a 2-strand ring has one seam, not two

      const bands = [];
      for (let i = 0; i < edgeCount; i++) {
        const j = (i + 1) % N;
        const activity = Math.abs(Math.sin(strands[i].phase) - Math.sin(strands[j].phase));

        // Tip = each arm's far (outer) point — now always the last element,
        // since both arms run center-first — actually rotated per-strand:
        // whichever pairing puts strand i's tips closest to strand j's
        // tips is the one that's visually adjacent, i.e. the real gap.
        const tip0i = rotateScalePoint(arms[0][arms[0].length - 1][0], arms[0][arms[0].length - 1][1], strands[i].hum);
        const tip1i = rotateScalePoint(arms[1][arms[1].length - 1][0], arms[1][arms[1].length - 1][1], strands[i].hum);
        const tip0j = rotateScalePoint(arms[0][arms[0].length - 1][0], arms[0][arms[0].length - 1][1], strands[j].hum);
        const tip1j = rotateScalePoint(arms[1][arms[1].length - 1][0], arms[1][arms[1].length - 1][1], strands[j].hum);
        const sameDist = dist2(tip0i, tip0j) + dist2(tip1i, tip1j);
        const crossDist = dist2(tip0i, tip1j) + dist2(tip1i, tip0j);
        const crossed = crossDist < sameDist;

        bands.push({ i, j, activity, armI: arms[0], armJ: crossed ? arms[1] : arms[0] });
        bands.push({ i, j, activity, armI: arms[1], armJ: crossed ? arms[0] : arms[1] });
      }
      bands.sort((a, b) => a.activity - b.activity);

      for (const { i, j, armI, armJ } of bands) {
        const ptsA = armI.map((p) => rotateScalePoint(p[0], p[1], strands[i].hum));
        const ptsB = armJ.map((p) => rotateScalePoint(p[0], p[1], strands[j].hum));
        fillBand(ptsA, ptsB, strands[i].rgb, strands[j].rgb, bandAlpha);
      }
    }

    for (let i = 0; i < N; i++) {
      strokeMorph(trimmedPoints, anchor, strands[i].hum, style, strands[i].rgb);
    }
  }

  // About page's own scene: two strands off the same fixed warm-clay hue —
  // a lighter and a darker shade of it, so the fill between them (below) is
  // a real (if subtle) gradient rather than one flat tint — fanned only a
  // couple degrees apart (ABOUT_TWIN_SPREAD_DEG) so they start together at
  // the star and drift just barely apart by the screen edge. Same idle
  // "dancing" wobble every other strand gets (computeStrandHum), and the
  // same arm-split gradient-band fill drawStrands uses for ring strands —
  // simpler here since a few-degree spread never needs the cross-arm
  // pairing check large rotations require (see drawStrands). Unlike
  // drawStrands, these twin strands are never STRAND_REACH_FRAC-clamped —
  // there's only ever two of them, so there's no risk of tiling the whole
  // background, and the design calls for them bleeding all the way to the
  // screen edges.
  function drawAboutStrands(points, anchor, hum, style, anchorParamVal) {
    const spreadRad = (ABOUT_TWIN_SPREAD_DEG * Math.PI) / 180;
    const offsets = [-spreadRad / 2, spreadRad / 2];
    const strandHums = offsets.map((offset, i) => computeStrandHum(offset, i * Math.PI, hum));

    const baseRgb = (v('--spiral-line') || '221,55,4').split(',').map(Number);
    const [bh, bs, bl] = rgbToHsl(baseRgb[0], baseRgb[1], baseRgb[2]);
    const shadeDelta = 0.12;
    const colors = [
      hslToRgb(bh, bs, Math.max(0, bl - shadeDelta)).join(','),
      hslToRgb(bh, bs, Math.min(1, bl + shadeDelta)).join(','),
    ];

    const basePts = points.map((p) => [
      cx + (p[0] - anchor[0]) * W * SCALE_X,
      cy - (p[1] - anchor[1]) * H * SCALE_Y,
    ]);
    const idxF = MID_ARRAY_INDEX + (INNER_ARRAY_INDEX - MID_ARRAY_INDEX) * (anchorParamVal - 0.5) / 0.5;
    const anchorIdx = Math.max(0, Math.min(basePts.length - 1, Math.round(idxF)));
    const arms = [
      resamplePolyline(basePts.slice(0, anchorIdx + 1).reverse(), BAND_ARM_POINTS),
      resamplePolyline(basePts.slice(anchorIdx), BAND_ARM_POINTS),
    ];
    for (const arm of arms) {
      const ptsA = arm.map((p) => rotateScalePoint(p[0], p[1], strandHums[0]));
      const ptsB = arm.map((p) => rotateScalePoint(p[0], p[1], strandHums[1]));
      fillBand(ptsA, ptsB, colors[0], colors[1], 0.4);
    }

    for (let i = 0; i < offsets.length; i++) {
      strokeMorph(points, anchor, strandHums[i], style, colors[i]);
    }
  }

  // `pulse` (0..1, default 0) is the beat envelope — a single uniform scale
  // around the orb's own center carries every fixed radius/offset below
  // along for free, so the moon-bite crescent never misaligns as it pulses.
  // Everywhere except the About page, the orb is presented as Chitra, a
  // named star (the one the blog's strands dance around, in reading mode)
  // — it takes her live weather color instead of the sun/moon theming.
  function drawOrb(pulse) {
    const star = !isAboutPage();
    const orbColor = star ? (v('--chitra-color') || '#D62828') : (v('--orb') || '#DD3704');
    const glow = star ? `rgba(${chitraRgb().join(',')},0.34)` : (v('--orb-glow') || 'rgba(221,55,4,0.50)');
    const shadow = v('--sky-top') || '#7A2E1D';

    ctx.save();
    // Reading mode's pulse boost is itself gated by musicGate — it fades to
    // fully still when music isn't audible, rather than settling back to the
    // sitewide default, since the boost exists specifically to say "this is
    // synced to real, currently-playing audio."
    const pulseAmp = star ? BEAT_PULSE_SCALE_AMP_READING * musicGate : BEAT_PULSE_SCALE_AMP;
    const beatScale = 1 + pulseAmp * (pulse || 0);
    ctx.translate(cx, cy);
    ctx.scale(beatScale, beatScale);
    ctx.translate(-cx, -cy);
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    rg.addColorStop(0, glow);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = orbColor;
    ctx.fill();

    // moon: a soft darker rim bite, faded in/out with the theme crossfade —
    // skipped while presented as Chitra, since a fixed star doesn't wax/wane
    if (themeMix > 0.01 && !star) {
      ctx.globalAlpha = 0.55 * themeMix;
      ctx.beginPath();
      ctx.arc(cx + 2.4, cy - 1.8, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = shadow;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(cx - 1.5, cy - 1.5, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.restore();
  }

  function updateThemeMix(now) {
    if (themeFadeStart === null) return;
    const t = Math.min(1, (now - themeFadeStart) / THEME_FADE_MS);
    themeMix = themeFrom + (themeTo - themeFrom) * t;
    if (t >= 1) themeFadeStart = null;
  }

  function frame(ts) {
    if (hidden) return;
    if (lastTs === null) lastTs = ts;
    const dtSec = (ts - lastTs) / 1000;
    lastTs = ts;

    cs = getComputedStyle(root);
    updateThemeMix(ts);

    // Beat clock: always advances by real elapsed time, then — only while
    // #calmAudio is actually playing — gently corrected toward its real
    // currentTime. Correcting rather than replacing means a play/pause
    // toggle never snaps the phase; it just changes how the clock is fed.
    freeBeatClock += dtSec;
    if (audioEl && !audioEl.paused) {
      freeBeatClock += (audioEl.currentTime - freeBeatClock) * BEAT_SLEW_K;
    }
    const beatPhase = (freeBeatClock / BEAT) % 1;
    const beatPulse = 0.5 * (1 + Math.cos(2 * Math.PI * beatPhase)); // peaks on the downbeat

    // Reading mode's "dancing" (strand wobble, boosted star pulse) should
    // only show while music is actually audible — slewed so muting/resuming
    // mid-read fades the motion rather than snapping it.
    const musicPlaying = !!(audioEl && !audioEl.paused);
    musicGate += ((musicPlaying ? 1 : 0) - musicGate) * MUSIC_GATE_SLEW_K;

    // Hum frequency locks to the bar (not the raw beat — a full-speed
    // beat-locked hum reads as a flutter, not a breath); calm/reading mode
    // drops to every 4th bar, close to the original ~0.15Hz slow breathing.
    // About page's twin strands dance 50% faster than everywhere else.
    const humFreqHz = ((calm || readingMode()) ? 1 / (4 * BAR) : 3 / (4 * BAR)) * (isAboutPage() ? 1.5 : 1);
    humPhaseAccum = (humPhaseAccum + dtSec * humFreqHz * 2 * Math.PI) % (2 * Math.PI);

    let hum = null;
    let trailAlpha = 0.30;
    let renderStyle = null;

    // Calm mode freezes the phase machine — the star (and its light) stops
    // travelling through the morph and instead just rides the scrollbar (see
    // the cy override below). Skip advancing L/phase entirely while calm.
    if (calm) {
      Lsmoothed = L;
    } else
    switch (phase) {
      case 'fwd1':
        L += (speedFwd(L) * dtSec) / legSecondsFwd * NORM_FWD;
        if (L >= BELL_L) { L = BELL_L; phase = 'holdBell'; holdElapsed = 0; }
        Lsmoothed = L;
        break;
      case 'holdBell':
        holdElapsed += dtSec;
        if (holdElapsed >= holdBellS) phase = 'fwd2';
        Lsmoothed = L;
        break;
      case 'fwd2':
        L += (speedFwd(L) * dtSec) / legSecondsFwd * NORM_FWD;
        if (L >= 1) { L = 1; phase = 'holdCoil'; holdElapsed = 0; }
        Lsmoothed = L;
        break;
      case 'holdCoil': {
        holdElapsed += dtSec;
        hum = { scale: 1 + HUM_SCALE_AMP * Math.sin(humPhaseAccum), rot: HUM_ROT_AMP * Math.cos(humPhaseAccum) };
        if (holdElapsed >= holdCoilS) phase = 'back';
        Lsmoothed = L;
        break;
      }
      case 'back': {
        L -= (speedBack() * dtSec) / legSecondsBack * NORM_BACK;
        if (L < 0) L = 0;
        Lsmoothed += (L - Lsmoothed) * LOWPASS_K;
        if (Lsmoothed <= 0.01) { L = 0; Lsmoothed = 0; phase = 'fwd1'; break; }

        // dreamy return: peaks just after leaving the coil, eases back to normal by page 2
        const d = smoothstep(0.15, 0.95, Lsmoothed);
        const light = isLightMode();
        const trailFloor = light ? 0.20 : 0.08;
        const crispFloor = light ? 0.75 : 0.55;
        trailAlpha = 0.30 - (0.30 - trailFloor) * d;
        renderStyle = { crispMult: 1 - (1 - crispFloor) * d, underWidthExtra: 6 * d };
        break;
      }
    }

    saveState(ts);

    // don't clear — repaint the sky at partial alpha over the last frame.
    // fast/crisp stretches leave motion-blur streaks; slow holds resolve
    // crisp; the return leg's low trailAlpha smears into long dream-trails.
    // Calm mode: the frozen star rides the scrollbar. At the top of the page it
    // sits low, behind the hills (the .scene-ridge DOM layer paints above the
    // canvas and occludes it); as the reader scrolls down it climbs toward the
    // top. cy drives both the orb and its strands (they anchor to cy), and the
    // glow is fattened/dimmed so the heavy CSS blur reads as soft light.
    paintSky(trailAlpha);
    calmBlend += ((calm ? 1 : 0) - calmBlend) * 0.08;
    cy = orbCy();
    updateMist();
    let pts = pointsAtL(Lsmoothed);
    if (calmBlend > 0.001) {
      renderStyle = {
        crispMult: (renderStyle ? renderStyle.crispMult : 1) * (1 - 0.7 * calmBlend),
        underWidthExtra: (renderStyle ? renderStyle.underWidthExtra : 0) + 22 * calmBlend,
      };
    }
    const aParam = anchorParam(Lsmoothed);
    const anchor = anchorPoint(pts, aParam);
    // one strand per blog post, site-wide now (About keeps its own twin-
    // strand scene, same warm-clay palette).
    if (!isAboutPage()) {
      drawStrands(pts, anchor, hum, renderStyle, aParam);
    } else {
      drawAboutStrands(pts, anchor, hum, renderStyle, aParam);
    }
    drawOrb(beatPulse);

    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    cs = getComputedStyle(root);
    calmBlend = calm ? 1 : 0; // no rAF easing here — snap to target
    cy = orbCy();              // still track the scrollbar under reduced-motion
    updateMist();
    ctx.clearRect(0, 0, W, H);
    paintSky(1);
    const pts = KEYFRAMES[6]; // page 8, the balanced bell — exact keyframe, no interpolation, no hum
    const anchor = anchorPoint(pts, 0.5);
    if (!isAboutPage()) {
      drawStrands(pts, anchor, null, null, 0.5);
    } else {
      drawAboutStrands(pts, anchor, null, null, 0.5);
    }
    drawOrb();
  }

  function readingMode() {
    return root.classList.contains('reading-mode');
  }

  function start() {
    if (rafId || frozen || hidden) return;
    lastTs = null; // don't count paused/hidden time as elapsed motion
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function setFrozen(f) {
    frozen = f;
    if (frozen) { stop(); drawStatic(); } else { start(); }
  }

  // ── live state observers ──
  new MutationObserver(() => {
    const dark = root.getAttribute('data-theme') === 'dark';
    themeFrom = themeMix;
    themeTo = dark ? 1 : 0;
    if (frozen) {
      themeMix = themeTo;
      themeFadeStart = null;
      drawStatic();
    } else {
      themeFadeStart = performance.now();
    }
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // v9: reader mode no longer pauses the loop — it only slows it (via
  // updateTimings, above) while CSS blurs/washes the scene into an amber glow.
  // A quiet easter egg rides along: hovering the scene in reading mode
  // reveals the star's name via the canvas's native title tooltip (the
  // .scene wrapper is aria-hidden, so this is a mouse-only nod — the
  // About page carries the accessible version of this mention).
  new MutationObserver(() => {
    updateTimings();
    canvas.title = readingMode() ? 'chitra — the star this whole site quietly orbits' : '';
  }).observe(root, { attributes: true, attributeFilter: ['class'] });

  new MutationObserver(() => {
    calm = document.body.classList.contains('calm-mode');
    updateTimings(); // L and phase/holdElapsed are preserved, so this doesn't jump
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    reduced = e.matches;
    setFrozen(reduced);
  });

  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) stop();
    else start();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  resize();
  canvas.title = readingMode() ? 'chitra — the star this whole site quietly orbits' : '';
  const restored = loadState();
  if (restored) {
    phase = restored.phase;
    L = restored.L;
    Lsmoothed = restored.Lsmoothed;
    holdElapsed = restored.holdElapsed;
  } else {
    phase = 'fwd1';
    L = 0; Lsmoothed = 0; holdElapsed = 0; // start on page 2 (uphill) — where the sketch begins
  }
  if (frozen) drawStatic();
  else start();

  // Fade-in cloak: even the first paint eases in, no pop on load or nav.
  requestAnimationFrame(() => canvas.classList.add('ready'));
})();
