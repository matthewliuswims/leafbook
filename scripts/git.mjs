import { execFileSync } from "node:child_process";
import path from "node:path";
import { packageDir } from "./runtime.mjs";

export function checkoutKind(root) {
  function git(...args) {
    return execFileSync(
      "git",
      ["-C", root, "rev-parse", "--path-format=absolute", ...args],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  }

  try {
    if (git("--show-toplevel") !== root) return "standalone";
    return git("--git-dir") === git("--git-common-dir")
      ? "primary"
      : "worktree";
  } catch {
    return "standalone";
  }
}

export function worktree(config, args) {
  execFileSync(
    "bash",
    [path.join(packageDir, "scripts/new-worktree.sh"), ...args],
    {
      cwd: config.root,
      stdio: "inherit",
    },
  );
}
