// ── soft navigation ──
// Every page here is a real full document — no SPA router. A full page load
// destroys #calmAudio and restarts the #sceneSky canvas from scratch, which
// is why site.js/spiral.js need those sessionStorage continuity hacks in the
// first place. This intercepts same-tab clicks on internal links, fetches
// the destination HTML, and swaps only the bits that differ per page —
// #main plus a handful of named regions — so the audio element and the
// canvas's rAF loop are simply never torn down for in-site navigation.
// Progressive enhancement: anything unsupported or that fails just falls
// through to a real navigation, i.e. today's behavior.
(function () {
  if (!window.fetch || !window.DOMParser || !window.history || !history.pushState) return;

  const mainEl = () => document.getElementById('main');

  function isRoutable(anchor, event) {
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download')) return false;
    if (!/^https?:$/.test(anchor.protocol)) return false;
    let originOk = false;
    try { originOk = anchor.origin === location.origin; } catch (e) {}
    if (!originOk) return false;
    // same-document hash link (covers the "skip to content" link)
    if (anchor.pathname === location.pathname && anchor.search === location.search && anchor.hash) return false;
    return true;
  }

  // ── script re-execution ──
  // <script> tags inserted via innerHTML/appendChild of parsed nodes never
  // run — needed for guestbook's giscus embed, written with no knowledge of
  // giscus specifically so any future per-page script keeps working too.
  function reviveScripts(container) {
    container.querySelectorAll('script').forEach((old) => {
      const fresh = document.createElement('script');
      for (const attr of old.attributes) fresh.setAttribute(attr.name, attr.value);
      fresh.textContent = old.textContent;
      old.parentNode.replaceChild(fresh, old);
    });
  }

  // .hero-caption and .blogroll are siblings of #main (not inside it), and
  // only ever appear on some pages — sync each independently by removing
  // the live instance (if any) and inserting a clone from the fetched doc
  // (if any) at the same position relative to #main.
  function syncSiblingRegion(newDoc, anchorEl, selector, position) {
    const existing = document.querySelector(selector);
    if (existing) existing.remove();
    const fresh = newDoc.querySelector(selector);
    if (!fresh) return;
    const clone = fresh.cloneNode(true);
    if (position === 'before') anchorEl.parentNode.insertBefore(clone, anchorEl);
    else anchorEl.parentNode.insertBefore(clone, anchorEl.nextSibling);
  }

  function applySwap(newDoc, url, scrollY) {
    const oldMain = mainEl();
    if (!oldMain) throw new Error('no #main in current document');
    const newMain = newDoc.getElementById('main');
    if (!newMain) throw new Error('no #main in fetched document');

    document.title = newDoc.title;

    const oldDesc = document.querySelector('meta[name="description"]');
    const newDesc = newDoc.querySelector('meta[name="description"]');
    if (oldDesc && newDesc) oldDesc.setAttribute('content', newDesc.getAttribute('content') || '');

    if (newDoc.documentElement.hasAttribute('data-page')) {
      document.documentElement.setAttribute('data-page', newDoc.documentElement.getAttribute('data-page'));
    } else {
      document.documentElement.removeAttribute('data-page');
    }

    const oldNav = document.querySelector('header nav[aria-label="Main navigation"]');
    const newNav = newDoc.querySelector('header nav[aria-label="Main navigation"]');
    if (oldNav && newNav) oldNav.replaceWith(newNav.cloneNode(true));

    // sibling regions, synced while oldMain is still attached (position anchor)
    syncSiblingRegion(newDoc, oldMain, '.hero-caption', 'before');
    syncSiblingRegion(newDoc, oldMain, '.blogroll', 'after');

    oldMain.replaceWith(newMain);
    newMain.setAttribute('tabindex', '-1');
    reviveScripts(newMain);

    if (window.__site && window.__site.bindReaderToggle) window.__site.bindReaderToggle();

    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
    const hashTarget = hash && document.getElementById(hash);
    if (hashTarget) {
      hashTarget.scrollIntoView();
    } else if (typeof scrollY === 'number') {
      window.scrollTo(0, scrollY);
    } else {
      window.scrollTo(0, 0);
    }
    newMain.focus({ preventScroll: true });
  }

  let currentAbort = null;
  let navToken = 0;

  function navigateTo(url, push, scrollY) {
    if (currentAbort) currentAbort.abort();
    const myToken = ++navToken;
    currentAbort = new AbortController();

    if (push) history.replaceState({ scrollY: window.scrollY }, '', location.href);

    fetch(url, { signal: currentAbort.signal })
      .then((res) => {
        const type = res.headers.get('content-type') || '';
        if (!res.ok || type.indexOf('html') === -1) throw new Error('non-HTML or bad response');
        return res.text();
      })
      .then((html) => {
        if (myToken !== navToken) return;
        const newDoc = new DOMParser().parseFromString(html, 'text/html');
        applySwap(newDoc, url, push ? undefined : scrollY);
        if (push) history.pushState({ scrollY: 0 }, '', url);
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        if (myToken !== navToken) return;
        window.location.href = url;
      });
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a');
    if (!anchor || !isRoutable(anchor, event)) return;
    event.preventDefault();
    navigateTo(anchor.href, true);
  });

  window.addEventListener('popstate', (event) => {
    const scrollY = (event.state && typeof event.state.scrollY === 'number') ? event.state.scrollY : 0;
    navigateTo(location.href, false, scrollY);
  });

  history.scrollRestoration = 'manual';
  if (history.state && typeof history.state.scrollY === 'number') {
    window.scrollTo(0, history.state.scrollY);
  } else {
    history.replaceState({ scrollY: window.scrollY }, '', location.href);
  }
  const initialMain = mainEl();
  if (initialMain) initialMain.setAttribute('tabindex', '-1');
})();
