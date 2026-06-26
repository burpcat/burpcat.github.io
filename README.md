# my site

A personal site built with [Eleventy](https://www.11ty.dev/), deployed to GitHub Pages.

## Get started

1. Read `CONTENT.md` — it walks through every personalization point in order.
2. `npm install`
3. `npm start` — opens at `localhost:8080`

## What this is

- Two-column homepage: experience + recent writing
- Markdown blog posts in `src/posts/`
- Auto-generated RSS feed at `/feed.xml`
- "Currently building" bar that auto-updates from your GitHub activity
- Reading-time estimates, accessible markup, calm mode toggle, mobile-first responsive
- Guestbook via Giscus (when you're ready)

## What this isn't

- Fake. Empty states stay empty until you fill them in. See `CONTENT.md`.

## Stack

- Eleventy v3
- `@11ty/eleventy-plugin-rss`
- Vanilla JS, no framework
- Hosted on GitHub Pages

## Deploy

Push to `main` → GitHub Action builds and deploys to the `gh-pages` branch. Set repo → Settings → Pages → source: `gh-pages` branch, one time.
