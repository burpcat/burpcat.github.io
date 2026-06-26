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

// ── calm mode ──
(function () {
  const toggle = document.getElementById('calmToggle');
  if (!toggle) return;
  const label = toggle.querySelector('.calm-label');
  const STORAGE_KEY = 'calm-mode';

  const apply = (on) => {
    document.body.classList.toggle('calm-mode', on);
    toggle.setAttribute('aria-pressed', String(on));
    if (label) label.textContent = on ? 'calm: on' : 'calm mode';
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
  };

  let initial = false;
  try { initial = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) initial = true;
  apply(initial);

  toggle.addEventListener('click', () => {
    apply(!document.body.classList.contains('calm-mode'));
  });
})();
