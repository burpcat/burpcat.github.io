const rssPlugin = require("@11ty/eleventy-plugin-rss");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const { eleventyImageTransformPlugin } = require("@11ty/eleventy-img");

module.exports = function (eleventyConfig) {

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

  // posts.json applies a blanket tags:["posts"] default that Eleventy merges
  // (not replaces) with a post's own front-matter tags — strip it back out
  // wherever tags are actually displayed to a reader.
  eleventyConfig.addFilter("displayTags", (tags) =>
    (tags || []).filter((t) => t !== "posts")
  );

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
