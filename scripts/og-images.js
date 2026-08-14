/**
 * Build-time OpenGraph card generator. For every post without its own
 * coverImage, renders a 1200×630 branded PNG to _site/og/<slug>.png (matching
 * the `/og/<fileSlug>.png` reference in base.njk); also writes og-default.png
 * for non-post pages.
 *
 * Runs AFTER eleventy in `npm run build`. Best-effort: any failure is logged
 * and the process still exits 0 so a font/render hiccup never fails the deploy
 * (base.njk falls back gracefully — a missing card just means a text unfurl).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POSTS_DIR = path.join(ROOT, "src", "posts");
const OUT_DIR = path.join(ROOT, "_site", "og");
const FONT = path.join(ROOT, "assets", "fonts", "OpenSans-SemiBold.ttf");
const SITE_NAME = "burpcat";

function fileSlug(filename) {
  return filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function frontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    try { val = JSON.parse(val); } catch { val = val.replace(/^["']|["']$/g, ""); }
    data[key] = val;
  }
  return data;
}

function card(title, tags) {
  const tagLine = (tags || []).filter((t) => t !== "posts").map((t) => `#${t}`).join("  ");
  return {
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", width: "1200px", height: "630px",
        padding: "72px", backgroundColor: "#0C1512", color: "#E7DFCF",
        justifyContent: "space-between", fontFamily: "Open Sans",
      },
      children: [
        { type: "div", props: { style: { display: "flex", fontSize: "28px", color: "#7FB59B", letterSpacing: "2px" }, children: SITE_NAME.toUpperCase() } },
        { type: "div", props: { style: { display: "flex", fontSize: "68px", fontWeight: 600, lineHeight: 1.15, maxWidth: "1000px" }, children: title } },
        { type: "div", props: { style: { display: "flex", fontSize: "30px", color: "#E0975A" }, children: tagLine } },
      ],
    },
  };
}

async function main() {
  let satori, sharp, fontData;
  try {
    const s = require("satori");
    satori = s.default || s;
    sharp = require("sharp");
    fontData = fs.readFileSync(FONT);
  } catch (e) {
    console.warn(`[og-images] skipped (deps/font unavailable): ${e.message}`);
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fonts = [{ name: "Open Sans", data: fontData, weight: 600, style: "normal" }];

  async function render(el, outPath) {
    const svg = await satori(el, { width: 1200, height: 630, fonts });
    await sharp(Buffer.from(svg)).png().toFile(outPath);
  }

  let count = 0;
  try {
    await render(card("A small bright thing in a vast quiet space", []), path.join(ROOT, "_site", "og-default.png"));
    for (const file of fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"))) {
      const data = frontMatter(fs.readFileSync(path.join(POSTS_DIR, file), "utf8"));
      if (data.coverImage) continue; // its own cover is the OG image
      await render(card(data.title || fileSlug(file), data.tags), path.join(OUT_DIR, `${fileSlug(file)}.png`));
      count++;
    }
    console.log(`[og-images] wrote og-default.png + ${count} post card(s)`);
  } catch (e) {
    console.warn(`[og-images] render failed (build continues): ${e.message}`);
  }
}

main();
