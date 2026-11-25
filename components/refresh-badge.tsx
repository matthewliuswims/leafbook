"use client";

import { useCallback, useState } from "react";
import type { RefreshState } from "@/lib/refresh-state";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phase = "idle" | "refreshing" | "error";

/**
 * Small "last refreshed" footer for the sidebar. Shows when the always-on
 * daemon last pulled `main` and restarted, plus (on the daemon only) a Refresh
 * button that pulls the latest main and restarts in place. On a hand-started
 * `npm run dev` the button is hidden — there's nothing to kickstart — and it
 * just reports the checked-out commit.
 */
export function RefreshBadge({ state }: { state: RefreshState }) {
  const [phase, setPhase] = useState<Phase>("idle");

  const refresh = useCallback(async () => {
    setPhase("refreshing");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok) {
        // 409 = not the daemon; any other non-2xx = server-side failure.
        setPhase("error");
        return;
      }
    } catch {
      // The server may already be tearing down for the restart — that's fine,
      // fall through to polling for it to come back.
    }

    // Wait for SIGTERM to land, then poll until the relaunched server answers.
    await sleep(2500);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch("/", { cache: "no-store" });
        if (r.ok) {
          window.location.reload();
          return;
        }
      } catch {
        // still restarting
      }
      await sleep(1500);
    }
    // Gave up waiting; KeepAlive will have it back shortly — reload anyway.
    window.location.reload();
  }, []);

  const when = state.startedAtLabel;
  const tooltip = [
    state.committedAt
      ? `commit ${state.sha ?? "?"} · ${state.committedAt}`
      : null,
    state.subject,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="border-t border-stone-200 px-5 py-3 text-[11px] text-stone-400">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate" title={tooltip || undefined}>
          {when ? (
            <>
              Refreshed{" "}
              <span className="font-medium text-stone-600">{when}</span>
            </>
          ) : (
            "Content read live from disk"
          )}
        </span>
        {state.daemon && (
          <button
            onClick={refresh}
            disabled={phase === "refreshing"}
            className="shrink-0 rounded px-1.5 py-0.5 font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-wait disabled:opacity-60"
            title="Update from main and restart the notes server"
          >
            {phase === "refreshing" ? "Refreshing…" : "↻ Refresh"}
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-stone-400">
        {state.sha && <span className="font-mono">{state.sha}</span>}
        {state.dirty && (
          <span
            className="text-amber-600"
            title="Uncommitted local edits are being served"
          >
            · uncommitted edits
          </span>
        )}
        {phase === "error" && (
          <span className="text-red-500">· refresh unavailable</span>
        )}
      </div>
    </div>
  );
}
