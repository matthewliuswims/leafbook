# Working on Leafbook

Leafbook is a reusable Next.js 15 package. Keep engine code in
`app/`, `components/`, `lib/`, and `scripts/`. Use the generic starter
for development. Keep all private notes and assets in separate checkouts.

- Install with `npm install`. Run `npm run check`, `npm run format:check`,
  `npm run typecheck`, `npm test`, and `npm run build` before handing off.
  CI runs the same steps on every pull request.
- Leafbook is public. Never commit real names, contact details, customer or
  business data, screenshots, or local paths. `npm run check` and the
  pre-commit hook enforce this; fix findings instead of silencing them.
- Preview with `LEAFBOOK_ROOT=examples/starter npm run dev`. Restart to pick
  up engine source changes. Check the affected note's URL and behavior.
- Verify package or CLI changes from an installed copy in a separate notes
  folder. Verify edits and saves on disposable sample files.
- For repos with an `origin`, use worktrees and draft PRs. Enable the included
  commit and push hooks with `git config core.hooksPath .githooks`.
