// ── background scene: morph through the owner's traced curves, then coil, then ping-pong ──
// One canvas, no dependencies. The orb is pinned to screen center at all
// times — the curve translates and morphs *under* it. There is no
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
  const SCALE_X = 0.9;           // curve width as a fraction of viewport width
  const SCALE_Y = 0.72;          // curve height as a fraction of viewport height
  const CY_FACTOR = 0.52;        // orb's vertical position as a fraction of viewport height
  const LEG_SECONDS = 14;        // base one-way traverse time (page2 -> spiral)
  const CALM_LEG_SECONDS = LEG_SECONDS * 25; // calm mode: very slow, meditative
  const BELL_L = 6 / 7;          // page-8 balanced bell — the resting point of the tempo dip
  const DIP_DEPTH = 0.86;        // how much the tempo slows at the bell (0..1)
  const DIP_WIDTH = 0.12;        // sigma of the slowdown, in L-units

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

  // The 8th keyframe: the bell's line curls up into a golden coil.
  // Log spiral, K = ln(phi)/(pi/2) — kept for reference even though the
  // radius falloff below is the empirical 0.05^f the owner tuned by eye.
  // cx/cy/base are biased low-right per the reference frame: the coil sits
  // near the orb, the outer arm runs off toward the bottom-right, and
  // points are allowed to extend past [0,1] on purpose — do not clamp.
  function goldenKeyframe() {
    const N = 40, cx = 0.40, cy = 0.66, base = 0.5;
    const K = Math.log(1.6180339887) / (Math.PI / 2);
    const pts = [];
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      const th = f * 2.7 * Math.PI + 0.4;
      const r = base * Math.pow(0.05, f);
      pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
    }
    return pts;
  }

  function toPoints(curve) {
    return curve.map((y, i) => [i / 39, y]);
  }

  // Keyframe order: [page2, page3, page4, page5, page6, page7, page8, SPIRAL] — indices 0..7.
  const KEYFRAMES = CURVES.map(toPoints).concat([goldenKeyframe()]);
  const NUM_SEGMENTS = KEYFRAMES.length - 1; // 7

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

  // Gaussian-dip velocity: ~1 away from the bell, ~(1-DIP_DEPTH) right at
  // it — fast through the early beats, a deep slow-motion hold at the
  // page-8 bell, fast again out into the spiral. Same shape on both legs
  // of the ping-pong, since speed() only depends on position, not direction.
  function speed(L) {
    const dip = DIP_DEPTH * Math.exp(-((L - BELL_L) ** 2) / (2 * DIP_WIDTH ** 2));
    return 1 - dip;
  }

  // Calibrate NORM once so a full one-way leg (L: 0->1) takes ~LEG_SECONDS,
  // by numerically averaging 1/speed(L) over the leg (midpoint rule).
  const NORM = (() => {
    const STEPS = 2000;
    let sum = 0;
    for (let i = 0; i < STEPS; i++) sum += 1 / speed((i + 0.5) / STEPS);
    return sum / STEPS;
  })();

  // ── state ──
  let W = 0, H = 0, cx = 0, cy = 0, dpr = 1;
  let calm = document.body.classList.contains('calm-mode');
  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let legSeconds = calm ? CALM_LEG_SECONDS : LEG_SECONDS;
  let frozen = reduced;
  let hidden = document.hidden;
  let rafId = null;
  let L = 0;     // 0 = page 2, 1 = golden spiral
  let dir = 1;   // +1 forward, -1 backward — flips at either end, ping-pong forever
  let lastTs = null;

  // Orb theme crossfade (sun ↔ moon), ~0.6s, matching the CSS theme transition.
  let themeMix = root.getAttribute('data-theme') === 'dark' ? 1 : 0;
  let themeFrom = themeMix, themeTo = themeMix, themeFadeStart = null;
  const THEME_FADE_MS = 600;

  let cs; // computed style, refreshed once per paint so CSS vars can change live
  const v = (name) => (cs.getPropertyValue(name) || '').trim();

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

  // Map the 40 morphed points to screen so the middle sample (index 20)
  // always sits under the fixed orb — as the curve morphs, yMid shifts and
  // the whole line slides vertically beneath the pinned orb.
  function strokeMorph(points) {
    const yMid = points[20][1];
    const rgb = v('--spiral-line') || '62,107,84';
    const a = parseFloat(v('--spiral-alpha')) || 0.42;

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const sx = cx + (points[i][0] - 0.5) * W * SCALE_X;
      const sy = cy - (points[i][1] - yMid) * H * SCALE_Y;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.lineWidth = 11;
    ctx.strokeStyle = `rgba(${rgb}, 0.14)`;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${rgb}, ${a})`;
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
    const dt = ts - lastTs;
    lastTs = ts;

    cs = getComputedStyle(root);
    updateThemeMix(ts);

    L += dir * speed(L) * (dt / 1000) / legSeconds * NORM;
    if (L >= 1) { L = 1; dir = -1; }
    else if (L <= 0) { L = 0; dir = 1; }

    // don't clear — repaint the sky at partial alpha over the last frame.
    // fast stretches leave motion-blur streaks; the bell slow-mo resolves crisp.
    paintSky(0.30);
    strokeMorph(pointsAtL(L));
    drawOrb();

    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    cs = getComputedStyle(root);
    ctx.clearRect(0, 0, W, H);
    paintSky(1);
    strokeMorph(KEYFRAMES[6]); // page 8, the balanced bell — exact keyframe, no interpolation
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
    legSeconds = calm ? CALM_LEG_SECONDS : LEG_SECONDS; // L is preserved, so this doesn't jump
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
  L = 0;
  dir = 1; // start on page 2 (uphill), moving forward — where the sketch begins
  if (frozen) drawStatic();
  else start();
})();
