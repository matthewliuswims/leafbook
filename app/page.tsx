import { redirect } from "next/navigation";
import { getAllTabs } from "@/lib/content";
import { getConfig } from "@/lib/config.mjs";
import path from "node:path";

export default function HomePage() {
  const tabs = getAllTabs();
  const first = tabs[0];
  if (first) {
    redirect(`/${encodeURIComponent(first.slug)}`);
  }
  const { root, contentDir, title } = getConfig();
  return (
    <article className="mx-auto max-w-3xl px-10 py-14">
      <h1 className="mb-2 text-3xl font-semibold tracking-tight text-stone-900">
        {title}
      </h1>
      <p className="text-stone-600">
        No tabs found. Add a Markdown file to{" "}
        <code className="rounded bg-stone-200 px-1 py-0.5 text-[13px]">
          {path.relative(root, contentDir)}/
        </code>
        .
      </p>
    </article>
  );
}
