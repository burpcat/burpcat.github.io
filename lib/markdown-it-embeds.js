/**
 * markdown-it-embeds — a small block rule giving burpieland the "paste a URL,
 * get a rich embed" convenience that Dev.to (Liquid tags) and Hashnode
 * (Embedly) ship natively, WITHOUT depending on the site's template engine.
 *
 * Syntax: a line by itself of the form
 *
 *     @[provider](argument)
 *
 * e.g. `@[youtube](dQw4w9WgXcQ)`, `@[codepen](user/pen/abcdef)`,
 *      `@[tweet](1234567890)`, `@[spotify](track/xxxx)`.
 *
 * Deterministic-iframe providers render inline; tweet/gist emit a placeholder
 * element hydrated client-side by /js/embeds.js (keeps the build static and
 * network-free).
 */

const BLOCK_RE = /^@\[([a-z0-9]+)\]\(([^)\n]+)\)\s*$/i;

// Only ever interpolate values through these — arguments come from post source,
// but we still refuse to trust them into raw HTML unescaped.
const escAttr = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function videoFrame(src, title) {
  return `<div class="embed embed-video"><iframe src="${escAttr(src)}" title="${escAttr(title)}" loading="lazy" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
}
function codeFrame(src, title) {
  return `<div class="embed embed-code"><iframe src="${escAttr(src)}" title="${escAttr(title)}" loading="lazy" frameborder="0" allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"></iframe></div>`;
}

const PROVIDERS = {
  youtube: (id) => videoFrame(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`, "YouTube video"),
  vimeo: (id) => videoFrame(`https://player.vimeo.com/video/${encodeURIComponent(id)}`, "Vimeo video"),
  loom: (id) => videoFrame(`https://www.loom.com/embed/${encodeURIComponent(id)}`, "Loom video"),

  // codepen arg: "user/pen/hash"
  codepen: (arg) => {
    const [user, , hash] = arg.split("/");
    if (!user || !hash) return null;
    return codeFrame(`https://codepen.io/${encodeURIComponent(user)}/embed/${encodeURIComponent(hash)}?default-tab=result`, "CodePen");
  },
  codesandbox: (id) => codeFrame(`https://codesandbox.io/embed/${encodeURIComponent(id)}`, "CodeSandbox"),
  stackblitz: (id) => codeFrame(`https://stackblitz.com/edit/${encodeURIComponent(id)}?embed=1`, "StackBlitz"),
  // replit arg: "@user/slug"
  replit: (arg) => codeFrame(`https://replit.com/${arg.split("/").map(encodeURIComponent).join("/")}?embed=true`, "Replit"),

  // spotify arg: "track/ID" | "episode/ID" | "playlist/ID"
  spotify: (arg) => {
    const tall = /^(playlist|album|artist)\//.test(arg);
    return `<div class="embed embed-spotify"><iframe src="https://open.spotify.com/embed/${arg.split("/").map(encodeURIComponent).join("/")}" title="Spotify" loading="lazy" frameborder="0" height="${tall ? 352 : 152}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  },

  // Hydrated client-side by /js/embeds.js.
  tweet: (id) => `<div class="embed-placeholder embed-tweet" data-tweet="${escAttr(id)}">Loading tweet…</div>`,
  gist: (arg) => `<div class="embed-placeholder embed-gist" data-gist="${escAttr(arg)}">Loading gist…</div>`,

  // github arg: "owner/repo" → static link card (no live API call at build).
  github: (arg) => {
    const [owner, repo] = arg.split("/");
    if (!owner || !repo) return null;
    return `<a class="embed-repo" href="https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}" target="_blank" rel="noopener"><span class="embed-repo-icon" aria-hidden="true">◈</span><span class="embed-repo-name">${escAttr(owner)}/${escAttr(repo)}</span><span class="embed-repo-host">github.com</span></a>`;
  },
};

module.exports = function embedsPlugin(md) {
  md.block.ruler.before("paragraph", "embed", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const max = state.eMarks[startLine];
    const line = state.src.slice(start, max);

    const m = BLOCK_RE.exec(line);
    if (!m) return false;
    const provider = m[1].toLowerCase();
    if (!PROVIDERS[provider]) return false;
    const html = PROVIDERS[provider](m[2].trim());
    if (html == null) return false;
    if (silent) return true;

    const token = state.push("html_block", "", 0);
    token.map = [startLine, startLine + 1];
    token.content = html + "\n";
    state.line = startLine + 1;
    return true;
  });
};
