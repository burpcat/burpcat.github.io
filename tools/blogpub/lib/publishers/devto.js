/**
 * Dev.to publisher — POST https://dev.to/api/articles
 * Uses Node's global fetch, matching scripts/fetch-github.js's style
 * (no HTTP client dependency).
 *
 * Always creates the article as a Dev.to DRAFT (published: false) — the
 * user does a final look and clicks "publish" from Dev.to's own dashboard.
 */
async function publish(postData) {
  const apiKey = process.env.DEVTO_API_KEY;
  if (!apiKey) {
    throw new Error("DEVTO_API_KEY is not set — add it to .env (see .env.example)");
  }

  // Dev.to: max 4 tags, alphanumeric only, no spaces/hyphens.
  const tags = (postData.tags || [])
    .filter((t) => t !== "posts")
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 4);

  const res = await fetch("https://dev.to/api/articles", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      article: {
        title: postData.title,
        body_markdown: postData.markdownBody,
        published: false,
        tags,
        canonical_url: postData.canonicalUrl,
        description: postData.excerpt,
        main_image: postData.coverImageUrl || undefined,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && data.error) || `Dev.to API returned ${res.status}`);
  }
  return { url: data.url };
}

module.exports = { publish };
