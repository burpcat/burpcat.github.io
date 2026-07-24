(function () {
  // Prism DOES ship a "mermaid" grammar (it syntax-highlights the fence as
  // code), but that only wraps tokens in <span>s — it never changes the
  // underlying characters. code.textContent below still recovers the exact
  // raw diagram source, which is what Mermaid actually needs to render.
  // Only pay for the (large) Mermaid bundle on pages that actually have one.
  var blocks = document.querySelectorAll("pre.language-mermaid");
  if (!blocks.length) return;

  // jsdelivr's package dist path for the ESM build isn't stable across
  // Mermaid versions (mermaid.esm.min.js 404s as of v11) — "+esm" is
  // jsdelivr's own generated ESM endpoint and doesn't depend on the
  // package's internal file layout.
  import("https://cdn.jsdelivr.net/npm/mermaid@11/+esm").then(
    async function (mod) {
      var mermaid = mod.default;

      // Fixed dark palette matching this site's code blocks (#1A1714 bg /
      // #D4C9B4 text), which don't themselves follow the light/dark toggle.
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: "#1A1714",
          primaryColor: "#22201B",
          primaryTextColor: "#D4C9B4",
          primaryBorderColor: "#7FB59B",
          lineColor: "#B8AD98",
          secondaryColor: "#2A2620",
          secondaryTextColor: "#D4C9B4",
          tertiaryColor: "#1A1714",
          tertiaryTextColor: "#D4C9B4",
          fontFamily: "'Courier New', monospace",
          fontSize: "14px",
        },
      });

      // mermaid.render() lays each diagram out in its own internal detached
      // container and hands back a plain SVG string — unlike mermaid.run(),
      // which measures text directly against the live target element. On
      // this page that live-measurement path returned a bogus ~300px-wide
      // layout for the very first diagram processed (reproducible: correct
      // in isolation, broken specifically once real page CSS/layout was in
      // play), so render()-per-diagram is used instead of one batched run().
      var i = 0;
      for (var pre of blocks) {
        var code = pre.querySelector("code") || pre;
        var src = code.textContent;
        var div = document.createElement("div");
        div.className = "mermaid";
        try {
          var rendered = await mermaid.render("mermaid-diagram-" + i, src);
          div.innerHTML = rendered.svg;
        } catch (err) {
          console.error("mermaid-init: render failed for block", i, err);
          div.textContent = src;
        }
        pre.replaceWith(div);
        i++;
      }
    }
  ).catch(function (err) {
    console.error("mermaid-init: failed to load/run Mermaid", err);
  });
})();
