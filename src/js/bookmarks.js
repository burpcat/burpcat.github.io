/**
 * Client-side bookmarks / reading list — no backend, stored in localStorage.
 * Powers the per-post "save" button and the saved-posts list on /blog/.
 */
(function () {
  var KEY = "burpcat:bookmarks";
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
  }

  // ── per-post save button ──
  document.querySelectorAll("[data-bookmark]").forEach(function (btn) {
    var url = btn.getAttribute("data-url");
    var title = btn.getAttribute("data-title");
    function reflect() {
      var saved = !!load()[url];
      btn.setAttribute("aria-pressed", saved ? "true" : "false");
      btn.classList.toggle("is-saved", saved);
      var icon = btn.querySelector(".bm-icon");
      var label = btn.querySelector(".bm-label");
      if (icon) icon.textContent = saved ? "★" : "☆";
      if (label) label.textContent = saved ? "saved" : "save";
    }
    btn.addEventListener("click", function () {
      var map = load();
      if (map[url]) delete map[url];
      else map[url] = { title: title, at: Date.now() };
      save(map);
      reflect();
    });
    reflect();
  });

  // ── saved list on the blog index ──
  var host = document.getElementById("savedPosts");
  if (host) {
    var map = load();
    var entries = Object.keys(map).sort(function (a, b) { return map[b].at - map[a].at; });
    if (entries.length) {
      var html = '<p class="section-label">— SAVED</p><ul class="saved-list">';
      entries.forEach(function (url) {
        html += '<li><a href="' + url + '">' + (map[url].title || url) + "</a></li>";
      });
      html += "</ul>";
      host.innerHTML = html;
    }
  }
})();
