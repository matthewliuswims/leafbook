# Leafbook

Leafbook serves a folder of Markdown files as a tabbed notes site. Agents work
directly in the files. In the browser you can search, jump to headings, and make
small edits with a live preview. Each note has its own URL.

**Local only.** Leafbook has no login and can write to your notes. It listens on
`127.0.0.1`. Never deploy it publicly.

## Try the starter

With Node.js 20 or later, run these commands from the Leafbook checkout.

```sh
npm install
LEAFBOOK_ROOT=examples/starter npm run dev
```

Open [Welcome](http://127.0.0.1:3000/Welcome). The starter includes a nested tab,
an archive, a footnote, and a local image.

## Use it in a notes repo

From your notes repo, install Leafbook from a local checkout or your Git host.
If the folder needs a `package.json`, run `npm init -y` first.
For a local checkout, first run `npm install` in the Leafbook checkout.

npm applies dependency overrides from the notes repo. Copy the
`overrides` block from [Leafbook's package.json](package.json) into the notes
repo's `package.json` before installing to pick up the CSS dependency fixes.

```sh
npm install /path/to/leafbook
npx leafbook dev
```

Use `npm install github:OWNER/leafbook` for a GitHub dependency. Commit the
package manifest and lockfile. Add `.leafbook/` to the notes repo's
`.gitignore`.

- `npx leafbook build` builds the production app.
- `npx leafbook start` serves the last successful build.
- `npx leafbook preview` prints a URL and starts a background dev server if
  needed. A primary checkout uses its daemon when available. Linked worktrees
  choose a port from their configured range and reuse their own server.
- `npx leafbook worktree my-task` creates a sibling worktree from `origin/main`,
  pushes the new branch, and opens a draft PR. This needs an authenticated
  GitHub CLI and a GitHub remote named `origin`. In the worktree, run
  `npm install` and `npx leafbook preview`.

The CLI stages Leafbook's app code and links its installed dependencies into
`.leafbook/` under the notes root. Next.js writes its build files in that
staging folder. Notes and assets stay in their original folders and are read
live, including under `start`. Build snapshots let a running server keep its
files while a new build runs. You can remove `.leafbook/` after stopping your
servers.

## Notes and assets

- Put one `.md` file per tab in `content/`. The filename without the extension is
  the URL slug. For example, `Field Notes.md` opens at `/Field%20Notes`.
- Set `title:` for the display name, `order:` for sidebar order, and `parent:`
  to the parent's filename stem to nest a tab. The lowest order opens at `/`.
  Optional `todo: true` marks a placeholder. `copyButtons: true` adds a Copy
  button to blockquotes.
- Move superseded tabs to `content/archive/` and update their links to
  `/archive/<slug>`. Keep `content/archive/README.md` for archive instructions
  if needed.
- Put assets in `public/` and link from the site root. For example,
  `public/maps/trail.svg` is available at `/maps/trail.svg`. Reserve `/search`
  for search and `/api/`, `/_next/`, and `/_leafbook/` for the app.
- Use numbered footnotes for external claims. Put the entries under
  `## References`. See [the starter note](examples/starter/content/Welcome.md).

## Configuration

All fields in `leafbook.config.json` are optional.

| Field               | Default                          | Purpose                                  |
| ------------------- | -------------------------------- | ---------------------------------------- |
| `title`             | `Leafbook`                       | Site title                               |
| `sidebarLabel`      | `Notes`                          | Label below the title                    |
| `contentDir`        | `content`                        | Notes folder relative to the notes root  |
| `publicDir`         | `public`                         | Assets folder relative to the notes root |
| `devPort`           | `3000`                           | Port for dev and production servers      |
| `daemonPort`        | `42600`                          | Port for the always-on server            |
| `daemonLabel`       | `com.leafbook.notes.<root-hash>` | macOS LaunchAgent label                  |
| `worktreePortRange` | `[42601, 42699]`                 | Inclusive preview port range             |
| `check`             | none                             | Private-info check settings (see below)  |

`LEAFBOOK_ROOT` selects the notes root and defaults to the CLI's working
directory. Set `LEAFBOOK_CONFIG` to use a different config file. Relative config
paths resolve from the notes root. `LEAFBOOK_PORT` overrides the port to start
or install. `LEAFBOOK_OUTPUT_DIR` overrides `.leafbook/`. For a read-only check,
point the output to a temporary directory and make GET requests. Use a separate
output directory for each checkout. Restart the server to apply config changes.

## Keep private info out

`npx leafbook check [folder]` scans a folder before you commit or publish it.
It fails on:

- Emails, phone numbers, Social Security numbers, street addresses, and
  labeled ID numbers (NPI, MRN, DOB, member, policy, or account numbers).
- API keys, tokens, and private keys.
- Home folder paths that show a username, and images embedded as base64.
- Binary files, such as screenshots and PDFs, unless approved.
- Private words you list.

In a Git checkout it scans what Git would commit. Results show only the first
letters of each match, so CI logs stay safe to share. Placeholder emails at
`example.com` and 555-01xx phone numbers pass.

Add your private words to `leafbook.config.json` under `check`. They stay in
your repo, not in Leafbook.

```json
{
  "check": {
    "words": ["Acme Health"],
    "wordsFrom": [{ "dir": "content/emails", "frontmatter": "to" }],
    "allowWords": ["gray"],
    "allowFiles": ["public/logo.png"],
    "ignore": ["vendor/"]
  }
}
```

- `words`: names, codenames, and terms that must never appear.
- `wordsFrom`: pull names from a frontmatter field in every note in a folder,
  so a new contact is covered as soon as their note exists. Each word of a
  multi-word name is blocked too.
- `allowWords`: common words that a pulled name made too strict.
- `allowFiles` and `ignore`: exact paths, or folders ending in `/`.

Mark a single false positive by adding `leafbook-check-allow` to that line.

To publish a folder from a private repo, for example a copy of Leafbook you
keep inside your notes, run the check on that folder from the notes root:
`npx leafbook check leafbook/`. Run it in a pre-commit hook, in CI, and in
the publish job, so nothing depends on remembering.

## Always-on server on macOS

Run these commands from the primary notes checkout.

```sh
npx leafbook daemon install
npx leafbook daemon refresh
npx leafbook daemon stop
```

The LaunchAgent starts at login and restarts after a crash. On startup it
fast-forwards a clean `main` from `origin/main` before serving. The sidebar's
Refresh button restarts the agent and shows the last refresh time. The log is
in `~/Library/Logs/<daemonLabel>.log`. Stopping the agent frees the port until
the next login or refresh. Reinstall to change the installed port or config path.
