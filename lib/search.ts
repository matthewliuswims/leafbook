import GithubSlugger from "github-slugger";
import { listNotes } from "@/lib/content";

export type SearchHit = {
  /** Plain text of the matching line, markdown syntax stripped. */
  text: string;
  /** Nearest heading above the line, for context and the jump link. */
  heading: string | null;
  headingSlug: string | null;
};

export type SearchResult = {
  slug: string;
  title: string;
  isArchive: boolean;
  href: string;
  titleMatch: boolean;
  /** Every matching line, before the per-tab snippet cap. */
  matchCount: number;
  hits: SearchHit[];
  score: number;
};

const MAX_HITS_PER_TAB = 8;

/**
 * Case-insensitive search over every tab and archived tab. A line matches when
 * it contains the whole query as a phrase, or every word of it in any order,
 * so partial words and loose sentences both work. Phrase matches
 * rank above scattered-word matches.
 */
export function searchNotes(query: string): {
  results: SearchResult[];
  terms: string[];
} {
  const phrase = normalize(query);
  const terms = Array.from(new Set(phrase.split(" ").filter(Boolean)));
  if (terms.length === 0) return { results: [], terms };

  const tabs = [
    ...listNotes().map((tab) => ({ tab, isArchive: false })),
    ...listNotes(true).map((tab) => ({ tab, isArchive: true })),
  ];

  const results: SearchResult[] = [];
  for (const { tab, isArchive } of tabs) {
    const titleText = normalize(tab.title);
    const titleMatch = terms.every((t) => titleText.includes(t));
    let phraseHits = 0;
    const hits: SearchHit[] = [];
    let totalHits = 0;

    for (const line of sectionLines(tab.body)) {
      const text = normalize(line.text);
      if (!terms.every((t) => text.includes(t))) continue;
      totalHits++;
      const isPhrase = text.includes(phrase);
      if (isPhrase) phraseHits++;
      const hit = {
        text: line.text,
        heading: line.heading,
        headingSlug: line.headingSlug,
      };
      // Phrase matches go first so the best snippets survive the cap.
      if (isPhrase) hits.unshift(hit);
      else hits.push(hit);
    }

    if (!titleMatch && totalHits === 0) continue;
    const base = isArchive ? "/archive/" : "/";
    results.push({
      slug: tab.slug,
      title: tab.title,
      isArchive,
      href: `${base}${encodeURIComponent(tab.slug)}`,
      titleMatch,
      matchCount: totalHits,
      hits: hits.slice(0, MAX_HITS_PER_TAB),
      score: (titleMatch ? 1000 : 0) + phraseHits * 3 + totalHits,
    });
  }

  // Current tabs before archive; then title matches, phrase matches, volume.
  results.sort(
    (a, b) =>
      Number(a.isArchive) - Number(b.isArchive) ||
      b.score - a.score ||
      a.title.localeCompare(b.title),
  );
  return { results, terms };
}

export function totalHitCount(results: SearchResult[]): number {
  return results.reduce((n, r) => n + r.matchCount, 0);
}

/** Lowercase and fold curly quotes. Keeps length so indexes still line up. */
export function foldQuotes(value: string): string {
  return value.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function normalize(value: string): string {
  return foldQuotes(value).replace(/\s+/g, " ").trim();
}

type Line = {
  text: string;
  heading: string | null;
  headingSlug: string | null;
};

/**
 * Walk the markdown and yield each non-empty line as plain text, tagged with
 * the heading it sits under. Heading slugs use the same fence handling and
 * github-slugger sequence as extractToc, so they match the page's heading ids.
 */
function sectionLines(markdown: string): Line[] {
  const slugger = new GithubSlugger();
  const out: Line[] = [];
  let heading: string | null = null;
  let headingSlug: string | null = null;
  let inFence = false;
  let fenceChar = "";

  for (const raw of markdown.split("\n")) {
    const fence = raw.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const char = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }

    if (!inFence) {
      const h = raw.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (h && h[2].trim()) {
        // rehype-slug slugs the rendered text, so slug the stripped heading.
        heading = stripInline(h[2].trim());
        headingSlug = slugger.slug(heading);
        out.push({ text: heading, heading, headingSlug });
        continue;
      }
    }

    const text = stripMarkdown(raw);
    if (text) out.push({ text, heading, headingSlug });
  }
  return out;
}

/** A body line: drop block markers (quotes, bullets, tables), then inline syntax. */
function stripMarkdown(line: string): string {
  return stripInline(
    line
      .replace(/^\s*(?:>\s*)+/, "")
      .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/, "")
      .replace(/^\s*\|?\s*:?-{3,}.*$/, "")
      .replace(/\s*\|\s*/g, " · ")
      .replace(/^\s*·\s*|\s*·\s*$/g, ""),
  );
}

/** Inline syntax only, so numbered headings keep their number. */
function stripInline(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]:?/g, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/(^|\s)[*_](\S[^*_]*\S|\S)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}
