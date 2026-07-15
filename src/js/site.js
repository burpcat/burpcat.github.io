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

  const applyTheme = (theme) => {
    root.setAttribute('data-theme', theme);
    iconEl.textContent = theme === 'dark' ? '☀' : '☾';
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
  };

  window.__site = window.__site || {};
  window.__site.setTheme = applyTheme; // bridge for the welcome popup's day/night preview

  // Sync icon with whatever the anti-flash script set in <head>
  const current = root.getAttribute('data-theme') || 'light';
  iconEl.textContent = current === 'dark' ? '☀' : '☾';

  switchEl.addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
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

// ── calm mode (animation tempo only) ──
// v8 supersedes the v1 coupling: calm mode used to force-start/stop the
// background track. Music is now its own independent thing — see the
// music module below — calm mode here only ever touches tempo (v4/v5).
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

// ── reader mode (blog + post pages only) ──
(function () {
  const toggle = document.getElementById('readerToggle');
  if (!toggle) return;
  const root = document.documentElement;
  const STORAGE_KEY = 'reading-mode';

  const label = () => {
    toggle.textContent = root.classList.contains('reading-mode') ? 'exit reader view' : 'reader view';
  };
  label(); // the anti-flash script in <head> already applied the saved state

  toggle.addEventListener('click', () => {
    const on = !root.classList.contains('reading-mode');
    root.classList.toggle('reading-mode', on);
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
    label();
  });
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
  const musicCheck = document.getElementById('welcome-music-check');
  const enterBtn = document.getElementById('welcome-enter');

  function syncModeButtons() {
    const dark = root.getAttribute('data-theme') === 'dark';
    if (lightBtn) lightBtn.setAttribute('aria-pressed', String(!dark));
    if (darkBtn) darkBtn.setAttribute('aria-pressed', String(dark));
  }
  syncModeButtons();

  if (lightBtn) lightBtn.addEventListener('click', () => {
    if (window.__site && window.__site.setTheme) window.__site.setTheme('light');
    syncModeButtons();
  });
  if (darkBtn) darkBtn.addEventListener('click', () => {
    if (window.__site && window.__site.setTheme) window.__site.setTheme('dark');
    syncModeButtons();
  });

  function getFocusable() {
    return [lightBtn, darkBtn, musicCheck, enterBtn].filter(Boolean);
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
