(function () {
  // Prism DOES ship a "mermaid" grammar (it syntax-highlights the fence as
  // code), but that only wraps tokens in <span>s — it never changes the
  // underlying characters. code.textContent below still recovers the exact
  // raw diagram source, which is what Mermaid actually needs to render.
  // Only pay for the (large) Mermaid bundle on pages that actually have one.
  var blocks = document.querySelectorAll("pre.language-mermaid");
  if (!blocks.length) return;

  // Mermaid is self-hosted (src/js/vendor/mermaid.min.js) so diagrams don't
  // depend on a third-party CDN being reachable at view time — the previous
  // runtime `import()` of jsdelivr's "+esm" endpoint was the reason diagrams
  // silently fell back to raw code when that request was blocked/flaky. The
  // standalone UMD build assigns globalThis.mermaid on load. If the local
  // file somehow fails, fall back to the old CDN path so we degrade, not break.
  function loadLocal() {
    return new Promise(function (resolve, reject) {
      if (window.mermaid) return resolve(window.mermaid);
      var s = document.createElement("script");
      s.src = "/js/vendor/mermaid.min.js";
      s.onload = function () {
        window.mermaid ? resolve(window.mermaid) : reject(new Error("mermaid global missing after load"));
      };
      s.onerror = function () { reject(new Error("local mermaid bundle failed to load")); };
      document.head.appendChild(s);
    });
  }
  function loadCdn() {
    return import("https://cdn.jsdelivr.net/npm/mermaid@11/+esm").then(function (mod) { return mod.default; });
  }

  loadLocal()
    .catch(function (err) {
      console.error("mermaid-init: local bundle failed, falling back to CDN", err);
      return loadCdn();
    })
    .then(function (mermaid) {
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
          // Gantt charts use their own theme-variable slots, unset above —
          // they were falling back to Mermaid's built-in (light-background)
          // defaults, putting light task-label text on a white section band
          // that's invisible against this always-dark diagram background.
          sectionBkgColor: "#0d1117",
          sectionBkgColor2: "#161b22",
          altSectionBkgColor: "#161b22",
          taskBkgColor: "#21262d",
          taskBorderColor: "#30363d",
          activeTaskBkgColor: "#30363d",
          activeTaskBorderColor: "#8b949e",
          doneTaskBkgColor: "#161b22",
          doneTaskBorderColor: "#30363d",
          taskTextColor: "#e6edf3",
          taskTextLightColor: "#e6edf3",
          taskTextDarkColor: "#e6edf3",
          taskTextOutsideColor: "#e6edf3",
          taskTextClickableColor: "#79c0ff",
          gridColor: "#30363d",
          todayLineColor: "#8b949e",
        },
        // Flowchart node labels default to HTML labels inside a <foreignObject>,
        // which Mermaid sizes correctly in Chromium/Firefox here but is a known
        // WebKit/Safari intrinsic-sizing failure mode (label text clips instead
        // of wrapping/fitting). Native SVG text labels are measured the same
        // way in every engine, so they can't clip like that.
        flowchart: { htmlLabels: false, useMaxWidth: true },
      });
      return renderAll(mermaid);
    })
    .catch(function (err) {
      console.error("mermaid-init: failed to load/run Mermaid", err);
    });

  // mermaid.render() lays each diagram out in its own internal detached
  // container and hands back a plain SVG string — unlike mermaid.run(),
  // which measures text directly against the live target element. On this
  // page that live-measurement path returned a bogus ~300px-wide layout for
  // the first diagram processed, so render()-per-diagram is used instead.
  async function renderAll(mermaid) {
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
})();
