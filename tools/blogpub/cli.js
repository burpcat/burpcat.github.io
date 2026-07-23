#!/usr/bin/env node
/**
 * blogpub — local CLI for drafting, publishing, and syndicating burpieland posts.
 *
 *   npm run blog:new       -- <slug>
 *   npm run blog:publish   -- <slug> [--dry-run] [--force]
 *   npm run blog:syndicate -- <slug> [--target devto] [--dry-run]
 *
 * See tools/blogpub/README.md for the full workflow.
 */

const fs = require("fs");
const path = require("path");

const { loadEnv } = require("./lib/env");
const { validatePost } = require("./lib/validate");
const { buildPostFile, parseFrontMatter } = require("./lib/frontmatter");
const { copyDraftImages } = require("./lib/images");
const publishers = require("./lib/publishers");

const ROOT = path.join(__dirname, "..", "..");
const DRAFTS_DIR = path.join(ROOT, "drafts");
const POSTS_DIR = path.join(ROOT, "src", "posts");
const IMAGES_DIR = path.join(ROOT, "src", "images", "posts");
const SITE_DATA = path.join(ROOT, "src", "_data", "site.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readSite() {
  try {
    return JSON.parse(fs.readFileSync(SITE_DATA, "utf8"));
  } catch {
    return {};
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [k, v] = key.split("=");
        flags[k] = v;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function cmdNew(slug) {
  if (!slug) fail("Usage: npm run blog:new -- <slug>");
  const dir = path.join(DRAFTS_DIR, slug);
  if (fs.existsSync(dir)) fail(`drafts/${slug}/ already exists`);

  fs.mkdirSync(path.join(dir, "images"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "index.md"),
    `<!-- Write your post body here. Plain markdown -- no front matter. -->\n`
  );

  const today = new Date().toISOString().slice(0, 10);
  const skeleton = {
    title: "",
    date: today,
    excerpt: "",
    slug: null,
    tags: [],
    coverImage: null,
    coverImageAlt: "",
    crosspost: { devto: false },
  };
  fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify(skeleton, null, 2) + "\n");

  console.log(`Created drafts/${slug}/`);
  console.log("  - index.md   (write your post here)");
  console.log("  - post.json  (fill in title/date/excerpt/tags)");
  console.log("  - images/    (drop any images referenced by the post here)");
}

function cmdPublish(slug, flags) {
  if (!slug) fail("Usage: npm run blog:publish -- <slug> [--dry-run] [--force]");

  const draftDir = path.join(DRAFTS_DIR, slug);
  const metaPath = path.join(draftDir, "post.json");
  const bodyPath = path.join(draftDir, "index.md");

  if (!fs.existsSync(metaPath) || !fs.existsSync(bodyPath)) {
    fail(`drafts/${slug}/ is missing post.json or index.md -- run "npm run blog:new -- ${slug}" first`);
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (e) {
    fail(`post.json is not valid JSON: ${e.message}`);
  }
  const body = fs.readFileSync(bodyPath, "utf8");

  const { errors, warnings } = validatePost(meta, draftDir);
  warnings.forEach((w) => console.warn(`[warn] ${w}`));
  if (errors.length) {
    console.error("Cannot publish -- fix these first:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const finalSlug = meta.slug || slug;
  meta.slug = finalSlug;
  const targetFile = path.join(POSTS_DIR, `${meta.date}-${finalSlug}.md`);

  if (fs.existsSync(targetFile) && !flags.force) {
    fail(`${path.relative(ROOT, targetFile)} already exists -- pass --force to overwrite`);
  }

  const fileContents = buildPostFile(meta, body);
  const draftImagesDir = path.join(draftDir, "images");
  const imgCount = fs.existsSync(draftImagesDir)
    ? fs.readdirSync(draftImagesDir).filter((f) => fs.statSync(path.join(draftImagesDir, f)).isFile()).length
    : 0;

  if (flags["dry-run"]) {
    console.log(`--- Would write ${path.relative(ROOT, targetFile)} ---`);
    console.log(fileContents);
    console.log(`--- Would copy ${imgCount} image(s) to src/images/posts/${finalSlug}/ ---`);
    return;
  }

  fs.writeFileSync(targetFile, fileContents);
  copyDraftImages(draftImagesDir, path.join(IMAGES_DIR, finalSlug));

  const site = readSite();
  const liveUrl = site.url ? `${site.url}/blog/${finalSlug}/` : `/blog/${finalSlug}/`;

  console.log(`Wrote ${path.relative(ROOT, targetFile)}`);
  console.log(`Copied ${imgCount} image(s) to src/images/posts/${finalSlug}/`);
  console.log(`Live URL (once deployed): ${liveUrl}`);
  console.log("\nNext: review the file, then git add/commit/push to deploy.");
  console.log(`Once it's live, run: npm run blog:syndicate -- ${finalSlug}`);
}

async function cmdSyndicate(slug, flags) {
  if (!slug) fail("Usage: npm run blog:syndicate -- <slug> [--target devto] [--dry-run]");
  loadEnv();

  const matches = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(`-${slug}.md`));
  if (!matches.length) fail(`No published post found matching src/posts/*-${slug}.md`);

  const postFile = path.join(POSTS_DIR, matches[0]);
  const raw = fs.readFileSync(postFile, "utf8");
  const { data, body } = parseFrontMatter(raw);

  const site = readSite();
  const canonicalUrl = site.url ? `${site.url}/blog/${slug}/` : undefined;

  // Dev.to renders the syndicated copy on its own domain, so root-relative
  // /images/... references must become absolute URLs pointing back here.
  const absolutize = (text) =>
    site.url && text ? text.replace(/(["'(])\/images\//g, `$1${site.url}/images/`) : text;
  // coverImage is a standalone path (e.g. "/images/posts/slug/cover.png"),
  // not embedded in markdown/HTML syntax, so it needs a plain prefix instead.
  const absolutizePath = (imgPath) =>
    site.url && imgPath && imgPath.startsWith("/images/") ? `${site.url}${imgPath}` : imgPath;

  const postData = {
    title: data.title,
    markdownBody: absolutize(body.trim()),
    excerpt: data.excerpt,
    tags: data.tags || [],
    canonicalUrl,
    coverImageUrl: absolutizePath(data.coverImage),
  };

  const targets = flags.target
    ? [flags.target]
    : Object.entries(data.crosspost || {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);

  if (!targets.length) {
    console.log("No crosspost targets enabled for this post (set crosspost in its front matter, or pass --target).");
    return;
  }

  for (const target of targets) {
    const publisher = publishers[target];
    if (!publisher) {
      console.error(`[${target}] no publisher registered -- skipping`);
      continue;
    }
    if (flags["dry-run"]) {
      console.log(`--- [${target}] dry run payload ---`);
      console.log(JSON.stringify(postData, null, 2));
      continue;
    }
    try {
      const { url } = await publisher.publish(postData);
      console.log(`[${target}] created: ${url}`);
    } catch (e) {
      console.error(`[${target}] failed: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const { positional, flags } = parseArgs(rest);
  const [slug] = positional;

  switch (command) {
    case "new":
      cmdNew(slug);
      break;
    case "publish":
      cmdPublish(slug, flags);
      break;
    case "syndicate":
      await cmdSyndicate(slug, flags);
      break;
    default:
      console.error("Usage: node tools/blogpub/cli.js <new|publish|syndicate> <slug> [flags]");
      process.exit(1);
  }
}

main();
