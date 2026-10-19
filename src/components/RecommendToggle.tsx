"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPlacesShared } from "@/lib/actions/record";
import { CheckIcon, GlobeIcon, LockIcon } from "./Icons";
import { Spinner, cx } from "./ui";
import { errorText } from "@/lib/errorText";

/**
 * Vouch for places from My spots on their own (no guide needed), so friends see them on the city
 * page — or take them back to private. (Recommend → Vouch, 19 Oct 2026; data still says "shared".)
 * - "card": the place page (one place), with a line saying what it means.
 * - "pill": a small switch on a My spots row.
 * - "all": "Vouch for all" for a city group.
 */
export function RecommendToggle({
  placeIds,
  shared: initial,
  city,
  variant = "card",
}: {
  placeIds: string[];
  shared: boolean;
  city?: string | null;
  variant?: "card" | "pill" | "all";
}) {
  const router = useRouter();
  const [shared, setShared] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const where = city?.trim() ? `the ${city.trim()} page` : "its city page";

  const flip = (next: boolean) => {
    setError(null);
    setShared(next);
    start(async () => {
      try {
        await setPlacesShared(placeIds, next);
        router.refresh();
      } catch (e) {
        setShared(!next);
        setError(errorText(e, "Couldn't change that."));
      }
    });
  };

  if (variant === "all") {
    return (
      <button type="button" disabled={pending} onClick={() => flip(true)} className="text-[12.5px] font-semibold text-terracotta-deep disabled:opacity-60">
        {pending ? "Vouching…" : `Vouch for all ${placeIds.length}`}
      </button>
    );
  }

  if (variant === "pill") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => flip(!shared)}
        aria-pressed={shared}
        aria-label={shared ? "You vouch for it. Tap to keep it just for you" : "Only you see it. Tap to vouch for it"}
        className={cx(
          "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold border",
          shared ? "bg-sage-tint border-sage-soft text-ink" : "bg-paper border-line text-ink-muted",
        )}
      >
        {shared ? <CheckIcon size={12} /> : <LockIcon size={12} />}
        {shared ? "Vouched" : "Vouch"}
      </button>
    );
  }

  return (
    <div className={cx("rounded-2xl p-3 flex items-center gap-3", shared ? "bg-sage-tint" : "bg-cream-deep/60")}>
      <span className="shrink-0 text-ink-muted">{shared ? <GlobeIcon size={18} /> : <LockIcon size={18} />}</span>
      <span className="flex-1 min-w-0 text-[12.5px] leading-snug">
        {shared ? <>You vouch for it · friends see it on {where}</> : <>In My spots · only you can see it</>}
        {error && <span className="block text-danger">{error}</span>}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => flip(!shared)}
        className={cx(
          "shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-60",
          shared ? "border border-line bg-paper text-ink" : "bg-terracotta text-white",
        )}
      >
        {pending ? <Spinner /> : shared ? "Make private" : "Vouch for it"}
      </button>
    </div>
  );
}
