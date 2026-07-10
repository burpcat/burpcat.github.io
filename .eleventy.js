const rssPlugin = require("@11ty/eleventy-plugin-rss");

module.exports = function (eleventyConfig) {

  // ── plugins ──
  eleventyConfig.addPlugin(rssPlugin);

  // ── pass-throughs ──
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/audio");

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
