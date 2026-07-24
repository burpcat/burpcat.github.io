(function () {
  // Prism has no "mermaid" grammar, so these fences pass through as plain,
  // unhighlighted <pre class="language-mermaid"><code>...</code></pre> —
  // exactly the raw diagram source Mermaid needs. Only pay for the (large)
  // Mermaid bundle on pages that actually have one.
  var blocks = document.querySelectorAll("pre.language-mermaid");
  if (!blocks.length) return;

  import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.js").then(
    function (mod) {
      var mermaid = mod.default;

      blocks.forEach(function (pre) {
        var code = pre.querySelector("code") || pre;
        var div = document.createElement("div");
        div.className = "mermaid";
        div.textContent = code.textContent;
        pre.replaceWith(div);
      });

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

      mermaid.run({ querySelector: ".mermaid" });
    }
  );
})();
