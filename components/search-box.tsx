"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SearchBoxProps = {
  initialQuery?: string;
  size?: "small" | "large";
  autoFocus?: boolean;
  id?: string;
};

export function SearchBox({
  initialQuery = "",
  size = "small",
  autoFocus = false,
  id,
}: SearchBoxProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => setValue(initialQuery), [initialQuery]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus={autoFocus}
        placeholder={size === "large" ? "Search all notes" : "Search  ⌘K"}
        aria-label="Search notes"
        className={[
          "w-full rounded-md border border-stone-200 bg-stone-50 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:outline-none",
          size === "large" ? "px-4 py-2.5 text-base" : "px-2.5 py-1.5 text-sm",
        ].join(" ")}
      />
    </form>
  );
}
