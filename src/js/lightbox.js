/**
 * Click-to-zoom lightbox for post images — the reader convenience Dev.to and
 * Hashnode give published images. Delegates one listener on .post-body; images
 * inside a link are left alone (the link wins).
 */
(function () {
  var body = document.querySelector(".post-body");
  if (!body) return;

  var backdrop, current;
  function close() {
    if (!backdrop) return;
    backdrop.classList.remove("is-open");
    var b = backdrop;
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 200);
    backdrop = null;
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  body.addEventListener("click", function (e) {
    var img = e.target.closest("img");
    if (!img || img.closest("a")) return;
    backdrop = document.createElement("div");
    backdrop.className = "lightbox-backdrop";
    current = document.createElement("img");
    current.src = img.currentSrc || img.src;
    current.alt = img.alt || "";
    backdrop.appendChild(current);
    backdrop.addEventListener("click", close);
    document.body.appendChild(backdrop);
    requestAnimationFrame(function () { backdrop.classList.add("is-open"); });
    document.addEventListener("keydown", onKey);
  });
})();
