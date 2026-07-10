// ── background scene: golden spiral zoom-out, fixed sun/moon pivot ──
// One canvas, no dependencies. The pivot at screen-center never moves or
// scales — the spiral rotates and shrinks around it. Theme and calm-mode
// are read live via MutationObserver, so this file needs no wiring from
// site.js. Audio playback lives in site.js instead (autoplay needs a real
// click gesture, which the calm-toggle handler already has).
(function () {
  const canvas = document.getElementById('sceneSky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;

  // Golden spiral r(θ) = e^(Kθ): rotating by Δ and scaling by e^(-KΔ) maps
  // the curve onto itself for any Δ, which is what makes the loop seamless.
  const K = Math.log(1.6180339887) / (Math.PI / 2);

  // A 2π-periodic wobble on top of the pure spiral — this is the "life arc"
  // the arm reads as it sweeps past center: rise, crest, dip, valley, climb, arch.
  const WOBBLE_AMP = 0.14;
  function wobble(theta) {
    const phi = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return 0.6 * Math.sin(phi) + 0.25 * Math.sin(2 * phi - 0.6) + 0.15 * Math.sin(3 * phi + 1.1);
  }

  // Precompute the polyline once, across many turns, so no end is ever visible.
  // Flat [x0,y0,x1,y1,...] pairs — cheaper to walk than an array of arrays.
  const THETA_MIN = -26, THETA_MAX = 18, THETA_STEP = 0.02;
  const points = [];
  for (let th = THETA_MIN; th <= THETA_MAX; th += THETA_STEP) {
    const r = Math.exp(K * th) * (1 + WOBBLE_AMP * wobble(th));
    points.push(Math.cos(th) * r, Math.sin(th) * r);
  }

  // Seven beats spread across one 2π loop: hold at each, then whip to the next.
  // Landing beat 7 exactly at 2π is what makes it loop back onto beat 0 with no cut.
  const BEATS = 7;
  const TARGETS = Array.from({ length: BEATS }, (_, i) => (i / BEATS) * Math.PI * 2);
  const HOLD_FRAC = 0.62;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function angleFromPhase(phase) {
    const seg = phase * BEATS;
    const i = Math.floor(seg) % BEATS;
    const frac = seg - Math.floor(seg);
    const from = TARGETS[i];
    const to = TARGETS[(i + 1) % BEATS] + (i === BEATS - 1 ? Math.PI * 2 : 0);
    if (frac < HOLD_FRAC) return from;
    return from + (to - from) * easeInOutCubic((frac - HOLD_FRAC) / (1 - HOLD_FRAC));
  }

  // ── state ──
  let W = 0, H = 0, cx = 0, cy = 0, baseScale = 0, dpr = 1;
  let calm = document.body.classList.contains('calm-mode');
  let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let periodMs = calm ? 7 * 60 * 1000 : 18000; // slow+meditative in calm mode, brisk otherwise
  let frozen = reduced;
  let hidden = document.hidden;
  let rafId = null;
  let phase = 0;     // 0..1 position in the loop — persists across period changes
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
    baseScale = Math.max(W, H) * 0.09; // tune by eye — bigger = arms sit further out
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

  function strokeSpiral(delta) {
    const scale = baseScale * Math.exp(-K * delta);
    const rgb = v('--spiral-line') || '62,107,84';
    const a = parseFloat(v('--spiral-alpha')) || 0.42;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-delta);
    ctx.scale(scale, scale);
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
    phase = (phase + (ts - lastTs) / periodMs) % 1;
    lastTs = ts;

    cs = getComputedStyle(root);
    updateThemeMix(ts);
    const delta = angleFromPhase(phase);

    // don't clear — repaint the sky at partial alpha over the last frame.
    // holds converge to a crisp image in a few frames; whips leave motion-blur streaks.
    paintSky(0.30);
    strokeSpiral(delta);
    drawOrb();

    rafId = requestAnimationFrame(frame);
  }

  function drawStatic() {
    cs = getComputedStyle(root);
    ctx.clearRect(0, 0, W, H);
    paintSky(1);
    strokeSpiral(TARGETS[BEATS - 1]); // land on the balanced-arch beat
    drawOrb();
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

  new MutationObserver(() => {
    calm = document.body.classList.contains('calm-mode');
    periodMs = calm ? 7 * 60 * 1000 : 18000; // phase is preserved, so the speed change doesn't jump
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
