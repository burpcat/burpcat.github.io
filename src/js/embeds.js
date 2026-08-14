/**
 * Hydrates the embed placeholders emitted by lib/markdown-it-embeds.js for the
 * two providers that can't be a plain static iframe:
 *   - tweet  → Twitter/X widgets.js
 *   - gist   → an auto-resizing iframe running gist.github.com's embed script
 * No-ops when the page has neither, so it's safe to load site-wide.
 */
(function () {
  // ── Tweets ──
  var tweets = document.querySelectorAll(".embed-tweet[data-tweet]");
  if (tweets.length) {
    tweets.forEach(function (el) {
      var id = el.getAttribute("data-tweet");
      var bq = document.createElement("blockquote");
      bq.className = "twitter-tweet";
      var a = document.createElement("a");
      a.href = "https://twitter.com/i/status/" + encodeURIComponent(id);
      bq.appendChild(a);
      el.replaceWith(bq);
    });
    var s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js";
    s.async = true;
    s.charset = "utf-8";
    document.body.appendChild(s);
  }

  // ── Gists ──
  document.querySelectorAll(".embed-gist[data-gist]").forEach(function (el) {
    var gist = el.getAttribute("data-gist"); // "user/id"
    var iframe = document.createElement("iframe");
    iframe.className = "embed embed-gist-frame";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.setAttribute("loading", "lazy");
    // srcdoc runs the gist script in an isolated document, then posts its
    // rendered height back so we can size the iframe to fit.
    iframe.srcdoc =
      '<html><head><base target="_parent">' +
      '<style>*{margin:0}.gist{font-size:13px}</style></head><body onload="' +
      "parent.postMessage(document.body.scrollHeight,'*')\">" +
      '<script src="https://gist.github.com/' + gist + '.js"><\/script>' +
      "</body></html>";
    el.replaceWith(iframe);
    window.addEventListener("message", function (e) {
      if (typeof e.data === "number" && e.source === iframe.contentWindow) {
        iframe.style.height = e.data + 30 + "px";
      }
    });
  });
})();
