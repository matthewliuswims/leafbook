#!/usr/bin/env bash
# Start a task in its own sibling worktree with a branch and draft PR.
set -euo pipefail

cd "${LEAFBOOK_ROOT:-.}"
command -v gh >/dev/null || { echo "Install and sign in to GitHub CLI first." >&2; exit 1; }
git remote get-url origin >/dev/null
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
slug=${1:-sess-$(date +%s)-$$}
if ! [[ $slug =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "error: name must use a-z, 0-9, and -." >&2
  exit 1
fi
wt="$(dirname "$main_root")/$(basename "$main_root")-$slug"
if [ -e "$wt" ]; then
  echo "error: $wt already exists; pick a different name." >&2
  exit 1
fi

git -C "$main_root" fetch -q origin main
git -C "$main_root" worktree add -q -b "$slug" "$wt" origin/main
echo "Worktree ready at $wt"
git -C "$wt" commit --allow-empty -q -m "Bootstrap worktree $slug"
git -C "$wt" push -q -u origin "$slug"
cd "$wt"
gh pr create --draft --base main --head "$slug" \
  --title "Worktree $slug" --body "Draft. Description to follow."
printf 'From the worktree, run npm install and npx leafbook preview.\n'
