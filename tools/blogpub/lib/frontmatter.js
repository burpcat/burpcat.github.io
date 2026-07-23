/**
 * Builds Eleventy front matter from a post.json + resolved slug.
 *
 * Values are emitted via JSON.stringify rather than hand-rolled YAML —
 * a JSON string/array/object literal is also valid YAML flow syntax, which
 * sidesteps escaping bugs (colons/quotes in titles, etc.) entirely.
 *
 * Deliberately does NOT emit layout/permalink/tags:["posts"] — those already
 * come from src/posts/posts.json's directory-data defaults.
 */
function buildFrontMatter(meta) {
  const lines = [
    `title: ${JSON.stringify(meta.title)}`,
    `date: ${meta.date}`,
    `excerpt: ${JSON.stringify(meta.excerpt)}`,
  ];

  if (meta.tags && meta.tags.length) {
    lines.push(`tags: ${JSON.stringify(meta.tags)}`);
  }

  if (meta.coverImage) {
    lines.push(`coverImage: ${JSON.stringify(`/images/posts/${meta.slug}/${meta.coverImage}`)}`);
    if (meta.coverImageAlt) {
      lines.push(`coverImageAlt: ${JSON.stringify(meta.coverImageAlt)}`);
    }
  }

  if (meta.crosspost) {
    lines.push(`crosspost: ${JSON.stringify(meta.crosspost)}`);
  }

  return `---\n${lines.join("\n")}\n---\n\n`;
}

function buildPostFile(meta, body) {
  return buildFrontMatter(meta) + body.trimStart();
}

/**
 * Parses front matter out of an already-published post file. Handles both
 * the JSON-flow-style front matter this tool generates and plain hand-written
 * YAML scalars (falls back to a raw string when a value isn't valid JSON).
 */
function parseFrontMatter(fileContents) {
  const match = fileContents.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: fileContents };

  const [, fmBlock, body] = match;
  const data = {};
  for (const line of fmBlock.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    try {
      data[key] = JSON.parse(rawValue);
    } catch {
      data[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body };
}

module.exports = { buildFrontMatter, buildPostFile, parseFrontMatter };
