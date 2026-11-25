import { hash } from "../lib/config.mjs";
import { createServer } from "node:net";

export const host = "127.0.0.1";
export const healthPath = "/_leafbook/health";

export function url(port) {
  return `http://${host}:${port}`;
}

export function identity({ root, configFile }) {
  return hash(JSON.stringify([root, configFile]));
}

export function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

export async function readHealth(config, port) {
  try {
    const response = await fetch(url(port) + healthPath, {
      redirect: "error",
      signal: AbortSignal.timeout(600),
    });
    if (
      response.ok &&
      response.headers.get("content-type") === "application/json"
    ) {
      const state = await response.json();
      if (state.leafbook === identity(config)) return state;
    }
  } catch {
    // The port may be free, starting up, or running a different application.
  }
  return null;
}
