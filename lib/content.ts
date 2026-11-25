import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import GithubSlugger from "github-slugger";
import { headers } from "next/headers";
import { getConfig, isInside } from "./config.mjs";

export type TocEntry = {
  depth: number;
  text: string;
  slug: string;
};

export type TabMeta = {
  slug: string;
  title: string;
  order: number;
  /** `parent:` frontmatter — the slug of the tab this one nests under in the sidebar. */
  parent: string | null;
  todo: boolean;
  /** `copyButtons: true` frontmatter — render a Copy button under each blockquote. */
  copyButtons: boolean;
  toc: TocEntry[];
};

export type TabContent = TabMeta & {
  body: string;
};

export function parseNote(raw: string) {
  return matter(raw, {
    engines: {
      javascript() {
        throw new Error("Use YAML or JSON for frontmatter");
      },
    },
  });
}

export function isNoteSlug(slug: string): boolean {
  return (
    Boolean(slug) &&
    !slug.startsWith(".") &&
    !slug.includes("..") &&
    !/[/\\\0]/.test(slug)
  );
}

function realChild(base: string, target: string): string | null {
  try {
    const real = fs.realpathSync(target);
    return isInside(base, real) ? real : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP")
      return null;
    throw error;
  }
}

function noteDirectory(archive: boolean): string | null {
  const { root, contentDir } = getConfig();
  const content = realChild(root, contentDir);
  if (!content || !fs.statSync(content).isDirectory()) return null;
  if (!archive) return content;
  const directory = realChild(content, path.join(content, "archive"));
  return directory && fs.statSync(directory).isDirectory() ? directory : null;
}

function noteFileIn(directory: string, slug: string): string | null {
  for (const extension of [".md", ".mdx"]) {
    const file = realChild(directory, path.join(directory, slug + extension));
    if (file && fs.statSync(file).isFile()) return file;
  }
  return null;
}

export function getNoteFile(slug: string, archive: boolean): string | null {
  if (!isNoteSlug(slug)) return null;
  const directory = noteDirectory(archive);
  return directory ? noteFileIn(directory, slug) : null;
}

function readContentFile(file: string, slug: string): TabContent {
  const parsed = parseNote(fs.readFileSync(file, "utf8"));
  const data = parsed.data as Partial<TabMeta>;
  const body = parsed.content.trim();

  return {
    slug,
    title: typeof data.title === "string" ? data.title : slug,
    order: typeof data.order === "number" ? data.order : 999,
    parent: typeof data.parent === "string" ? data.parent : null,
    todo: Boolean(data.todo),
    copyButtons: Boolean(data.copyButtons),
    toc: extractToc(body),
    body,
  };
}

export function listNotes(archive = false): TabContent[] {
  const directory = noteDirectory(archive);
  if (!directory) return [];
  const slugs = new Set(
    fs
      .readdirSync(directory)
      .filter(
        (file) => /\.mdx?$/.test(file) && !(archive && file === "README.md"),
      )
      .map((file) => file.replace(/\.mdx?$/, "")),
  );
  const tabs: TabContent[] = [];
  for (const slug of slugs) {
    if (!isNoteSlug(slug)) continue;
    const file = noteFileIn(directory, slug);
    if (file) tabs.push(readContentFile(file, slug));
  }
  return tabs.sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  );
}

export function getAllTabs(): TabMeta[] {
  return listNotes().map(({ body: _body, ...meta }) => meta);
}

export function getArchivedTabs(): TabMeta[] {
  return listNotes(true).map(({ body: _body, ...meta }) => meta);
}

export async function getRequestedNote(
  archive = false,
): Promise<TabContent | null> {
  const encoded = (await headers()).get("x-leafbook-slug");
  if (!encoded) return null;
  const slug = decodeURIComponent(encoded);
  const file = getNoteFile(slug, archive);
  return file ? readContentFile(file, slug) : null;
}

/**
 * Walk markdown line-by-line and extract ATX headings (# .. ######), skipping
 * fenced code blocks. Slugs are generated with github-slugger so they match
 * rehype-slug's output byte-for-byte (including duplicate disambiguation), which
 * is what the rendered page uses for heading `id` attributes.
 */
export function extractToc(markdown: string): TocEntry[] {
  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];
  const lines = markdown.split("\n");
  let inFence = false;
  let fenceChar: "`" | "~" | "" = "";

  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const char = fenceMatch[1][0] as "`" | "~";
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const depth = heading[1].length;
    const text = heading[2].trim();
    if (!text) continue;
    entries.push({ depth, text, slug: slugger.slug(text) });
  }

  return entries;
}
