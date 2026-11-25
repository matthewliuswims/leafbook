import { spawn } from "node:child_process";
import { once } from "node:events";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config.mjs";
import { launchTarget } from "@/lib/launch-agent.mjs";

export async function POST() {
  if (process.platform !== "darwin" || process.env.LEAFBOOK_DAEMON !== "1") {
    return NextResponse.json(
      { ok: false, error: "Refresh is available on the always-on daemon." },
      { status: 409 },
    );
  }

  try {
    // Give the response time to flush before launchd restarts this process.
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        'sleep 1 && exec /bin/launchctl kickstart -k "$1"',
        "leafbook-refresh",
        launchTarget(getConfig().daemonLabel),
      ],
      { detached: true, stdio: "ignore" },
    );
    await once(child, "spawn");
    child.unref();
    return NextResponse.json({ ok: true, restartingInMs: 1000 });
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { ok: false, error: "Could not schedule a restart." },
      { status: 500 },
    );
  }
}
