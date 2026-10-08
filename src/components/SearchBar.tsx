"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "./Icons";

/** Search box: "Athens", "gelato in Bali", "guides by people I follow". */
export function SearchBar({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}
      className="flex items-center gap-2 rounded-2xl border border-line bg-paper pl-4 pr-2 py-2"
    >
      <SearchIcon size={18} className="text-ink-muted shrink-0" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a city, place or person…"
        className="flex-1 min-w-0 bg-transparent outline-none text-[15px] py-1.5 placeholder:text-ink-faint"
        enterKeyHint="search"
        type="search"
        autoFocus={!initial}
      />
    </form>
  );
}
