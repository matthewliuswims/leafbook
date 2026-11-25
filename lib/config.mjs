import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export function isInside(directory, file) {
  const relative = path.relative(directory, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function notesDirectory(root, value, field) {
  if (typeof value !== "string" || path.isAbsolute(value)) {
    throw new Error(`${field} must be a path relative to the notes root`);
  }
  const directory = path.resolve(root, value);
  if (!isInside(root, directory)) {
    throw new Error(`${field} must be inside the notes root`);
  }
  return directory;
}

export function readPort(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${field} must be an integer from 1 to 65535`);
  }
  return value;
}

function readText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a nonempty string`);
  }
  return value;
}

export function loadConfig(notesRoot) {
  const root = realpathSync(path.resolve(notesRoot));
  if (!statSync(root).isDirectory())
    throw new Error("Notes root must be a directory");
  const override = process.env.LEAFBOOK_CONFIG;
  const configFile = path.resolve(root, override || "leafbook.config.json");
  let data = {};
  try {
    data = JSON.parse(readFileSync(configFile, "utf8"));
  } catch (error) {
    if (override || error.code !== "ENOENT") {
      throw new Error(`Could not read ${configFile}: ${error.message}`);
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Leafbook config must be a JSON object");
  }

  const title = readText(data.title ?? "Leafbook", "title");
  const sidebarLabel = readText(data.sidebarLabel ?? "Notes", "sidebarLabel");
  const contentDir = notesDirectory(
    root,
    data.contentDir ?? "content",
    "contentDir",
  );
  const publicDir = notesDirectory(
    root,
    data.publicDir ?? "public",
    "publicDir",
  );
  const devPort = readPort(data.devPort ?? 3000, "devPort");
  const daemonPort = readPort(data.daemonPort ?? 42600, "daemonPort");
  const rootHash = hash(root).slice(0, 12);
  const daemonLabel =
    process.env.LEAFBOOK_DAEMON_LABEL ??
    data.daemonLabel ??
    `com.leafbook.notes.${rootHash}`;
  if (
    typeof daemonLabel !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(daemonLabel)
  ) {
    throw new Error(
      "daemonLabel must contain only letters, digits, dots and hyphens",
    );
  }
  const range = data.worktreePortRange ?? [42601, 42699];
  if (!Array.isArray(range) || range.length !== 2 || range[0] > range[1]) {
    throw new Error("worktreePortRange must be [firstPort, lastPort]");
  }
  const worktreePortRange = range.map((port) =>
    readPort(port, "worktreePortRange"),
  );

  return {
    root,
    configFile,
    title,
    sidebarLabel,
    contentDir,
    publicDir,
    devPort,
    daemonPort,
    daemonLabel,
    worktreePortRange,
    check: data.check,
  };
}

export function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

let config;

export function getConfig() {
  if (!process.env.LEAFBOOK_ROOT)
    throw new Error("Start the app with the Leafbook CLI");
  return (config ??= loadConfig(process.env.LEAFBOOK_ROOT));
}
