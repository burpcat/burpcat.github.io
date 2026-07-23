# blogpub

A small local CLI for writing posts and pushing them into this site, with
optional syndication to Dev.to. Everything runs on your own machine — it
never touches git or pushes anything for you.

## The workflow

```
npm run blog:new       -- <slug>      # 1. scaffold a draft
                                        #    (edit drafts/<slug>/index.md + post.json)
npm run blog:publish   -- <slug>      # 2. turn the draft into a real post in src/posts/
git add -A && git commit && git push  # 3. you commit + push (deploy runs on push to master)
npm run blog:syndicate -- <slug>      # 4. once it's live, optionally cross-post to Dev.to
```

The `--` before the slug is required — it tells `npm` to pass the argument
through to the script instead of trying to parse it itself. Forgetting it is
the most common mistake; if a command seems to ignore your slug, check for
the `--`.

## 1. Start a draft

```
npm run blog:new -- my-post-slug
```

This creates:

```
drafts/my-post-slug/
  index.md     # the post body — plain markdown, NO front matter
  post.json    # all metadata (see schema below)
  images/      # drop any images this post uses in here
```

`drafts/` is gitignored — it's scratch space. Nothing in it is public or
committed; only what `blog:publish` writes into `src/posts/` and
`src/images/posts/` is.

## 2. Write the post

**`index.md`** is pure markdown — headings, `**bold**`, `` `code` ``, fenced
code blocks (with syntax highlighting), lists, links, all work as normal.

Reference any image you dropped in `images/` using the path it'll live at
once published:

```markdown
![A description of the image](/images/posts/my-post-slug/screenshot.png)
```

If you want a caption, write the `<figure>` directly as raw HTML (markdown
passes HTML straight through):

```html
<figure>
  <img src="/images/posts/my-post-slug/screenshot.png" alt="...">
  <figcaption>Caption text here.</figcaption>
</figure>
```

**`post.json`** holds the metadata:

```json
{
  "title": "My post title",
  "date": "2026-07-22",
  "excerpt": "One or two sentences shown on the /blog listing page.",
  "slug": null,
  "tags": ["ai", "career"],
  "coverImage": "cover.jpg",
  "coverImageAlt": "Description for accessibility",
  "crosspost": { "devto": false }
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | |
| `date` | yes | `YYYY-MM-DD` |
| `excerpt` | yes | Shown on the blog listing page |
| `slug` | no | Overrides the URL slug; defaults to the `drafts/<slug>/` folder name |
| `tags` | no | Shown as pills on the post and listing page |
| `coverImage` | no | **Filename only**, relative to this draft's own `images/` folder — not a full path |
| `coverImageAlt` | no | Alt text for the cover image; falls back to the title if omitted |
| `crosspost` | no | Object of `{ target: true/false }`. Only `devto` exists today; new targets will be added here later without changing this schema |

Any image referenced in `coverImage` must actually exist in
`drafts/<slug>/images/` — `blog:publish` checks this and refuses to publish
otherwise.

## 3. Publish it into the site

```
npm run blog:publish -- my-post-slug
```

This:
1. Validates `post.json`
2. Writes `src/posts/<date>-<slug>.md` with generated Eleventy front matter + your markdown body
3. Copies everything from `drafts/<slug>/images/` into `src/images/posts/<slug>/`
4. Prints the eventual live URL and a reminder of what to do next

Add `--dry-run` first if you want to see exactly what would be written
without touching disk. Add `--force` if you need to overwrite a post that
already exists at that path (e.g. republishing after fixing a mistake).

**Nothing is committed automatically.** Review the generated file, then
commit and push it yourself as you normally would. The site deploys on push
to `master`.

## 4. Cross-post to Dev.to (optional)

One-time setup:
1. Create a [Dev.to](https://dev.to) account if you don't have one.
2. Generate a personal API key at `dev.to/settings/extensions`.
3. Add it to a `.env` file at the repo root (see `.env.example`):
   ```
   DEVTO_API_KEY=your-key-here
   ```
   `.env` is gitignored — this key never gets committed.

Once your post is live (after step 3 above has actually deployed), run:

```
npm run blog:syndicate -- my-post-slug
```

This reads the *published* post from `src/posts/`, rewrites any
`/images/...` paths to full URLs pointing back at your live site (so Dev.to
can actually load them), and creates a **draft article on Dev.to** — it does
not go live there automatically. Log into Dev.to and hit "publish" yourself
once you've given it a final look.

Which targets it syndicates to comes from the post's own `crosspost` field
(set at draft time in `post.json`, carried through into the published post's
front matter). You can override this for a one-off run with `--target`:

```
npm run blog:syndicate -- my-post-slug --target devto
```

Add `--dry-run` to print the exact payload that would be sent without
calling the Dev.to API.

**Why two separate steps (publish, then syndicate) instead of one?** Dev.to
articles carry a `canonical_url` pointing back at the original post on this
site, for SEO. That URL only resolves once the post is actually deployed —
so syndicating has to happen *after* you've pushed and the build has gone
out, not in the same step as writing the file.

**Known limitation:** running `blog:syndicate` again on a post that's
already been syndicated creates a *new* Dev.to draft rather than updating
the old one. There's no de-duplication yet — if you need to fix a syndicated
post, edit it directly on Dev.to.

## Editing an already-published post

Just hand-edit the file directly in `src/posts/*.md` — it's a normal
Eleventy content file at that point, no CLI involved. The `drafts/` folder
is only for the initial authoring step.

## Adding more crosspost targets later

Each target is a small module in `lib/publishers/` exporting
`async publish(postData) -> { url }`, registered in
`lib/publishers/index.js`. Hashnode and Medium aren't wired up yet:
Hashnode's API currently requires a Pro-plan publication, and Medium no
longer issues new integration tokens — both are just not practical to
support for a fresh setup right now. Revisit if that changes, or if you
already hold credentials that make one of them viable.
