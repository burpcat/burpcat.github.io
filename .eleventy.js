const rssPlugin = require("@11ty/eleventy-plugin-rss");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const { eleventyImageTransformPlugin } = require("@11ty/eleventy-img");

const markdownItAnchor = require("markdown-it-anchor");
const markdownItFootnote = require("markdown-it-footnote");
const markdownItTaskLists = require("markdown-it-task-lists");
const markdownItContainer = require("markdown-it-container");
const markdownItDeflist = require("markdown-it-deflist");
const markdownItKatex = require("markdown-it-katex");

const embedsPlugin = require("./lib/markdown-it-embeds");

// Shared slug function so heading ids and the generated TOC agree.
const slugify = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\wÀ-￿\- ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// A markdown-it :::note / :::tip / :::warn / :::info container → styled callout.
function calloutContainer(md, name, label) {
  md.use(markdownItContainer, name, {
    render(tokens, idx) {
      if (tokens[idx].nesting === 1) {
        return `<div class="callout callout-${name}"><p class="callout-label">${label}</p>\n`;
      }
      return "</div>\n";
    },
  });
}

module.exports = function (eleventyConfig) {

  // ── markdown engine ──
  // Stock markdown-it, now extended with the plugins hosted platforms ship by
  // default: heading anchors, TOC (via the `toc` filter below), footnotes,
  // task lists, callouts, definition lists, KaTeX math, autolinking, and the
  // custom @[provider](arg) embed syntax (see lib/markdown-it-embeds.js).
  eleventyConfig.amendLibrary("md", (md) => {
    md.set({ html: true, linkify: true, typographer: true });
    md.use(markdownItAnchor, {
      slugify,
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        symbol: "#",
        placement: "after",
        class: "header-anchor",
        ariaHidden: true,
      }),
    });
    md.use(markdownItFootnote);
    md.use(markdownItTaskLists, { label: true, labelAfter: true });
    md.use(markdownItDeflist);
    md.use(markdownItKatex);
    md.use(embedsPlugin);
    calloutContainer(md, "note", "Note");
    calloutContainer(md, "tip", "Tip");
    calloutContainer(md, "warn", "Warning");
    calloutContainer(md, "info", "Info");
    return md;
  });

  // ── plugins ──
  eleventyConfig.addPlugin(rssPlugin);
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    extensions: "html",
    formats: ["webp", "jpeg"],
    widths: [400, 800, 1300, "auto"],
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
        sizes: "(max-width: 700px) 100vw, 700px",
      },
    },
    transformOnRequest: process.env.ELEVENTY_RUN_MODE === "serve",
  });

  // ── pass-throughs ──
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/audio");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  // Raw source images, kept alongside eleventy-img's optimized derivatives
  // (in a separate /img/ tree) so posts.json/blogpub can rely on a stable,
  // predictable URL for syndication instead of eleventy-img's hashed paths.
  eleventyConfig.addPassthroughCopy("src/images");

  // ── favicon / app icons ──
  ["favicon.ico", "favicon.svg", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "site.webmanifest"]
    .forEach((f) => eleventyConfig.addPassthroughCopy(`src/${f}`));

  // ── collections ──
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("src/posts/*.md").sort((a, b) => b.date - a.date)
  );

  // Every distinct tag (minus the blanket "posts" tag) → drives /tags/ pages.
  eleventyConfig.addCollection("tagList", (api) => {
    const tags = new Set();
    api.getFilteredByGlob("src/posts/*.md").forEach((post) => {
      (post.data.tags || []).forEach((t) => {
        if (t !== "posts") tags.add(t);
      });
    });
    return [...tags].sort((a, b) => a.localeCompare(b));
  });

  // Posts grouped by their `series` front-matter value, ordered oldest→newest
  // within each series so "part N of M" navigation reads correctly.
  eleventyConfig.addCollection("seriesMap", (api) => {
    const map = {};
    api
      .getFilteredByGlob("src/posts/*.md")
      .filter((p) => p.data.series)
      .sort((a, b) => a.date - b.date)
      .forEach((p) => {
        (map[p.data.series] = map[p.data.series] || []).push(p);
      });
    return map;
  });

  // ── filters ──
  eleventyConfig.addFilter("limit", (arr, n) => arr.slice(0, n));

  // YYYY·MM·DD date
  eleventyConfig.addFilter("dotDate", (dateObj) => {
    const d = new Date(dateObj);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}·${m}·${day}`;
  });

  // Reading time, 220 words per minute
  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) return "1 min read";
    const text = String(content).replace(/<[^>]*>/g, "");
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 220));
    return `${minutes} min read`;
  });

  // "is this post less than N days old" → for NEW badge
  eleventyConfig.addFilter("isRecent", (date, days = 14) => {
    if (!date) return false;
    const diff = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
    return diff < days;
  });

  // ISO date for RSS
  eleventyConfig.addFilter("isoDate", (dateObj) =>
    new Date(dateObj).toISOString()
  );

  eleventyConfig.addFilter("slug", slugify);

  // Posts carrying a given tag (newest first). Drives /tags/<tag>/ pages —
  // explicit rather than Eleventy's auto per-tag collections so the blanket
  // "posts" tag never leaks in.
  eleventyConfig.addFilter("selectByTag", (posts, tag) =>
    (posts || []).filter((p) => (p.data.tags || []).includes(tag))
  );

  // posts.json applies a blanket tags:["posts"] default that Eleventy merges
  // (not replaces) with a post's own front-matter tags — strip it back out
  // wherever tags are actually displayed to a reader.
  eleventyConfig.addFilter("displayTags", (tags) =>
    (tags || []).filter((t) => t !== "posts")
  );

  // Build a table of contents from the h2/h3 anchors markdown-it-anchor
  // already emitted into the rendered HTML. Returns ready-to-render HTML, or
  // "" when a post has fewer than two headings (nothing worth a TOC).
  eleventyConfig.addFilter("toc", (content) => {
    if (!content) return "";
    const headings = [...String(content).matchAll(
      /<h([23])[^>]*\bid="([^"]+)"[^>]*>(.*?)<\/h[23]>/gis
    )].map((m) => ({
      level: Number(m[1]),
      id: m[2],
      text: m[3]
        .replace(/<a class="header-anchor"[\s\S]*?<\/a>/g, "")
        .replace(/<[^>]*>/g, "")
        .trim(),
    }));
    if (headings.length < 2) return "";
    let html = '<nav class="post-toc" aria-label="Table of contents" data-pagefind-ignore><p class="post-toc-label">On this page</p><div class="post-toc-sections"><ul>';
    for (const h of headings) {
      html += `<li class="toc-h${h.level}"><a href="#${h.id}">${h.text}</a></li>`;
    }
    html += "</ul></div></nav>";
    return html;
  });

  // Posts sharing at least one tag with the current post, most-overlap first,
  // excluding the post itself. Used for the "related reading" block. Takes the
  // current post's raw tag list and url (the template `page` object has no
  // `.data`, so tags are passed in explicitly).
  eleventyConfig.addFilter("relatedPosts", function (posts, curTagsRaw, curUrl, n = 3) {
    const curTags = new Set((curTagsRaw || []).filter((t) => t !== "posts"));
    if (!curTags.size) return [];
    return posts
      .filter((p) => p.url !== curUrl)
      .map((p) => ({
        post: p,
        score: (p.data.tags || []).filter((t) => curTags.has(t)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.post.date - a.post.date)
      .slice(0, n)
      .map((x) => x.post);
  });

  // Keep code blocks out of the Pagefind search index — mermaid diagram source
  // and code snippets otherwise leak into search excerpts as noise.
  eleventyConfig.addTransform("pagefindIgnorePre", function (content) {
    const out = this.page && this.page.outputPath;
    if (typeof out === "string" && out.endsWith(".html")) {
      return content.replace(/<pre(?=[\s>])/g, "<pre data-pagefind-ignore");
    }
    return content;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    // Post bodies are pure markdown — NOT run through Nunjucks. This removes
    // the long-standing footgun where `{{ }}` / `{% %}` in prose or code
    // blocks were interpreted as template syntax. Layouts (.njk) are still
    // processed by htmlTemplateEngine below; embeds use the markdown-it
    // @[provider](arg) syntax rather than njk shortcodes.
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
};
