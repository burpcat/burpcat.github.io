/**
 * Fetches the latest public push from GitHub and writes it to src/_data/github.json
 * so the homepage can show "currently building <repo>".
 *
 * Runs at build time (in npm run build and in the GitHub Action).
 * If the fetch fails or no username is set, falls back gracefully — the site still builds.
 *
 * Configure your username in src/_data/site.json under `githubUsername`.
 */

const fs = require("fs");
const path = require("path");

const SITE_DATA = path.join(__dirname, "..", "src", "_data", "site.json");
const OUTPUT = path.join(__dirname, "..", "src", "_data", "github.json");

async function main() {
  let username = null;
  try {
    const site = JSON.parse(fs.readFileSync(SITE_DATA, "utf8"));
    username = site.githubUsername;
  } catch (e) {
    console.warn("[fetch-github] could not read site.json:", e.message);
  }

  // No username yet? Write a placeholder and exit cleanly.
  if (!username || username === "yourusername") {
    fs.writeFileSync(
      OUTPUT,
      JSON.stringify({ configured: false }, null, 2)
    );
    console.log("[fetch-github] no GitHub username configured — skipping");
    return;
  }

  try {
    const res = await fetch(
      `https://api.github.com/users/${username}/events/public`,
      { headers: { "User-Agent": "personal-site-build" } }
    );

    if (!res.ok) {
      console.warn(`[fetch-github] GitHub returned ${res.status} — skipping`);
      fs.writeFileSync(OUTPUT, JSON.stringify({ configured: true, available: false }, null, 2));
      return;
    }

    const events = await res.json();
    const push = events.find((e) => e.type === "PushEvent");

    if (!push) {
      console.log("[fetch-github] no recent PushEvent found");
      fs.writeFileSync(OUTPUT, JSON.stringify({ configured: true, available: false }, null, 2));
      return;
    }

    const repoFullName = push.repo.name;       // e.g. "yourusername/site-gen"
    const repoName = repoFullName.split("/")[1];
    const repoUrl = `https://github.com/${repoFullName}`;
    const commitMessage = push.payload?.commits?.[0]?.message?.split("\n")[0] || "";

    // Fetch the repo description (one extra call, OK at build time)
    let description = "";
    try {
      const repoRes = await fetch(
        `https://api.github.com/repos/${repoFullName}`,
        { headers: { "User-Agent": "personal-site-build" } }
      );
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        description = repoData.description || "";
      }
    } catch (e) { /* fine, leave blank */ }

    const data = {
      configured: true,
      available: true,
      repoName,
      repoUrl,
      description,
      commitMessage,
      lastPush: push.created_at,
    };

    fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2));
    console.log(`[fetch-github] ok: ${repoName} — "${description || commitMessage}"`);
  } catch (e) {
    console.warn("[fetch-github] error:", e.message);
    fs.writeFileSync(OUTPUT, JSON.stringify({ configured: true, available: false }, null, 2));
  }
}

main();
