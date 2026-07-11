// ── background scene: morph through the owner's traced curves, then coil, then ping-pong ──
// One canvas, no dependencies. The orb is pinned to screen center at all
// times — it never reads a curve coordinate. The curve is translated so a
// moving anchor point lands under it, and morphs as it goes. There is no
// parametric spiral camera, no rotation, and no infinite self-similar zoom.
// Theme, calm-mode, and reading-mode are read live via MutationObserver, so
// this file needs no wiring from site.js. Audio playback lives in site.js
// instead (autoplay needs a real click gesture, which the calm-toggle
// handler already has).
(function () {
  const canvas = document.getElementById('sceneSky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;

  // ── tuning knobs ──
  const SCALE_X = 0.9;            // curve width as a fraction of viewport width
  const SCALE_Y = 0.72;           // curve height as a fraction of viewport height
  const CY_FACTOR = 0.52;         // orb's vertical position as a fraction of viewport height
  const EXT = 0.5;                // how far (normalized units) open ends bleed past the viewport
  const P = 256;                  // resampled point count shared by every keyframe

  const LEG_SECONDS = 14;         // forward travel time (page2 -> spiral), holds excluded
  const LEG_SECONDS_BACK = 7;     // return leg: fast, flat unwind (before the low-pass lag)
  const HOLD_BELL_S = 0.6;        // brief near-stop breath at the page-8 bell
  const HOLD_COIL_S = 2.0;        // longer humming drift-hold at the golden coil
  const CALM_MULT = 25;           // calm mode scales every duration above by this

  const HUM_FREQ_HZ = 0.15;       // the coil's living hum while held, ~0.1-0.2Hz
  const HUM_SCALE_AMP = 0.015;    // breathing scale, 1.00 <-> 1.015 (sub-2%)
  const HUM_ROT_AMP = (0.5 * Math.PI) / 180; // +/- 0.5 degrees

  const LOWPASS_K = 0.06;         // return-leg lag: smaller = laggier/floatier

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

  // phase machine: fwd1 (0->bell) -> holdBell -> fwd2 (bell->1) -> holdCoil
  // (humming) -> back (1->0, fast physics but a laggy dreamy render) ->
  // loop to fwd1. Only the forward pass holds; the return is unbroken.
  let phase = 'fwd1';
  let L = 0;
  let Lsmoothed = 0; // what's actually rendered — lags behind L only during 'back'
  let holdElapsed = 0;
  let legSecondsFwd, legSecondsBack, holdBellS, holdCoilS;
  function updateTimings() {
    const mult = calm ? CALM_MULT : 1;
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

  // Light theme reads pale — cap the dreaminess so return-leg text stays
  // legible. The about-page override is always dark/warm regardless of
  // data-theme, so it gets the full dark-mode effect too.
  function isLightMode() {
    return root.getAttribute('data-theme') !== 'dark' && root.getAttribute('data-page') !== 'about';
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

  function paintSky(alpha) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, v('--sky-top') || '#DDE4D2');
    g.addColorStop(1, v('--sky-bottom') || '#C4D0BA');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Translate the curve so `anchor` lands exactly under the orb, then
  // stroke it as a smoothed path (quadratic curves through consecutive
  // midpoints — cheap, never overshoots, kills the faceted-chord look).
  // `hum` wraps a small breathing scale + rotation around the orb, used
  // only while the coil is held. `style` carries the return leg's dreamy
  // trail/opacity ramp (absent = forward defaults).
  function strokeMorph(points, anchor, hum, style) {
    const rgb = v('--spiral-line') || '62,107,84';
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

    ctx.lineWidth = underWidth;
    ctx.strokeStyle = `rgba(${rgb}, 0.14)`;
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = `rgba(${rgb}, ${crispAlpha})`;
    ctx.stroke();
    ctx.restore();
  }

  function drawOrb() {
    const orbColor = v('--orb') || '#E9A23B';
    const glow = v('--orb-glow') || 'rgba(233,162,59,0.3)';
    const shadow = v('--sky-top') || '#0A130F';

    ctx.save();
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

    // moon: a soft darker rim bite, faded in/out with the theme crossfade
    if (themeMix > 0.01) {
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

    let hum = null;
    let trailAlpha = 0.30;
    let renderStyle = null;

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
        const humPhase = holdElapsed * HUM_FREQ_HZ * 2 * Math.PI;
        hum = { scale: 1 + HUM_SCALE_AMP * Math.sin(humPhase), rot: HUM_ROT_AMP * Math.cos(humPhase) };
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

    // don't clear — repaint the sky at partial alpha over the last frame.
    // fast/crisp stretches leave motion-blur streaks; slow holds resolve
    // crisp; the return leg's low trailAlpha smears into long dream-trails.
    paintSky(trailAlpha);
    const pts = pointsAtL(Lsmoothed);
    strokeMorph(pts, anchorPoint(pts, anchorParam(Lsmoothed)), hum, renderStyle);
    drawOrb();

    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    cs = getComputedStyle(root);
    ctx.clearRect(0, 0, W, H);
    paintSky(1);
    const pts = KEYFRAMES[6]; // page 8, the balanced bell — exact keyframe, no interpolation, no hum
    strokeMorph(pts, anchorPoint(pts, 0.5), null, null);
    drawOrb();
  }

  function readingMode() {
    return root.classList.contains('reading-mode');
  }

  function start() {
    if (rafId || frozen || hidden || readingMode()) return;
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

  // reader mode hides .scene entirely (CSS) — just pause the loop to save cycles
  new MutationObserver(() => {
    if (readingMode()) stop();
    else if (!frozen) start();
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
  phase = 'fwd1';
  L = 0; Lsmoothed = 0; // start on page 2 (uphill), moving forward — where the sketch begins
  if (frozen) drawStatic();
  else start();
})();
