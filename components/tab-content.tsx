"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "./markdown";

type TabContentProps = {
  slug: string;
  title: string;
  todo: boolean;
  initialBody: string;
  /**
   * Affects labeling and tells the save API to write to the archive.
   */
  isArchive?: boolean;
  /**
   * From `copyButtons: true` frontmatter: render a Copy button under each
   * blockquote for copying templates.
   */
  copyButtons?: boolean;
};

type Mode = "view" | "edit";

export function TabContent({
  slug,
  title,
  todo,
  initialBody,
  isArchive = false,
  copyButtons = false,
}: TabContentProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [body, setBody] = useState(initialBody);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Refs used to preserve scroll position across the view↔edit mode swap.
  // The DOM is replaced wholesale on mode change, so the browser loses scroll
  // position by default — we restore it manually below.
  const savedScrollY = useRef(0);
  const savedHeadingId = useRef<string | null>(null);
  const previewPaneRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  // If the server re-renders this component with a new initialBody (e.g. after
  // router.refresh() following a save), reset local state to match on-disk.
  useEffect(() => {
    setBody(initialBody);
    setSavedBody(initialBody);
  }, [initialBody, slug]);

  const dirty = body !== savedBody;

  const handleEditClick = useCallback(() => {
    // Capture both the raw scroll offset (for restoring on Cancel) and the
    // topmost visible heading id (for landing the editor preview pane in the
    // same place the user was reading).
    savedScrollY.current = window.scrollY;

    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(
        "article h1[id], article h2[id], article h3[id], article h4[id], article h5[id], article h6[id]",
      ),
    );
    let topVisible: HTMLElement | null = null;
    for (const h of headings) {
      const rect = h.getBoundingClientRect();
      // 80px gives a little headroom under the floating Edit button.
      if (rect.top <= 80) {
        topVisible = h;
      } else {
        break;
      }
    }
    savedHeadingId.current = topVisible?.id ?? null;

    setMode("edit");
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          body,
          base: savedBody,
          archive: isArchive,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        throw new Error(data.error || "Save failed");
      }
      setSavedBody(body);
      setLastSavedAt(new Date());
      // Re-fetch the server component so the sidebar TOC and other derived
      // values pick up the new content on the next render.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [slug, body, savedBody, isArchive, router]);

  const handleCancel = useCallback(() => {
    setBody(savedBody);
    setMode("view");
    setError(null);
    // After view mode re-mounts, restore the original window scroll so the
    // user lands back where they clicked Edit.
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedScrollY.current, left: 0 });
    });
  }, [savedBody]);

  // When mode flips to "edit", line up the preview pane (and the textarea
  // source) with the heading the user was reading in view mode.
  useEffect(() => {
    if (mode !== "edit") return;
    const targetId = savedHeadingId.current;
    if (!targetId) return;

    const previewPane = previewPaneRef.current;
    if (!previewPane) return;

    const escapedId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(targetId)
        : targetId.replace(/(["\\])/g, "\\$1");

    const target = previewPane.querySelector<HTMLElement>(
      `[id="${escapedId}"]`,
    );
    if (target) {
      const targetTop =
        target.getBoundingClientRect().top -
        previewPane.getBoundingClientRect().top +
        previewPane.scrollTop;
      previewPane.scrollTop = Math.max(0, targetTop - 16);
    }

    // Best-effort: scroll the textarea source to the same heading line. We
    // match by raw heading text (the text content of the rendered heading)
    // against `^#+ <text>$` lines in the markdown source.
    const ta = textareaRef.current;
    const headingText = target?.textContent?.trim();
    if (ta && headingText) {
      const lines = bodyRef.current.split("\n");
      let lineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
        if (m && m[1].trim() === headingText) {
          lineIdx = i;
          break;
        }
      }
      if (lineIdx >= 0) {
        const computedLineHeight = parseFloat(getComputedStyle(ta).lineHeight);
        const lineHeight = Number.isFinite(computedLineHeight)
          ? computedLineHeight
          : 16;
        ta.scrollTop = Math.max(0, (lineIdx - 1) * lineHeight);
      }
    }
  }, [mode]);

  // Cmd/Ctrl-S to save while editing.
  useEffect(() => {
    if (mode !== "edit") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, dirty, saving, handleSave]);

  // Warn the user about leaving the page with unsaved changes.
  useEffect(() => {
    if (mode !== "edit" || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [mode, dirty]);

  if (mode === "view") {
    return (
      <>
        {/* Floating Edit button — fixed to the viewport top-right so it stays
            visible while the article scrolls. Available on every tab,
            including archived files. */}
        <button
          onClick={handleEditClick}
          className="fixed right-6 top-4 z-20 rounded-md border border-stone-200 bg-white/95 px-3 py-1 text-xs font-medium text-stone-700 shadow-sm backdrop-blur transition-colors hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
          aria-label={`Edit ${title}`}
        >
          Edit
        </button>
        <article className="mx-auto max-w-3xl px-10 py-14">
          <header className="mb-8">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              {isArchive ? "Archive" : "Tab"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
              {title}
            </h1>
            {todo && !isArchive && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                This tab is a placeholder.
              </div>
            )}
            {isArchive && (
              <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-500">
                Edits save to this archived file.
              </div>
            )}
          </header>
          <div className="prose prose-stone max-w-none">
            <Markdown copyBlockquotes={copyButtons}>{body}</Markdown>
          </div>
        </article>
      </>
    );
  }

  // Edit mode: fixed-height split pane (textarea left, live preview right).
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            {isArchive ? "Editing archive" : "Editing"}
          </div>
          <div className="truncate text-sm font-semibold text-stone-900">
            {title}
          </div>
          {dirty && (
            <div className="text-xs font-medium text-amber-600">
              unsaved changes
            </div>
          )}
          {!dirty && lastSavedAt && (
            <div className="text-xs text-stone-400">
              saved at{" "}
              {lastSavedAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          )}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="rounded-md border border-stone-200 px-3 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          readOnly={saving}
          className="h-full w-full resize-none border-r border-stone-200 bg-stone-50 p-6 font-mono text-xs leading-relaxed text-stone-800 focus:outline-none"
          spellCheck={false}
          aria-label={`Markdown source for ${title}`}
        />
        <div ref={previewPaneRef} className="h-full overflow-y-auto px-10 py-8">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight text-stone-900">
            {title}
          </h1>
          <div className="prose prose-stone max-w-none">
            <Markdown copyBlockquotes={copyButtons}>{body}</Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}
