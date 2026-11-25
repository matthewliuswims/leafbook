#!/usr/bin/env bash
set -euo pipefail

cd "$LEAFBOOK_ROOT"
node="$1"
cli="$2"
export PATH="$(dirname "$node"):$PATH"
export GIT_TERMINAL_PROMPT=0
export LEAFBOOK_DAEMON=1

if [ -f "${LEAFBOOK_DAEMON_LOG:-}" ] &&
  [ "$(stat -f%z "$LEAFBOOK_DAEMON_LOG")" -gt 5242880 ]; then
  : > "$LEAFBOOK_DAEMON_LOG"
fi

clean_main() {
  [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "$LEAFBOOK_ROOT" ] &&
    [ "$(git branch --show-current)" = main ] &&
    dirty="$(GIT_OPTIONAL_LOCKS=0 git status --porcelain)" &&
    [ -z "$dirty" ]
}

# Fetch and fast-forward before Next reads the notes.
if clean_main && git remote get-url origin >/dev/null 2>&1; then
  before="$(git rev-parse HEAD)"
  if git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=15 \
    fetch origin +refs/heads/main:refs/remotes/origin/main &&
    clean_main && git merge --ff-only origin/main; then
    if [ -f package.json ] && ! git diff --quiet "$before" HEAD -- package.json package-lock.json; then
      npm install --no-audit --no-fund || echo "Install failed. Trying the available dependencies." >&2
    fi
  else
    echo "Could not fast-forward clean main. Serving the current checkout." >&2
  fi
fi

export LEAFBOOK_DAEMON_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
exec "$node" "$cli" dev
