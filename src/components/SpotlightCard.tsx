"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFollow } from "@/lib/actions/social";
import { dismissSuggestion } from "@/lib/actions/suggest";
import type { PersonSuggestion } from "@/lib/suggest";
import { PlaceTile } from "./PlaceTile";
import { XIcon } from "./Icons";
import { Avatar, cx } from "./ui";

/**
 * The black card at the top of the Home feed (15 Oct 2026): one person you don't follow who has
 * been adding a lot lately, chosen for you (src/lib/suggest.ts). Follow in one tap; ✕ hides them for good.
 */
export function SpotlightCard({ s, reason }: { s: PersonSuggestion; reason: string }) {
  const [state, setState] = useState<"none" | "following" | "requested" | "hidden">("none");
  const [, start] = useTransition();
  if (state === "hidden") return null;
  const first = s.user.displayName.split(" ")[0];
  const where = s.recentCity ? ` in ${s.recentCity}` : "";
  const extra = Math.max(0, s.recent - s.recentPlaces.length);

  const follow = () =>
    start(async () => {
      const prev = state;
      setState("following");
      try {
        const r = await toggleFollow(s.user.id);
        setState(r.status === "pending" ? "requested" : r.status === "accepted" ? "following" : "none");
      } catch {
        setState(prev);
      }
    });

  return (
    <div className="mx-4 mt-8 rounded-[22px] bg-ink text-cream p-4 relative">
      <button
        type="button"
        aria-label={`Don't suggest ${first}`}
        onClick={() => {
          setState("hidden");
          dismissSuggestion(s.user.id).catch(() => {});
        }}
        className="absolute right-2.5 top-2.5 w-8 h-8 rounded-full flex items-center justify-center text-cream/60 hover:text-cream"
      >
        <XIcon size={16} />
      </button>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cream-deep/80">Someone to follow</p>
      <div className="mt-2.5 flex items-center gap-3 pr-6">
        <Link href={`/u/${s.user.username}`} className="shrink-0">
          <Avatar user={s.user} size={44} className="ring-2 ring-cream/20" />
        </Link>
        <Link href={`/u/${s.user.username}`} className="flex-1 min-w-0">
          <span className="block font-display text-[22px] leading-tight truncate">{s.user.displayName}</span>
          <span className="block text-[13px] text-cream-deep leading-snug">
            Added {s.recent} spot{s.recent === 1 ? "" : "s"}
            {where} lately
          </span>
        </Link>
      </div>
      {s.recentPlaces.length > 0 && (
        <Link href={`/u/${s.user.username}`} className="mt-3 flex gap-2">
          {s.recentPlaces.slice(0, 3).map((r) => (
            <span key={r.place.id} className="flex-1 min-w-0 flex flex-col gap-1">
              <PlaceTile place={r.place} size={92} className="w-full! h-[78px]! rounded-xl" />
              <span className="text-[11.5px] leading-tight text-cream/85 truncate">{r.place.name}</span>
            </span>
          ))}
          {extra > 0 && (
            <span className="shrink-0 w-12 h-[78px] rounded-xl bg-cream/10 text-cream text-[13px] font-semibold flex items-center justify-center">+{extra}</span>
          )}
        </Link>
      )}
      <div className="mt-3.5 flex items-center gap-3">
        <span className="flex-1 min-w-0 text-[12.5px] text-cream-deep leading-snug">{reason}</span>
        <button
          type="button"
          onClick={follow}
          disabled={state !== "none"}
          className={cx(
            "shrink-0 h-9 px-4 rounded-full text-[13.5px] font-semibold",
            state === "none" ? "bg-cream text-ink" : "bg-cream/15 text-cream",
          )}
        >
          {state === "following" ? "Following" : state === "requested" ? "Requested" : `Follow ${first}`}
        </button>
      </div>
    </div>
  );
}
