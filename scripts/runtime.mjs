import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isInside } from "../lib/config.mjs";

export const packageDir = fileURLToPath(new URL("..", import.meta.url));
export const cli = path.join(packageDir, "bin/leafbook.mjs");
const require = createRequire(import.meta.url);
const { dependencies } = require("../package.json");
const runtimeFiles = [
  "app",
  "components",
  "lib",
  "next.config.mjs",
  "postcss.config.mjs",
  "tsconfig.json",
];

export function outputDirectory({ root }) {
  return path.resolve(root, process.env.LEAFBOOK_OUTPUT_DIR || ".leafbook");
}

function stageRuntime(output, prefix) {
  fs.mkdirSync(output, { recursive: true });
  const directory = fs.mkdtempSync(path.join(output, prefix));
  try {
    for (const entry of runtimeFiles) {
      fs.cpSync(path.join(packageDir, entry), path.join(directory, entry), {
        recursive: true,
      });
    }
    fs.writeFileSync(
      path.join(directory, "package.json"),
      '{"private":true}\n',
    );
    const modules = path.join(directory, "node_modules");
    // npm may hoist dependencies or keep them beside Leafbook. Resolve each
    // from the installed package so the staged app uses the same versions.
    for (const dependency of Object.keys(dependencies)) {
      const parent = require.resolve
        .paths(dependency)
        .find((candidate) =>
          fs.existsSync(path.join(candidate, dependency, "package.json")),
        );
      if (!parent)
        throw new Error(`Missing ${dependency}. Run npm install first.`);
      const link = path.join(modules, dependency);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(path.join(parent, dependency), link, "junction");
    }
    return directory;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function createDevRuntime(config) {
  const directory = stageRuntime(outputDirectory(config), "dev-");
  process.once("exit", () =>
    fs.rmSync(directory, { recursive: true, force: true }),
  );
  return directory;
}

export function build(config) {
  const output = outputDirectory(config);
  const directory = stageRuntime(output, "build-");
  try {
    execFileSync(
      process.execPath,
      [require.resolve("next/dist/bin/next"), "build"],
      {
        cwd: directory,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "inherit",
      },
    );
    // Publish only a successful build. A running server keeps its snapshot.
    const pointer = path.join(directory, ".publish");
    fs.symlinkSync(path.basename(directory), pointer);
    fs.renameSync(pointer, path.join(output, "production"));
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function productionRuntime(config) {
  const output = outputDirectory(config);
  try {
    const directory = fs.realpathSync(path.join(output, "production"));
    if (
      isInside(fs.realpathSync(output), directory) &&
      fs.existsSync(path.join(directory, ".next/BUILD_ID"))
    ) {
      return directory;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  throw new Error("Run leafbook build first.");
}
