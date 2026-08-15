// ── modal (auth placeholder) ──
function openModal(mode) {
  const m = document.getElementById('authModal');
  const t = document.getElementById('modalTitle');
  const d = document.getElementById('modalDesc');
  if (!m) return;
  if (mode === 'signup') {
    t.textContent = 'sign up';
    d.textContent = 'Save posts, get notified of new writing, leave comments.';
  } else {
    t.textContent = 'log in';
    d.textContent = 'Welcome back. Pick up where you left off.';
  }
  m.classList.add('open');
}
function closeModal() {
  const m = document.getElementById('authModal');
  if (m) m.classList.remove('open');
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── theme switch ──
(function () {
  const root = document.documentElement;
  const switchEl = document.getElementById('themeSwitch');
  const iconEl = document.getElementById('themeIcon');
  if (!switchEl || !iconEl) return;
  const STORAGE_KEY = 'theme';

  // Small auto-dismissing toast that names the theme when it changes — created
  // lazily, positioned by CSS near the utility strip. Only shown on an actual
  // switch (announce=true), never on the silent load-time sync.
  let toastEl = null;
  let toastTimer = null;
  const announceTheme = (theme) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'theme-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = theme === 'dark' ? 'dark mode' : 'light mode';
    // restart the show animation even on rapid repeat toggles
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toastEl) toastEl.classList.remove('show'); }, 1600);
  };

  const applyTheme = (theme, announce) => {
    root.setAttribute('data-theme', theme);
    iconEl.textContent = theme === 'dark' ? '☀' : '☾';
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
    if (announce) announceTheme(theme);
  };

  window.__site = window.__site || {};
  window.__site.setTheme = applyTheme; // bridge for the welcome popup + medium mode

  // Sync icon with whatever the anti-flash script set in <head>
  const current = root.getAttribute('data-theme') || 'light';
  iconEl.textContent = current === 'dark' ? '☀' : '☾';

  switchEl.addEventListener('click', () => {
    // While medium mode is on, the switch flips medium's OWN light/dark (a
    // page-local skin) — it must not touch the site's persisted theme, so that
    // leaving medium restores whatever the reader actually had.
    if (root.classList.contains('medium-mode') && window.__site && window.__site.toggleMediumDark) {
      const dark = window.__site.toggleMediumDark();
      announceTheme(dark ? 'dark' : 'light');
      return;
    }
    const current = root.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  });

  // Live-respond to OS changes if user hasn't explicitly chosen
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    } catch (err) {}
  });
})();

// ── calm mode (site-wide: tempo + de-frosted glass) ──
// v8 supersedes the v1 coupling: calm mode used to force-start/stop the
// background track. Music is now its own independent thing — see the
// music module below — calm mode here only ever touches tempo/visuals (v4/v5).
// v15: reading-mode (blog + post pages) is no longer derived from this —
// it's now a permanent, URL-derived attribute baked in at build time (see
// base.njk), so it stays on regardless of calm mode. Calm mode remains its
// own independent, site-wide switch.
(function () {
  const toggle = document.getElementById('calmToggle');
  if (!toggle) return;
  const label = toggle.querySelector('.calm-label');
  const STORAGE_KEY = 'calm-mode';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const apply = (on) => {
    document.body.classList.toggle('calm-mode', on);
    toggle.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'calm: on' : 'calm mode';
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
  };

  let initial = false;
  try { initial = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
  if (reducedMotion) initial = true;
  apply(initial);

  toggle.addEventListener('click', () => {
    apply(!document.body.classList.contains('calm-mode'));
  });

  window.__site = window.__site || {};
  window.__site.setCalmMode = apply; // bridge for the welcome popup
})();

// ── medium mode (blog POST pages only) ──
// A full-page reading skin that turns the post into a Medium.com-style page.
// It is strictly page-local: it toggles html.medium-mode ONLY when a post page
// is present (#mediumToggle exists), and it never touches the site's persisted
// theme — so navigating to any other page always shows the default, and the
// reader's real light/dark choice is preserved. Its own light/dark lives in the
// separate `medium-dark` class, flipped by the theme switch while medium is on.
// The click listener is delegated on document so it survives nav.js #main swaps.
(function () {
  const root = document.documentElement;
  const MED = 'medium-mode';
  const DARK = 'medium-dark';
  const isPostPage = () => !!document.getElementById('mediumToggle');
  const flag = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
  const setFlag = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} };

  // Reconcile the DOM to stored state for the CURRENT page. On non-post pages
  // this clears both classes, which is what un-leaks medium on soft-nav.
  function sync() {
    const on = isPostPage() && flag(MED);
    root.classList.toggle(MED, on);
    root.classList.toggle(DARK, on && flag(DARK));
    const btn = document.getElementById('mediumToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      const label = btn.querySelector('.md-label');
      if (label) label.textContent = on ? 'medium: on' : 'medium mode';
    }
  }

  function setMedium(on) {
    setFlag(MED, on);
    if (on) setFlag(DARK, false); // always start light, like Medium
    sync();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#mediumToggle');
    if (!t) return;
    setMedium(!root.classList.contains(MED));
  });

  window.__site = window.__site || {};
  window.__site.syncMedium = sync; // nav.js calls this after a soft-nav swap
  window.__site.toggleMediumDark = function () {
    if (!root.classList.contains(MED)) return false;
    const next = !root.classList.contains(DARK);
    setFlag(DARK, next);
    sync();
    return next; // caller (theme switch) shows the toast
  };

  sync();
})();

// ── background music (independent of calm mode; persists across pages) ──
(function () {
  const toggle = document.getElementById('muteToggle');
  const audio = document.getElementById('calmAudio');
  if (!toggle || !audio) return;
  const ON_KEY = 'music-on';
  const POS_KEY = 'calm-audio';

  let musicOn = false;
  try { musicOn = sessionStorage.getItem(ON_KEY) === '1'; } catch (e) {}

  const render = () => {
    toggle.textContent = musicOn ? '♪' : '🔇';
    toggle.setAttribute('aria-pressed', String(musicOn));
  };
  render();

  // isGesture: only call play() from a real click — autoplay is blocked
  // otherwise. Resuming state after a successful background resume (below)
  // passes isGesture=false since play() already succeeded.
  function setMusicOn(on, isGesture) {
    musicOn = on;
    try { sessionStorage.setItem(ON_KEY, on ? '1' : '0'); } catch (e) {}
    render();
    if (on) {
      audio.volume = 0.5;
      if (isGesture) audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  // A full page load destroys <audio> — try to pick the track back up where
  // the last page left off; if the browser blocks autoplay here, resume on
  // the first tiny interaction instead (usually immediate). Skip interactions
  // on the toggle itself — its own click handler owns that gesture, so the
  // two don't race and leave the glyph out of sync with actual playback.
  function tryResume() {
    audio.play().then(() => setMusicOn(true, false)).catch(() => {
      const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
      const onInteract = (e) => {
        if (e.target === toggle || toggle.contains(e.target)) return;
        events.forEach((ev) => window.removeEventListener(ev, onInteract));
        audio.play().then(() => setMusicOn(true, false)).catch(() => {});
      };
      events.forEach((ev) => window.addEventListener(ev, onInteract, { passive: true }));
    });
  }

  try {
    const s = JSON.parse(sessionStorage.getItem(POS_KEY) || 'null');
    if (s && typeof s.time === 'number') {
      audio.currentTime = s.time;
      if (s.playing) tryResume();
    }
  } catch (e) {}

  function saveAudio() {
    try {
      sessionStorage.setItem(POS_KEY, JSON.stringify({ time: audio.currentTime, playing: !audio.paused && musicOn }));
    } catch (e) {}
  }
  setInterval(saveAudio, 500);
  window.addEventListener('pagehide', saveAudio);

  toggle.addEventListener('click', () => setMusicOn(!musicOn, true));

  window.__site = window.__site || {};
  window.__site.setMusicOn = setMusicOn;
  window.__site.audio = audio; // bridge for the welcome popup's fresh-start play
})();

// ── first-visit welcome popup ──
(function () {
  const overlay = document.getElementById('welcome');
  if (!overlay) return;
  const WELCOMED_KEY = 'welcomed';

  let welcomed = false;
  try { welcomed = localStorage.getItem(WELCOMED_KEY) === '1'; } catch (e) {}
  if (welcomed) return;

  const root = document.documentElement;
  const lightBtn = document.getElementById('wm-light');
  const darkBtn = document.getElementById('wm-dark');
  const calmBtn = document.getElementById('wm-calm');
  const musicCheck = document.getElementById('welcome-music-check');
  const enterBtn = document.getElementById('welcome-enter');

  function syncModeButtons() {
    const dark = root.getAttribute('data-theme') === 'dark';
    if (lightBtn) lightBtn.setAttribute('aria-pressed', String(!dark));
    if (darkBtn) darkBtn.setAttribute('aria-pressed', String(dark));
  }
  syncModeButtons();

  function syncCalmButton() {
    if (calmBtn) calmBtn.setAttribute('aria-pressed', String(document.body.classList.contains('calm-mode')));
  }
  syncCalmButton();

  if (lightBtn) lightBtn.addEventListener('click', () => {
    if (window.__site && window.__site.setTheme) window.__site.setTheme('light');
    syncModeButtons();
  });
  if (darkBtn) darkBtn.addEventListener('click', () => {
    if (window.__site && window.__site.setTheme) window.__site.setTheme('dark');
    syncModeButtons();
  });
  if (calmBtn) calmBtn.addEventListener('click', () => {
    if (window.__site && window.__site.setCalmMode) window.__site.setCalmMode(!document.body.classList.contains('calm-mode'));
    syncCalmButton();
  });

  function getFocusable() {
    return [lightBtn, darkBtn, calmBtn, musicCheck, enterBtn].filter(Boolean);
  }

  function trapKeydown(e) {
    if (e.key === 'Escape') { close(false); return; }
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    overlay.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      const focusable = getFocusable();
      if (focusable[0]) focusable[0].focus();
    });
    overlay.addEventListener('keydown', trapKeydown);
  }

  // startMusic: only true from the "enter" button — that click is the real
  // user gesture that unlocks autoplay for the rest of the session. Esc and
  // backdrop-click close without it (no guaranteed gesture semantics there).
  function close(startMusic) {
    try { localStorage.setItem(WELCOMED_KEY, '1'); } catch (e) {}
    overlay.classList.remove('open');
    overlay.removeEventListener('keydown', trapKeydown);
    if (document.activeElement) document.activeElement.blur();
    setTimeout(() => { overlay.hidden = true; }, 400);

    if (startMusic && window.__site && window.__site.setMusicOn) {
      if (window.__site.audio) window.__site.audio.currentTime = 0;
      window.__site.setMusicOn(true, true);
    }
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(false);
  });
  if (enterBtn) enterBtn.addEventListener('click', () => close(!!(musicCheck && musicCheck.checked)));

  open();
})();

// ── live "currently building" status ──
// github.json (baked in at build time) is the initial paint and the no-JS
// fallback. This just asks GitHub directly, client-side, so the status
// reflects the very latest push within seconds of loading the page, with
// no rebuild. Any failure — offline, rate-limited, no push found — leaves
// the server-rendered value alone.
(function () {
  const textEl = document.getElementById('statusText');
  if (!textEl) return;
  const username = textEl.dataset.username;
  if (!username || username === 'yourusername') return;

  const CACHE_KEY = 'github-status-cache';
  const CACHE_MS = 3 * 60 * 1000;

  function render(repo, url) {
    textEl.textContent = '';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'currently building';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = repo;
    textEl.appendChild(label);
    textEl.appendChild(document.createTextNode(' '));
    textEl.appendChild(link);
  }

  function fromCache() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (s && typeof s.fetchedAt === 'number' && Date.now() - s.fetchedAt < CACHE_MS) return s;
    } catch (e) {}
    return null;
  }
  function toCache(repo, url) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ repo, url, fetchedAt: Date.now() })); } catch (e) {}
  }

  const cached = fromCache();
  if (cached) { render(cached.repo, cached.url); return; }

  fetch('https://api.github.com/users/' + username + '/events/public')
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((events) => {
      const push = events.find((e) => e.type === 'PushEvent');
      if (!push) return;
      const repo = push.repo.name.split('/')[1];
      const url = 'https://github.com/' + push.repo.name;
      render(repo, url);
      toCache(repo, url);
    })
    .catch(() => { /* keep the baked-in github.json value */ });
})();
