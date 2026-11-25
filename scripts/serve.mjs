import { once } from "node:events";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import send from "send";
import { isInside } from "../lib/config.mjs";
import { host, healthPath, identity } from "./health.mjs";

function reply(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function requestPath(url) {
  const pathname = url?.split("?", 1)[0];
  if (!pathname?.startsWith("/") || pathname.startsWith("//")) return null;
  try {
    const segments = pathname.slice(1).split("/").map(decodeURIComponent);
    if (
      segments.some(
        (part) => part === "." || part === ".." || /[/\\\0]/.test(part),
      )
    )
      return null;
    return segments;
  } catch {
    return null;
  }
}

async function findAsset(config, segments) {
  if (segments.some((part) => !part || part.startsWith("."))) return null;
  try {
    const publicDir = await realpath(config.publicDir);
    if (!isInside(config.root, publicDir)) return null;
    const file = await realpath(path.join(publicDir, ...segments));
    return isInside(publicDir, file) && (await stat(file)).isFile()
      ? { publicDir, file }
      : null;
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) return null;
    throw error;
  }
}

function serveAsset(request, response, { publicDir, file }) {
  const fileUrl =
    "/" +
    path
      .relative(publicDir, file)
      .split(path.sep)
      .map(encodeURIComponent)
      .join("/");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (/\.(?:html?|svg|xhtml|xml)$/i.test(file)) {
    response.setHeader("Content-Security-Policy", "sandbox");
  }
  send(request, fileUrl, { root: publicDir, index: false })
    .on("error", (error) => {
      if (response.headersSent) response.destroy();
      else reply(response, error.statusCode ?? 500, "Could not serve asset");
    })
    .pipe(response);
}

export async function serve(config, directory, port, dev) {
  process.env.NODE_ENV = dev ? "development" : "production";
  const { default: next } = await import("next");
  const server = createServer();
  const app = next({
    dev,
    dir: directory,
    hostname: host,
    port,
    httpServer: server,
  });
  await app.prepare();
  const nextRequest = app.getRequestHandler();
  const allowedHosts = new Set([`${host}:${port}`, `localhost:${port}`]);
  if (port === 80) {
    allowedHosts.add(host);
    allowedHosts.add("localhost");
  }
  const allowHost = (request) =>
    allowedHosts.has(request.headers.host?.toLowerCase());

  server.on("request", async (request, response) => {
    try {
      if (!allowHost(request))
        return reply(response, 403, "Use a loopback address");
      const read = request.method === "GET" || request.method === "HEAD";
      if (
        !read &&
        request.headers.origin &&
        request.headers.origin !== `http://${request.headers.host}`
      ) {
        return reply(response, 403, "Use the notes site's own origin");
      }
      const segments = requestPath(request.url);
      if (!segments) return reply(response, 400, "Invalid path");

      if (read && segments.join("/") === healthPath.slice(1)) {
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        return response.end(
          JSON.stringify({
            leafbook: identity(config),
            daemon: process.env.LEAFBOOK_DAEMON === "1",
            pid: process.pid,
          }),
        );
      }
      if (read && !["_next", "api", "_leafbook"].includes(segments[0])) {
        const asset = await findAsset(config, segments);
        if (asset) return serveAsset(request, response, asset);
      }
      // Use the original URL segment for note lookup. Next can leave encoded
      // parameters in App Router pages; decoding those again can confuse a
      // literal filename containing "%20" with one containing a space.
      delete request.headers["x-leafbook-slug"];
      if (
        segments.length === 1 ||
        (segments[0] === "archive" && segments.length === 2)
      ) {
        request.headers["x-leafbook-slug"] = encodeURIComponent(
          segments.at(-1),
        );
      }
      await nextRequest(request, response);
    } catch (error) {
      console.error("Request error:", error);
      if (response.headersSent) response.destroy();
      else reply(response, 500, "Internal server error");
    }
  });

  // Next attaches its development websocket handler after the first page.
  server.on("upgrade", (request, socket) => {
    if (
      !allowHost(request) ||
      request.headers.origin !== `http://${request.headers.host}` ||
      !dev
    )
      socket.destroy();
  });
  try {
    await once(server.listen(port, host), "listening");
  } catch (error) {
    await app.close();
    throw error;
  }
  console.log(`Leafbook is ready at http://${host}:${port}`);

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    server.close();
    server.closeAllConnections();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
