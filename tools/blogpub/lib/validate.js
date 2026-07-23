const fs = require("fs");
const path = require("path");

const KNOWN_CROSSPOST_TARGETS = ["devto"];

/**
 * Validates a draft's post.json before it's turned into a published post.
 * Returns { errors, warnings } — publish must abort on any error, but should
 * only print (not fail on) warnings.
 */
function validatePost(meta, draftDir) {
  const errors = [];
  const warnings = [];

  if (!meta.title || typeof meta.title !== "string") {
    errors.push('post.json: "title" is required');
  }
  if (!meta.date || isNaN(new Date(meta.date).getTime())) {
    errors.push('post.json: "date" is required and must be a parseable date (YYYY-MM-DD)');
  }
  if (!meta.excerpt || typeof meta.excerpt !== "string") {
    errors.push('post.json: "excerpt" is required');
  }

  if (meta.coverImage) {
    const imgPath = path.join(draftDir, "images", meta.coverImage);
    if (!fs.existsSync(imgPath)) {
      errors.push(`post.json: coverImage "${meta.coverImage}" not found in drafts/<slug>/images/`);
    }
  }

  if (meta.crosspost && typeof meta.crosspost === "object") {
    for (const key of Object.keys(meta.crosspost)) {
      if (!KNOWN_CROSSPOST_TARGETS.includes(key)) {
        warnings.push(`post.json: unrecognized crosspost target "${key}" (ignored for now)`);
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validatePost };
