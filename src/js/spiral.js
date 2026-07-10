// ── background scene: golden spiral, fixed sun/moon pivot ──
// One canvas, no dependencies. The orb is pinned to screen center and never
// moves or scales — the curve pans and scales underneath it (a dolly-zoom,
// not a rotation). Theme, calm-mode, and reading-mode are read live via
// MutationObserver, so this file needs no wiring from site.js. Audio
// playback lives in site.js instead (autoplay needs a real click gesture,
// which the calm-toggle handler already has).
(function () {
  const canvas = document.getElementById('sceneSky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;

  // ── tuning knobs ──
  const ROUND_TRIP_MS = 24000;          // one full zoom-in → zoom-out → zoom-in cycle
  const CALM_ROUND_TRIP_MS = 7 * 60 * 1000; // calm mode: very slow, meditative
  const SCALE_IN_FACTOR = 0.34;         // × max(W,H): camera scale at u=0 (zoomed in tight)
  const SCALE_OUT_FACTOR = 0.045;       // × max(W,H): camera scale at u=1 (bell + tail fills frame)
  const BEATS = 7;                      // matches the wobble's 7-part life-arc shape
  const FOCUS_BEAT_IN = 1;              // "uphill" beat — where the camera starts, zoomed in
  const FOCUS_BEAT_OUT = BEATS - 1;     // balanced-arch / bell-apex beat — fully zoomed out

  // Golden spiral r(θ) = e^(Kθ).
  const K = Math.log(1.6180339887) / (Math.PI / 2);

  // A 2π-periodic wobble on top of the pure spiral — this is the "life arc"
  // the arm reads as it sweeps past center: rise, crest, dip, valley, climb, arch.
  const WOBBLE_AMP = 0.14;
  function wobble(theta) {
    const phi = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return 0.6 * Math.sin(phi) + 0.25 * Math.sin(2 * phi - 0.6) + 0.15 * Math.sin(3 * phi + 1.1);
  }
  function curvePoint(theta) {
    const r = Math.exp(K * theta) * (1 + WOBBLE_AMP * wobble(theta));
    return [Math.cos(theta) * r, Math.sin(theta) * r];
  }

  // Precompute the polyline once, across many turns, so no end is ever visible.
  // Flat [x0,y0,x1,y1,...] pairs — cheaper to walk than an array of arrays.
  const THETA_MIN = -26, THETA_MAX = 18, THETA_STEP = 0.02;
  const points = [];
  for (let th = THETA_MIN; th <= THETA_MAX; th += THETA_STEP) {
    const [x, y] = curvePoint(th);
    points.push(x, y);
  }

  // The focus path: a segment of the curve itself, from the "uphill" beat
  // to the balanced-arch/bell-apex beat. The camera glides along this as u
  // goes 0→1, so zoom and pan happen together (a dolly-zoom).
  const TARGETS = Array.from({ length: BEATS }, (_, i) => (i / BEATS) * Math.PI * 2);
  const FOCUS_THETA_START = TARGETS[FOCUS_BEAT_IN];
  const FOCUS_THETA_END = TARGETS[FOCUS_BEAT_OUT];

  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Ping-pong 0→1→0 with zero velocity at both turnarounds (easeInOutCubic's
  // derivative vanishes at 0 and 1), so the bounce is smooth by construction
  // — no snap, no special-casing needed at the ends.
  function pingPongU(phase) {
    const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    return easeInOutCubic(tri);
  }

  // Camera state at a given u: focus point travels along the curve,
  // scale interpolates in log-space so the zoom reads as linear to the eye.
  function stateAt(u) {
    const theta = FOCUS_THETA_START + (FOCUS_THETA_END - FOCUS_THETA_START) * u;
    const [fx, fy] = curvePoint(theta);
    const scale = scaleInPx * Math.pow(scaleOutPx / scaleInPx, u);
    return { fx, fy, scale };
  }

  // ── state ──
  let W = 0, H = 0, cx = 0, cy = 0, scaleInPx = 0, scaleOutPx = 0, dpr = 1;
  let calm = document.body.classList.contains('calm-mode');
  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let roundTripMs = calm ? CALM_ROUND_TRIP_MS : ROUND_TRIP_MS;
  let frozen = reduced;
  let hidden = document.hidden;
  let rafId = null;
  let phase = 0;     // 0..1 position in the round trip — persists across period changes
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
    cy = H * 0.5;
    scaleInPx = Math.max(W, H) * SCALE_IN_FACTOR;
    scaleOutPx = Math.max(W, H) * SCALE_OUT_FACTOR;
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

  function strokeSpiral(state) {
    const { fx, fy, scale } = state;
    const rgb = v('--spiral-line') || '62,107,84';
    const a = parseFloat(v('--spiral-alpha')) || 0.42;

    ctx.save();
    // translate to screen center → scale → translate by -focus. The focus
    // point always lands exactly on screen center, under the orb — no rotation.
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-fx, -fy);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(points[i], points[i + 1]);
      else ctx.lineTo(points[i], points[i + 1]);
    }
    // wide faint under-stroke first, then a crisp line on top — divide by
    // scale so both keep a constant on-screen width despite ctx.scale()
    ctx.lineWidth = 12 / scale;
    ctx.strokeStyle = `rgba(${rgb}, 0.14)`;
    ctx.stroke();
    ctx.lineWidth = 2 / scale;
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
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = orbColor;
    ctx.fill();

    // moon: a soft darker rim bite, faded in/out with the theme crossfade
    if (themeMix > 0.01) {
      ctx.globalAlpha = 0.55 * themeMix;
      ctx.beginPath();
      ctx.arc(cx + 2.6, cy - 2, 6, 0, Math.PI * 2);
      ctx.fillStyle = shadow;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(cx - 1.6, cy - 1.6, 1.5, 0, Math.PI * 2);
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
    phase = (phase + (ts - lastTs) / roundTripMs) % 1;
    lastTs = ts;

    cs = getComputedStyle(root);
    updateThemeMix(ts);
    const u = pingPongU(phase);
    const state = stateAt(u);

    // don't clear — repaint the sky at partial alpha over the last frame.
    // slow stretches converge to a crisp image; fast stretches leave motion-blur streaks.
    paintSky(0.30);
    strokeSpiral(state);
    drawOrb();

    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    cs = getComputedStyle(root);
    ctx.clearRect(0, 0, W, H);
    paintSky(1);
    strokeSpiral(stateAt(1)); // fully zoomed out: the bell + its golden-spiral tail
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
    roundTripMs = calm ? CALM_ROUND_TRIP_MS : ROUND_TRIP_MS; // phase is preserved, so this doesn't jump
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
  if (frozen) drawStatic();
  else start();
})();
