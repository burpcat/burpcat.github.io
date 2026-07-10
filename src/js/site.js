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

// ── calm mode (+ background audio) ──
(function () {
  const toggle = document.getElementById('calmToggle');
  if (!toggle) return;
  const label = toggle.querySelector('.calm-label');
  const muteToggle = document.getElementById('muteToggle');
  const audio = document.getElementById('calmAudio');
  const STORAGE_KEY = 'calm-mode';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // isGesture: audio only autoplays from a real click — browsers block it
  // otherwise, and we don't want it firing on page load from a saved state.
  const apply = (on, isGesture) => {
    document.body.classList.toggle('calm-mode', on);
    toggle.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'calm: on' : 'calm mode';
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}

    if (muteToggle) muteToggle.hidden = !on;
    if (audio) {
      if (on && isGesture && !reducedMotion) {
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } else if (!on) {
        audio.pause();
      }
    }
  };

  let initial = false;
  try { initial = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
  if (reducedMotion) initial = true;
  apply(initial, false);

  toggle.addEventListener('click', () => {
    apply(!document.body.classList.contains('calm-mode'), true);
  });

  if (muteToggle && audio) {
    muteToggle.addEventListener('click', () => {
      audio.muted = !audio.muted;
      muteToggle.textContent = audio.muted ? '🔇' : '♪';
      muteToggle.setAttribute('aria-pressed', String(audio.muted));
      // the click is itself a gesture — catches the case where autoplay
      // was blocked because calm mode came from a saved state, not a click
      if (!audio.muted && audio.paused) audio.play().catch(() => {});
    });
  }
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
