"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleReaction } from "@/lib/actions/saved";
import { CheckIcon, HeartIcon } from "./Icons";
import { cx } from "./ui";

/** "Been here" / "Loved it" chips with counts, on a place page. */
export function ReactionButtons({
  placeId,
  initial,
  counts,
  signedIn,
}: {
  placeId: string;
  initial: { been: boolean; loved: boolean };
  counts: { been: number; loved: number };
  signedIn: boolean;
}) {
  const [mine, setMine] = useState(initial);
  const [n, setN] = useState(counts);
  const [, start] = useTransition();
  const path = usePathname();

  const chip = (kind: "been" | "loved", label: string, icon: React.ReactNode) => {
    const on = mine[kind];
    const cls = cx(
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
      on ? "border-sage bg-sage-tint text-sage" : "border-line bg-paper text-ink",
    );
    const body = (
      <>
        {icon}
        {label}
        {n[kind] > 0 && <span className="tabular-nums text-ink-muted font-normal">{n[kind]}</span>}
      </>
    );
    if (!signedIn) return <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} className={cls}>{body}</Link>;
    return (
      <button
        type="button"
        aria-pressed={on}
        className={cls}
        onClick={() => {
          setMine((m) => ({ ...m, [kind]: !on }));
          setN((c) => ({ ...c, [kind]: Math.max(0, c[kind] + (on ? -1 : 1)) }));
          start(async () => {
            try {
              await toggleReaction(placeId, kind);
            } catch {
              setMine((m) => ({ ...m, [kind]: on }));
            }
          });
        }}
      >
        {body}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {chip("been", "Been here", <CheckIcon size={14} />)}
      {chip("loved", "Loved it", <HeartIcon size={14} filled={mine.loved} />)}
    </div>
  );
}
