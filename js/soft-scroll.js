// ── soft scroll (wheel/trackpad easing, desktop only) ──
// Site-wide, same intensity everywhere: one shared constant, one script,
// one layout (base.njk) includes it on every page. Wheel input no longer
// jumps the page directly — it nudges a target position that the actual
// scroll position eases toward each frame, so the page "soft-closes" into
// place instead of stopping dead. Touch, keyboard, and scrollbar-drag are
// left alone: mobile already has native inertial scroll, and hijacking
// keyboard/AT scroll risks real accessibility regressions for no benefit.
// Progressive enhancement — any failure/unsupported case just leaves
// native scrolling exactly as it is today.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.requestAnimationFrame) return;

  const EASE = 0.12;       // fraction of the remaining distance covered per frame
  const WHEEL_MULT = 1;    // wheel delta -> target-scroll multiplier (shared intensity)
  const EPSILON = 0.5;     // px; below this we consider the ease "arrived"

  let current = window.scrollY;
  let target = current;
  let scrollMax = 0;
  let rafId = null;
  let selfScroll = false; // guards the resync listener against our own scrollTo calls

  function recomputeScrollMax() {
    scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    target = Math.min(target, scrollMax);
  }
  recomputeScrollMax();
  window.addEventListener('resize', recomputeScrollMax);
  // Layout can grow after load (async embeds, images, giscus, fonts) —
  // keep the clamp honest without needing every such feature to know
  // about this file.
  new ResizeObserver(recomputeScrollMax).observe(document.documentElement);

  function tick() {
    // The 'scroll' event for the *previous* frame's scrollTo call fires
    // during the browser's render-update step, which runs before this rAF
    // callback — so by now it has already reached (or skipped, if the
    // rounded pixel position didn't change) the resync listener below.
    // Clearing the flag here, rather than synchronously after scrollTo,
    // is what keeps that listener from mistaking our own eased scroll for
    // an external one and cancelling the ease after a single frame.
    selfScroll = false;

    current += (target - current) * EASE;
    const arrived = Math.abs(target - current) < EPSILON;
    if (arrived) current = target;

    selfScroll = true;
    window.scrollTo(0, current);

    if (arrived) {
      // One more frame purely to clear the flag once this final scrollTo's
      // own scroll event has had its chance to fire, so a real external
      // scroll right after we settle isn't swallowed.
      rafId = requestAnimationFrame(function () { selfScroll = false; rafId = null; });
    } else {
      rafId = requestAnimationFrame(tick);
    }
  }

  function ensureRunning() {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  // Any independently-scrollable region nested in the page (e.g. the blog
  // search overlay's .search-results list) must keep native wheel scrolling
  // — walk up from the event target and bail if we're inside one, generic
  // enough to also cover anything scrollable added later.
  function isInsideScrollableRegion(el) {
    while (el && el !== document.documentElement && el !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return true;
      el = el.parentElement;
    }
    return false;
  }

  window.addEventListener('wheel', function (event) {
    // Only page-level vertical wheel scroll is eased; let horizontally
    // scrollable regions (code blocks, KaTeX overflow) use native handling.
    if (event.ctrlKey) return; // pinch-zoom gesture, never hijack it
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (isInsideScrollableRegion(event.target)) return;

    event.preventDefault();
    target += event.deltaY * WHEEL_MULT;
    target = Math.max(0, Math.min(scrollMax, target));
    ensureRunning();
  }, { passive: false });

  // Anything that moves scroll outside of our own rAF loop — hash jumps,
  // scrollIntoView, scrollbar drag, keyboard scroll, nav.js's soft-navigation
  // restoring scrollY on page swap/back-forward — should be adopted as the
  // new baseline rather than fought on the next wheel tick.
  window.addEventListener('scroll', function () {
    if (selfScroll) return;
    current = window.scrollY;
    target = current;
  }, { passive: true });
})();
