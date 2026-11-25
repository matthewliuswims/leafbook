import { execFileSync } from "node:child_process";
import { getConfig } from "./config.mjs";

export type RefreshState = {
  startedAtLabel: string | null;
  sha: string | null;
  committedAt: string | null;
  subject: string | null;
  dirty: boolean;
  daemon: boolean;
};

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: getConfig().root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function formatLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getRefreshState(): RefreshState {
  const isRepo = git(["rev-parse", "--show-toplevel"]) === getConfig().root;
  const head = isRepo ? git(["log", "-1", "--format=%h%x1f%cI%x1f%s"]) : null;
  const [sha = null, committedAt = null, subject = null] =
    head?.split("\x1f") ?? [];
  const dirty =
    isRepo && Boolean(git(["status", "--porcelain", "--untracked-files=no"]));
  const daemon =
    process.platform === "darwin" && process.env.LEAFBOOK_DAEMON === "1";
  const startedAt = daemon
    ? (process.env.LEAFBOOK_DAEMON_STARTED_AT ?? committedAt)
    : null;

  return {
    startedAtLabel: formatLabel(startedAt),
    sha,
    committedAt,
    subject,
    dirty,
    daemon,
  };
}
