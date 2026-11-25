import Link from "next/link";
import { foldQuotes, searchNotes, totalHitCount } from "@/lib/search";
import { SearchBox } from "@/components/search-box";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const { results, terms } = searchNotes(query);
  const hitCount = totalHitCount(results);

  return (
    <article className="mx-auto max-w-3xl px-10 py-14">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        Search
      </div>
      <SearchBox initialQuery={query} size="large" autoFocus={!query} />

      {query && (
        <p className="mt-4 text-sm text-stone-500">
          {results.length === 0
            ? `No matches for "${query}".`
            : `${hitCount} match${hitCount === 1 ? "" : "es"} in ${results.length} tab${results.length === 1 ? "" : "s"}.`}
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-8">
        {results.map((r) => (
          <li key={`${r.isArchive ? "a" : "m"}-${r.slug}`}>
            <div className="flex items-baseline gap-2">
              <Link
                href={r.href}
                className="text-lg font-semibold text-stone-900 hover:underline"
              >
                <Highlight text={r.title} terms={terms} />
              </Link>
              {r.isArchive && (
                <span className="rounded-sm bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                  archive
                </span>
              )}
            </div>
            {r.hits.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5 border-l border-stone-200 pl-4">
                {r.hits.map((hit, i) => (
                  <li key={i}>
                    <Link
                      href={
                        hit.headingSlug
                          ? `${r.href}#${hit.headingSlug}`
                          : r.href
                      }
                      className="block rounded px-2 py-1 text-sm text-stone-700 hover:bg-stone-100"
                    >
                      {hit.heading && hit.heading !== hit.text && (
                        <span className="mr-1.5 text-xs text-stone-400">
                          {hit.heading} ·
                        </span>
                      )}
                      <Highlight
                        text={snippet(hit.text, terms)}
                        terms={terms}
                      />
                    </Link>
                  </li>
                ))}
                {r.matchCount > r.hits.length && (
                  <li className="px-2 text-xs text-stone-400">
                    <Link href={r.href} className="hover:underline">
                      {r.matchCount - r.hits.length} more in this tab
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Trim long lines to a window around the first match. */
function snippet(text: string, terms: string[], max = 240): string {
  if (text.length <= max) return text;
  const lower = foldQuotes(text);
  const found = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const first = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, first - 80);
  const end = Math.min(text.length, start + max);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((t) =>
      t
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/'/g, "['\u2018\u2019]")
        .replace(/"/g, '["\u201c\u201d]'),
    );
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-sm bg-amber-200 px-0.5 text-stone-900"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
