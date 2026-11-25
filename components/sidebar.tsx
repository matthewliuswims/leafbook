"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TabMeta, TocEntry } from "@/lib/content";
import type { RefreshState } from "@/lib/refresh-state";
import { RefreshBadge } from "@/components/refresh-badge";
import { SearchBox } from "@/components/search-box";

const MIN_WIDTH = 44; // collapsed rail — just enough for the expand button
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 256;
const COLLAPSE_THRESHOLD = 120; // below this, render rail-only view
const WIDTH_STORAGE_KEY = "sidebar-width";
const ARCHIVE_STORAGE_KEY = "sidebar-archive-open";
const SEARCH_INPUT_ID = "sidebar-search";

type SidebarProps = {
  tabs: TabMeta[];
  archive: TabMeta[];
  refresh: RefreshState;
  title: string;
  label: string;
  contentDirectory: string;
};

type ActiveInfo = {
  slug: string | null;
  isArchive: boolean;
};

export function Sidebar({
  tabs,
  archive,
  refresh,
  title,
  label,
  contentDirectory,
}: SidebarProps) {
  const pathname = usePathname();
  const active = parsePathname(pathname);

  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [lastExpandedWidth, setLastExpandedWidth] =
    useState<number>(DEFAULT_WIDTH);
  const [archiveOpen, setArchiveOpen] = useState<boolean>(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Restore from localStorage on mount. Deliberately avoids SSR to prevent
  // a hydration mismatch — first paint uses defaults, then flicks to saved.
  useEffect(() => {
    try {
      const savedWidth = localStorage.getItem(WIDTH_STORAGE_KEY);
      if (savedWidth) {
        const n = parseInt(savedWidth, 10);
        if (!Number.isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) {
          setWidth(n);
          if (n >= COLLAPSE_THRESHOLD) setLastExpandedWidth(n);
        }
      }
      const savedArchive = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      if (savedArchive === "true") setArchiveOpen(true);
    } catch {
      // localStorage can throw in rare privacy modes; fall through with defaults.
    }
  }, []);

  const persistWidth = useCallback((value: number) => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  const persistArchiveOpen = useCallback((value: boolean) => {
    try {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const handleMove = (ev: MouseEvent) => {
        const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, ev.clientX));
        setWidth(next);
        if (next >= COLLAPSE_THRESHOLD) {
          setLastExpandedWidth(next);
        }
      };

      const handleUp = () => {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        persistWidth(widthRef.current);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [persistWidth],
  );

  const toggleCollapsed = useCallback(() => {
    const next =
      widthRef.current < COLLAPSE_THRESHOLD ? lastExpandedWidth : MIN_WIDTH;
    setWidth(next);
    persistWidth(next);
  }, [lastExpandedWidth, persistWidth]);

  // Cmd/Ctrl+K focuses search. Lives here, not in SearchBox, so it still
  // works (and expands the sidebar) when the sidebar is collapsed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault();
      if (widthRef.current < COLLAPSE_THRESHOLD) {
        setWidth(lastExpandedWidth);
        persistWidth(lastExpandedWidth);
      }
      requestAnimationFrame(() => {
        const input = document.getElementById(SEARCH_INPUT_ID);
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastExpandedWidth, persistWidth]);

  const toggleArchive = useCallback(() => {
    setArchiveOpen((prev) => {
      const next = !prev;
      persistArchiveOpen(next);
      return next;
    });
  }, [persistArchiveOpen]);

  const isCollapsed = width < COLLAPSE_THRESHOLD;
  const slugs = new Set(tabs.map((tab) => tab.slug));

  return (
    <aside
      className="sticky top-0 flex h-screen shrink-0 flex-col border-r border-stone-200 bg-white"
      style={{ width }}
    >
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {isCollapsed ? (
          <div className="flex flex-col items-center pt-4">
            <button
              onClick={toggleCollapsed}
              className="rounded p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-stone-200 px-5 py-5">
              <div className="flex items-start justify-between gap-2">
                <Link href="/" className="block min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    {title}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-stone-900">
                    {label}
                  </div>
                </Link>
                <button
                  onClick={toggleCollapsed}
                  className="mt-0.5 rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10 4L6 8L10 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="px-3 pt-3">
              <SearchBox id={SEARCH_INPUT_ID} />
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Document tabs
              </div>
              <ul className="flex flex-col gap-0.5">
                {tabs
                  .filter((tab) => !tab.parent || !slugs.has(tab.parent))
                  .map((tab) => (
                    <TabItem
                      key={`main-${tab.slug}`}
                      tab={tab}
                      active={active}
                      isArchive={false}
                      subTabs={tabs.filter((sub) => sub.parent === tab.slug)}
                      allTabs={tabs}
                    />
                  ))}
              </ul>

              {archive.length > 0 && (
                <div className="mt-6">
                  <button
                    onClick={toggleArchive}
                    className="flex w-full items-center gap-1.5 px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400 transition-colors hover:text-stone-600"
                    aria-expanded={archiveOpen}
                  >
                    <svg
                      className={`transition-transform ${archiveOpen ? "rotate-90" : ""}`}
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M3 2L7 5L3 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Archive ({archive.length})</span>
                  </button>
                  {archiveOpen && (
                    <ul className="flex flex-col gap-0.5">
                      {archive.map((tab) => (
                        <TabItem
                          key={`archive-${tab.slug}`}
                          tab={tab}
                          active={active}
                          isArchive={true}
                          variant="archive"
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </nav>
            <div className="border-t border-stone-200 px-5 py-3 text-[11px] text-stone-400">
              Click <span className="font-semibold text-stone-600">Edit</span>{" "}
              on any tab to modify inline, or edit files in{" "}
              <code>{contentDirectory}/</code>
            </div>
            <RefreshBadge state={refresh} />
          </>
        )}
      </div>
      {/* Drag handle — absolute-positioned vertical strip on the right edge. */}
      <div
        onMouseDown={handleMouseDown}
        className="group absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize"
        style={{ touchAction: "none" }}
        aria-hidden="true"
      >
        <div className="h-full w-full bg-transparent transition-colors group-hover:bg-stone-300 group-active:bg-stone-400" />
      </div>
    </aside>
  );
}

type TabItemProps = {
  tab: TabMeta;
  active: ActiveInfo;
  isArchive: boolean;
  variant?: "default" | "archive";
  subTabs?: TabMeta[];
  allTabs?: TabMeta[];
};

/**
 * One row in the sidebar tab list. Owns its own `outlineCollapsed` state so
 * clicking the active tab toggles its heading outline without racing with
 * navigation, and so collapse state is scoped per-tab rather than shared.
 */
function TabItem({
  tab,
  active,
  isArchive,
  variant = "default",
  subTabs = [],
  allTabs = [],
}: TabItemProps) {
  // A tab with sub-tabs renders as a group: its own page moves down into the
  // nested list as "Overview", so the parent row is never the active one.
  const isGroup = subTabs.length > 0;
  const isActive =
    !isGroup && active.isArchive === isArchive && active.slug === tab.slug;
  const hasOutline = groupOutline(tab.toc).groups.length > 0;
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);

  const href = isArchive
    ? `/archive/${encodeURIComponent(tab.slug)}`
    : `/${encodeURIComponent(tab.slug)}`;

  const shapeClasses =
    variant === "archive" ? "px-3 py-1 text-xs" : "px-3 py-1.5 text-sm";

  const stateClasses = isActive
    ? "bg-stone-900 text-white"
    : variant === "archive"
      ? "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
      : "text-stone-700 hover:bg-stone-100";

  return (
    <li>
      <Link
        href={href}
        onClick={(e) => {
          if (isActive && hasOutline) {
            e.preventDefault();
            setOutlineCollapsed((prev) => !prev);
          }
        }}
        className={[
          "flex items-center justify-between rounded-md transition-colors",
          shapeClasses,
          stateClasses,
        ].join(" ")}
      >
        <span className="truncate">{tab.title}</span>
        {tab.todo && variant !== "archive" && (
          <span
            className={[
              "ml-2 rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              isActive
                ? "bg-amber-300/90 text-amber-950"
                : "bg-amber-100 text-amber-800",
            ].join(" ")}
          >
            todo
          </span>
        )}
      </Link>
      {isActive && hasOutline && !outlineCollapsed && (
        <TabOutline toc={tab.toc} />
      )}
      {isGroup && (
        <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-stone-200 pl-1">
          <TabItem
            key={`main-${tab.slug}-overview`}
            tab={{ ...tab, title: "Overview" }}
            active={active}
            isArchive={false}
          />
          {subTabs.map((sub) => (
            <TabItem
              key={`main-${sub.slug}`}
              tab={sub}
              active={active}
              isArchive={false}
              subTabs={allTabs.filter((child) => child.parent === sub.slug)}
              allTabs={allTabs}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Group the outline under its top-level headings. The page title (the lone
 * h1) repeats the tab name and References is just the bibliography, so
 * neither gets an entry.
 */
function groupOutline(toc: TocEntry[]) {
  let entries = toc.filter((e) => e.text !== "References");
  if (entries.some((e) => e.depth > 1)) {
    entries = entries.filter((e) => e.depth > 1);
  }
  const topDepth = entries.reduce((m, e) => Math.min(m, e.depth), Infinity);
  const groups: { top: TocEntry; children: TocEntry[] }[] = [];
  for (const entry of entries) {
    if (entry.depth === topDepth || groups.length === 0) {
      groups.push({ top: entry, children: [] });
    } else {
      groups[groups.length - 1].children.push(entry);
    }
  }
  return { groups, topDepth };
}

function TabOutline({ toc }: { toc: TocEntry[] }) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const { groups, topDepth } = groupOutline(toc);

  // Scroll spy: on each frame, find the last heading whose top is above 100px
  // from the viewport top — that's the section the reader is currently in.
  useEffect(() => {
    const slugSet = new Set(toc.map((e) => e.slug));
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>("article [id]"),
    ).filter((el) => slugSet.has(el.id));

    if (!headings.length) return;

    let ticking = false;
    const update = () => {
      let current = headings[0]?.id ?? null;
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= 100) {
          current = el.id;
        } else {
          break;
        }
      }
      setActiveSlug(current);
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  // A collapsed section lights up its top-level entry instead.
  const visibleActive = (() => {
    for (const { top, children } of groups) {
      if (top.slug === activeSlug) return top.slug;
      if (children.some((c) => c.slug === activeSlug)) {
        return expanded.has(top.slug) ? activeSlug : top.slug;
      }
    }
    return null;
  })();

  // Keep the active outline entry visible in the sidebar without jarring jumps.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [visibleActive]);

  if (groups.length === 0) return null;

  const toggle = (slug: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const link = (entry: TocEntry, indent: number) => {
    const isActive = entry.slug === visibleActive;
    return (
      <a
        ref={isActive ? activeRef : undefined}
        href={`#${entry.slug}`}
        title={entry.text}
        style={{ paddingLeft: `${0.5 + indent * 0.75}rem` }}
        className={[
          "block min-w-0 flex-1 truncate rounded py-1 pr-2 text-xs transition-colors",
          isActive
            ? "bg-stone-100 font-medium text-stone-900"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
        ].join(" ")}
      >
        {entry.text}
      </a>
    );
  };

  return (
    <ul className="mt-1 mb-1 ml-4 flex flex-col gap-0.5 border-l border-stone-200 pl-1">
      {groups.map(({ top, children }, idx) => {
        const isOpen = expanded.has(top.slug);
        return (
          <li key={`${top.slug}-${idx}`}>
            <div className="flex items-center">
              {link(top, 0)}
              {children.length > 0 && (
                <button
                  onClick={() => toggle(top.slug)}
                  className="shrink-0 rounded p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  aria-label={`${isOpen ? "Hide" : "Show"} ${top.text} sections`}
                  aria-expanded={isOpen}
                  title={`${isOpen ? "Hide" : "Show"} ${children.length} section${children.length === 1 ? "" : "s"}`}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    <path
                      d="M6 4L10 8L6 12"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
            {isOpen && (
              <ul className="flex flex-col gap-0.5">
                {children.map((child, cIdx) => (
                  <li key={`${child.slug}-${cIdx}`}>
                    {link(child, child.depth - topDepth)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Split pathname into main-tab vs. archive-tab, decoding the slug defensively.
 * /FAQ                  -> { slug: "FAQ", isArchive: false }
 * /archive/1-Pager      -> { slug: "1-Pager", isArchive: true }
 * /                     -> { slug: null, isArchive: false }
 */
function parsePathname(pathname: string | null): ActiveInfo {
  if (!pathname || pathname === "/") return { slug: null, isArchive: false };
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "archive" && segments[1]) {
    try {
      return { slug: decodeURIComponent(segments[1]), isArchive: true };
    } catch {
      return { slug: segments[1], isArchive: true };
    }
  }
  try {
    return { slug: decodeURIComponent(segments[0]), isArchive: false };
  } catch {
    return { slug: segments[0], isArchive: false };
  }
}
