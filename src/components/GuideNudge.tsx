"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SparkleIcon } from "./Icons";

const HIDE_DAYS = 7;
const keyFor = (city: string) => `mg.guideNudgeHidden.${city.trim().toLowerCase()}`;

function hiddenNow(city: string): boolean {
  try {
    const at = Number(localStorage.getItem(keyFor(city)) || 0);
    return at > 0 && Date.now() - at < HIDE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

// "Not now" in one place hides the card everywhere on the page (done screen and My spots).
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * "You've got 6 Lisbon spots. Make them a guide?" — shown when 4+ places in a city are in My spots
 * but not in any of your guides. "Not now" hides it for that city for 7 days (this browser only).
 */
export function GuideNudge({ city, count, className }: { city: string; count: number; className?: string }) {
  // Hidden until the browser says otherwise, so the server render and first paint agree.
  const hidden = useSyncExternalStore(subscribe, () => hiddenNow(city), () => true);
  if (hidden || !city) return null;
  const notNow = () => {
    try {
      localStorage.setItem(keyFor(city), String(Date.now()));
    } catch {
      /* private mode: it just shows again next time */
    }
    for (const fn of listeners) fn();
  };
  return (
    <div className={`rounded-2xl bg-ink text-cream px-4 py-3.5 ${className ?? ""}`}>
      <div className="flex items-start gap-2.5">
        <SparkleIcon size={17} className="mt-0.5 shrink-0 text-ochre" />
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold leading-snug">You&apos;ve got {count} {city} spots. Make them a guide?</p>
          <p className="mt-0.5 text-[12px] text-cream/70 leading-snug">They stay in My spots too.</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link href={`/saved/sort?city=${encodeURIComponent(city)}`} className="inline-flex items-center h-9 px-4 rounded-full bg-cream text-ink text-[13.5px] font-semibold">
          Make a guide
        </Link>
        <button type="button" onClick={notNow} className="h-9 px-3 text-[13px] text-cream/80">
          Not now
        </button>
      </div>
    </div>
  );
}
