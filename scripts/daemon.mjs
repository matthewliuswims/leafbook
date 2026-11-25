import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { launchTarget } from "../lib/launch-agent.mjs";
import { checkoutKind } from "./git.mjs";
import { portIsFree, readHealth, url } from "./health.mjs";
import { cli, outputDirectory, packageDir } from "./runtime.mjs";

function launch(...args) {
  execFileSync("/bin/launchctl", args, { stdio: "inherit" });
}

function plistValue(plist, key) {
  return execFileSync(
    "/usr/bin/plutil",
    ["-extract", key, "raw", "-o", "-", plist],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  ).trimEnd();
}

function writePlist(config, port, plist, log) {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LEAFBOOK_ROOT: config.root,
    LEAFBOOK_OUTPUT_DIR: outputDirectory(config),
    LEAFBOOK_DAEMON_LABEL: config.daemonLabel,
    LEAFBOOK_PORT: String(port),
    LEAFBOOK_DAEMON_LOG: log,
  };
  if (process.env.LEAFBOOK_CONFIG) env.LEAFBOOK_CONFIG = config.configFile;
  const settings = {
    Label: config.daemonLabel,
    ProgramArguments: [
      "/bin/bash",
      path.join(packageDir, "scripts/serve-daemon.sh"),
      process.execPath,
      cli,
    ],
    WorkingDirectory: config.root,
    EnvironmentVariables: env,
    RunAtLoad: true,
    KeepAlive: true,
    ThrottleInterval: 15,
    StandardOutPath: log,
    StandardErrorPath: log,
  };
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.mkdirSync(path.dirname(plist), { recursive: true });
  const temporary = `${plist}.${randomUUID()}`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(settings), {
      flag: "wx",
      mode: 0o600,
    });
    execFileSync("/usr/bin/plutil", ["-convert", "xml1", temporary]);
    fs.renameSync(temporary, plist);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export async function daemon(command, config, port) {
  if (process.platform !== "darwin")
    throw new Error("The always-on daemon requires macOS.");
  if (checkoutKind(config.root) === "worktree") {
    throw new Error("Manage the daemon from the primary notes checkout.");
  }
  const { daemonLabel: label } = config;
  const plist = path.join(
    os.homedir(),
    "Library/LaunchAgents",
    `${label}.plist`,
  );
  const log = path.join(os.homedir(), "Library/Logs", `${label}.log`);
  const target = launchTarget(label);
  const installed = fs.existsSync(plist);
  if (
    installed &&
    plistValue(plist, "EnvironmentVariables.LEAFBOOK_ROOT") !== config.root
  ) {
    throw new Error(
      `LaunchAgent label ${label} belongs to another notes folder.`,
    );
  }
  const service = spawnSync("/bin/launchctl", ["print", target], {
    encoding: "utf8",
  });
  const loaded = service.status === 0;
  if (
    loaded &&
    (!installed ||
      !service.stdout
        .split("\n")
        .some((line) => line.trim() === `path = ${plist}`))
  ) {
    throw new Error(`LaunchAgent label ${label} is already in use.`);
  }

  if (command === "stop" || command === "refresh") {
    if (!installed) throw new Error("Run leafbook daemon install first.");
    if (command === "stop") {
      if (loaded) launch("bootout", target);
    } else if (loaded) {
      launch("kickstart", "-k", target);
    } else {
      launch("bootstrap", `gui/${process.getuid()}`, plist);
    }
    return;
  }

  const samePort =
    loaded &&
    Number(plistValue(plist, "EnvironmentVariables.LEAFBOOK_PORT")) === port;
  if (!samePort && !(await portIsFree(port)))
    throw new Error(`Daemon port ${port} is in use.`);
  writePlist(config, port, plist, log);
  if (loaded) launch("bootout", target);
  launch("bootstrap", `gui/${process.getuid()}`, plist);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if ((await readHealth(config, port))?.daemon) {
      console.log(`Always-on notes site at ${url(port)}\nLog: ${log}`);
      return;
    }
    await sleep(500);
  }
  throw new Error(`The daemon is installed but did not respond. See ${log}`);
}
