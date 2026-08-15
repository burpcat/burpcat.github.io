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

      // GitHub Dark Default palette, matching this site's code blocks
      // (#0d1117 bg / #e6edf3 text), which don't follow the light/dark toggle.
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: {
          background: "#0d1117",
          primaryColor: "#161b22",
          primaryTextColor: "#e6edf3",
          primaryBorderColor: "#30363d",
          lineColor: "#8b949e",
          secondaryColor: "#21262d",
          secondaryTextColor: "#e6edf3",
          tertiaryColor: "#0d1117",
          tertiaryTextColor: "#e6edf3",
          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: "13.5px",
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
