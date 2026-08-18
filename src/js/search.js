// ── blog search (spotlight overlay, driven by Pagefind's low-level API) ──
// blog/index.njk loads this from inside #main, so nav.js's reviveScripts()
// re-runs it on every soft navigation into /blog/. It self-inits at the
// bottom of this file rather than via a separate inline <script> call, since
// a dynamically-inserted <script src> executes async — by the time this code
// actually runs, the trigger/overlay markup (which precedes this <script>
// tag in the page) is already in the DOM either way, so there's no race.
function initBlogSearch() {
  var trigger = document.getElementById("searchTrigger");
  var overlay = document.getElementById("searchOverlay");
  if (!trigger || !overlay || overlay.dataset.searchInit) return;
  overlay.dataset.searchInit = "1";

  var panel = overlay.querySelector(".search-panel");
  var input = overlay.querySelector(".search-input");
  var clearBtn = overlay.querySelector(".search-clear");
  var closeBtn = overlay.querySelector(".search-close");
  var resultsEl = overlay.querySelector(".search-results");

  var pagefind = null;
  var pagefindReady = (async function () {
    try {
      pagefind = await import("/pagefind/pagefind.js");
      if (pagefind.init) await pagefind.init();
    } catch (e) {
      pagefind = null;
    }
  })();

  var debounceTimer = null;
  var searchToken = 0;
  var activeIndex = -1;
  var currentResults = []; // flat list of { el } in visual order, main + sub results

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderHint(text) {
    resultsEl.innerHTML = '<p class="search-hint">' + escapeHtml(text) + "</p>";
    currentResults = [];
    activeIndex = -1;
  }

  function setActive(index) {
    currentResults.forEach(function (r, i) { r.el.classList.toggle("is-active", i === index); });
    activeIndex = index;
    var el = currentResults[activeIndex] && currentResults[activeIndex].el;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }

  function moveActive(delta) {
    if (!currentResults.length) return;
    setActive((activeIndex + delta + currentResults.length) % currentResults.length);
  }

  function renderResults(term, dataList) {
    resultsEl.innerHTML = "";
    currentResults = [];
    activeIndex = -1;

    var count = document.createElement("p");
    count.className = "search-count";
    count.textContent = dataList.length + (dataList.length === 1 ? " result for “" : " results for “") + term + "”";
    resultsEl.appendChild(count);

    if (!dataList.length) {
      var empty = document.createElement("p");
      empty.className = "search-hint";
      empty.textContent = "No results for “" + term + "”.";
      resultsEl.appendChild(empty);
      return;
    }

    dataList.forEach(function (data) {
      var card = document.createElement("article");
      card.className = "search-result";

      var titleLink = document.createElement("a");
      titleLink.className = "search-result-title";
      titleLink.href = data.url;
      titleLink.textContent = (data.meta && data.meta.title) || data.url;
      card.appendChild(titleLink);
      currentResults.push({ el: titleLink });

      var metaBits = [];
      if (data.meta && data.meta.date) metaBits.push("<time>" + escapeHtml(data.meta.date) + "</time>");
      if (data.meta && data.meta.reading_time) metaBits.push("<span>" + escapeHtml(data.meta.reading_time) + "</span>");
      if (metaBits.length) {
        var meta = document.createElement("div");
        meta.className = "search-result-meta";
        meta.innerHTML = metaBits.join('<span class="search-result-meta-sep" aria-hidden="true">·</span>');
        card.appendChild(meta);
      }

      // Pagefind's sub_results already segments this page into the specific
      // sections (top-of-page, or under a given heading) that matched the
      // query — each one is unambiguously scoped to its own URL, so link
      // straight there instead of trying to guess which section the
      // whole-page `excerpt` field was drawn from. A section keeps the
      // post's own title when there's no heading above it (nothing to
      // label); real headings get a small "↳ heading" label. Falls back to
      // the whole-page excerpt only in the unlikely case Pagefind returns
      // no sub_results at all.
      var postTitle = data.meta && data.meta.title;
      var matches = (data.sub_results && data.sub_results.length)
        ? data.sub_results
        : (data.excerpt ? [{ url: data.url, excerpt: data.excerpt, title: postTitle }] : []);

      function headingLabel(m) {
        var heading = m.title && m.title !== postTitle ? m.title.replace(/\s*#\s*$/, "") : null;
        return heading ? '<span class="search-match-heading">↳ ' + escapeHtml(heading) + "</span>" : "";
      }

      var primary = matches[0];
      if (primary) {
        var excerpt = document.createElement("a");
        excerpt.className = "search-result-excerpt";
        excerpt.href = primary.url;
        excerpt.innerHTML = headingLabel(primary) + (primary.excerpt || "");
        card.appendChild(excerpt);
        currentResults.push({ el: excerpt });
      }

      var extras = matches.slice(1, 4);
      if (extras.length) {
        var subList = document.createElement("div");
        subList.className = "search-subresults";
        extras.forEach(function (m) {
          var subLink = document.createElement("a");
          subLink.className = "search-subresult";
          subLink.href = m.url;
          subLink.innerHTML = headingLabel(m) + (m.excerpt ? '<span class="search-subresult-excerpt">' + m.excerpt + "</span>" : "");
          subList.appendChild(subLink);
          currentResults.push({ el: subLink });
        });
        card.appendChild(subList);
      }

      resultsEl.appendChild(card);
    });
  }

  async function runSearch(term) {
    var myToken = ++searchToken;
    await pagefindReady;
    if (myToken !== searchToken) return;
    if (!pagefind) { renderHint("Search is unavailable right now."); return; }
    var search = await pagefind.search(term);
    if (myToken !== searchToken) return;
    var dataList = await Promise.all(search.results.slice(0, 8).map(function (r) { return r.data(); }));
    if (myToken !== searchToken) return;
    renderResults(term, dataList);
  }

  function open() {
    overlay.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    input.value = "";
    clearBtn.hidden = true;
    renderHint("Type to search all posts by title or content.");
    document.addEventListener("keydown", onKeydown);
    requestAnimationFrame(function () { input.focus(); });
  }

  function close() {
    overlay.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown);
    trigger.focus();
  }

  function onKeydown(e) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1); return; }
    if (e.key === "Enter" && activeIndex >= 0 && currentResults[activeIndex]) {
      e.preventDefault();
      currentResults[activeIndex].el.click();
    }
  }

  input.addEventListener("input", function () {
    var term = input.value.trim();
    clearBtn.hidden = !term;
    clearTimeout(debounceTimer);
    if (!term) { renderHint("Type to search all posts by title or content."); return; }
    debounceTimer = setTimeout(function () { runSearch(term); }, 150);
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    clearBtn.hidden = true;
    renderHint("Type to search all posts by title or content.");
    input.focus();
  });

  trigger.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("mousedown", function (e) {
    if (e.target === overlay) close();
  });
}

initBlogSearch();
