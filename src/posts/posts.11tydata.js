// Directory data for all blog posts. This lives as JS rather than JSON so the
// permalink can be a function — post bodies are compiled with the Nunjucks
// template engine disabled (see .eleventy.js `markdownTemplateEngine: false`),
// so a `{{ page.fileSlug }}` permalink string would no longer interpolate.
module.exports = {
  layout: "post.njk",
  tags: ["posts"],
  permalink: (data) => `/blog/${data.page.fileSlug}/`,
};
