"use client";

import { useSyncExternalStore } from "react";
import { BookmarkIcon, RecommendIcon, XIcon } from "./Icons";

const KEY = "mg_explore_tip_seen";
const EVENT = "mg:explore-tip";
const subscribe = (on: () => void) => {
  window.addEventListener(EVENT, on);
  return () => window.removeEventListener(EVENT, on);
};
const unseen = () => {
  try {
    return localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
};

/**
 * The one place the whole idea is spelled out (19 Oct 2026), shown on the first city you open in
 * Explore until you close it. Everything else teaches it by use: rows say who vouches, the only
 * button is Save, and the toast says where the spot went.
 */
export function ExploreTip() {
  const show = useSyncExternalStore(subscribe, unseen, () => false);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };
  return (
    <div role="note" className="relative rounded-2xl bg-cream-deep/70 px-3.5 py-3 pr-10 flex flex-col gap-1.5 text-[13px] leading-snug">
      <p className="flex items-start gap-2">
        <BookmarkIcon size={15} filled className="shrink-0 mt-0.5 text-terracotta" />
        <span>
          <b className="font-semibold">Save spots you want to try.</b> They go to My spots, and only you see them.
        </span>
      </p>
      <p className="flex items-start gap-2">
        <RecommendIcon size={16} filled className="shrink-0 mt-0.5 text-sage" />
        <span>
          <b className="font-semibold">Been somewhere you loved? Vouch for it,</b> and your friends will see it here.
        </span>
      </p>
      <button type="button" onClick={close} aria-label="Got it, hide this" className="absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded-full text-ink-muted">
        <XIcon size={16} />
      </button>
    </div>
  );
}
