#!/usr/bin/env node
import { getConfig, readPort } from "../lib/config.mjs";
import {
  build,
  createDevRuntime,
  productionRuntime,
} from "../scripts/runtime.mjs";

const usage =
  "Usage: leafbook dev | build | start | preview | daemon install|refresh|stop | worktree [name] | check [folder] [--staged | --rev <commit>]";
const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  process.env.LEAFBOOK_ROOT ||= process.cwd();
  process.env.NEXT_TELEMETRY_DISABLED ??= "1";
  const config = getConfig();
  process.env.LEAFBOOK_ROOT = config.root;
  if (process.env.LEAFBOOK_CONFIG)
    process.env.LEAFBOOK_CONFIG = config.configFile;
  const port =
    process.env.LEAFBOOK_PORT === undefined
      ? undefined
      : readPort(Number(process.env.LEAFBOOK_PORT), "LEAFBOOK_PORT");

  if (command === "build" && args.length === 0) return build(config);
  if ((command === "dev" || command === "start") && args.length === 0) {
    const { serve } = await import("../scripts/serve.mjs");
    const dev = command === "dev";
    const directory = dev
      ? createDevRuntime(config)
      : productionRuntime(config);
    const daemon = process.env.LEAFBOOK_DAEMON === "1";
    return serve(
      config,
      directory,
      port ?? (daemon ? config.daemonPort : config.devPort),
      dev,
    );
  }
  if (command === "preview" && args.length === 0) {
    const { preview } = await import("../scripts/preview.mjs");
    return preview(config, port);
  }
  if (
    command === "daemon" &&
    args.length === 1 &&
    ["install", "refresh", "stop"].includes(args[0])
  ) {
    const { daemon } = await import("../scripts/daemon.mjs");
    return daemon(args[0], config, port ?? config.daemonPort);
  }
  if (command === "check") {
    const { check } = await import("../lib/check.mjs");
    return check(config, args);
  }
  if (command === "worktree" && args.length <= 1) {
    const { worktree } = await import("../scripts/git.mjs");
    return worktree(config, args);
  }
  throw new Error(usage);
}

try {
  await main();
} catch (error) {
  console.error(`Leafbook: ${error.message}`);
  process.exitCode = 1;
}
