import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { hash } from "../lib/config.mjs";
import { checkoutKind } from "./git.mjs";
import { portIsFree, readHealth, url } from "./health.mjs";
import { cli, outputDirectory } from "./runtime.mjs";

function candidatePorts(config, override, kind) {
  if (override !== undefined || kind !== "worktree")
    return [override ?? config.devPort];
  const [first, last] = config.worktreePortRange;
  const size = last - first + 1;
  const offset = Number.parseInt(hash(config.root).slice(0, 8), 16) % size;
  return Array.from(
    { length: size },
    (_, index) => first + ((offset + index) % size),
  );
}

async function startPreview(config, port) {
  const output = outputDirectory(config);
  mkdirSync(output, { recursive: true });
  const log = path.join(output, `preview-${port}.log`);
  const fd = openSync(log, "a");
  let child;
  try {
    child = spawn(process.execPath, [cli, "dev"], {
      cwd: config.root,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: {
        ...process.env,
        LEAFBOOK_PORT: String(port),
        LEAFBOOK_DAEMON: "0",
      },
    });
  } finally {
    closeSync(fd);
  }
  let spawnError;
  child.on("error", (error) => {
    spawnError = error;
  });
  child.unref();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await readHealth(config, port);
    if (state && !state.daemon) {
      console.log(url(port));
      return;
    }
    if (spawnError || child.exitCode !== null || child.signalCode !== null)
      break;
    await sleep(500);
  }
  if (child.exitCode === null && child.signalCode === null && child.pid)
    child.kill();
  throw new Error(`Preview did not start. See ${log}`);
}

export async function preview(config, override) {
  const kind = checkoutKind(config.root);
  const daemonPort = override ?? config.daemonPort;
  if (kind !== "worktree" && (await readHealth(config, daemonPort))?.daemon) {
    console.log(url(daemonPort));
    return;
  }

  const ports = candidatePorts(config, override, kind);
  // Check for existing previews first, even if a preferred port has freed up.
  for (let index = 0; index < ports.length; index += 16) {
    const batch = ports.slice(index, index + 16);
    const states = await Promise.all(
      batch.map((port) => readHealth(config, port)),
    );
    const existing = states.findIndex((state) => state && !state.daemon);
    if (existing !== -1) {
      console.log(url(batch[existing]));
      return;
    }
  }
  for (const port of ports) {
    if (await portIsFree(port)) return startPreview(config, port);
  }
  throw new Error(
    "No preview port is free. Set LEAFBOOK_PORT or change worktreePortRange.",
  );
}
