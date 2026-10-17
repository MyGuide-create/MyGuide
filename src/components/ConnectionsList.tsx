"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FollowButton } from "./FollowButton";
import { SearchIcon, XIcon } from "./Icons";
import { Avatar } from "./ui";
import type { ConnectionRow } from "@/lib/guides";

/** Lists shorter than this don't get a search box: there's nothing to search through. */
const SEARCH_FROM = 8;

/** Lowercase and strip accents, so "jose" finds "José". */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Followers / following rows with a search box that filters by name or @username as you type. */
export function ConnectionsList({
  rows,
  showFollow,
  next,
  followsYou,
}: {
  rows: ConnectionRow[];
  showFollow: boolean;
  next: string;
  followsYou: boolean;
}) {
  const [q, setQ] = useState("");
  const needle = fold(q.trim().replace(/^@/, ""));
  const shown = useMemo(
    () => (needle ? rows.filter(({ user }) => fold(user.displayName).includes(needle) || fold(user.username).includes(needle)) : rows),
    [rows, needle],
  );

  return (
    <>
      {rows.length >= SEARCH_FROM && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-line bg-paper pl-4 pr-2 py-1.5">
          <SearchIcon size={17} className="text-ink-muted shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or @username"
            aria-label="Search this list"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] py-1.5 placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden"
            enterKeyHint="search"
            type="search"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="p-1.5 text-ink-muted">
              <XIcon size={16} />
            </button>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-ink-muted">No one matches “{q.trim()}”</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map(({ user, viewerStatus }) => (
            <li key={user.id} className="flex items-center gap-3 py-2.5 px-1 border-b border-line/50 last:border-0">
              <Link href={`/u/${user.username}`} className="flex flex-1 min-w-0 items-center gap-3">
                <Avatar user={user} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-medium text-ink">{user.displayName}</span>
                  <span className="block truncate text-[12.5px] text-ink-muted">@{user.username}</span>
                </span>
              </Link>
              {showFollow && viewerStatus !== "self" && <FollowButton userId={user.id} initial={viewerStatus} next={next} followsYou={followsYou} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
