# Working on this notebook

- Add one Markdown file per tab in `content/`. Set `title:` and `order:` in
  the frontmatter. Lower numbers come first. Set `parent:` to the parent
  tab's filename without `.md`.
- Move retired notes to `content/archive/` and point links to
  `/archive/<slug>`. Keep the original content.
- Cite external claims with `[^1]` and put
  `[^1]: Publisher, "Title" (date). <URL>. What it supports.` under
  `## References`. Number citations in the order they appear in each note.
- Put local images under `public/` and link to them relative to the site root.
- In a GitHub notes repo, run `npx leafbook worktree my-task` to start in a
  linked checkout with a draft PR. In that checkout, install dependencies and
  run `npx leafbook preview`. Share the page URL, for example
  `http://127.0.0.1:<port>/Field%20Notes`.
- Before publishing anything from this repo, run `npx leafbook check` on
  it. List private names under `check` in `leafbook.config.json`.
