"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toggleSavedPlace, type FollowNudge } from "@/lib/actions/saved";
import { toggleFollow } from "@/lib/actions/social";
import { BookmarkIcon } from "./Icons";
import { cx } from "./ui";

/** Set after a save until you open My spots: a dot on the tab (19 Oct 2026). */
export const SPOTS_DOT_KEY = "mg_spots_dot";
export const SPOTS_DOT_EVENT = "mg:spots-dot";
/** Save toasts live in the tab bar (SaveToasts), not the button, so they stay up when the row leaves or the page refreshes. */
const TOAST_EVENT = "mg:save-toast";
type ToastDetail = { kind: "saved"; city?: string; first: boolean } | { kind: "nudge"; nudge: FollowNudge } | { kind: "clear" };
const emit = (d: ToastDetail) => window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: d }));

/**
 * Bookmark: Save a spot to try. It goes to My spots → Saved to try, and only you see it.
 * `city`: the toast names where it went ("Saved to your Lisbon spots"). `leave`: on Explore the row
 * slides out once saved (the closest `[data-leave]` element), because Explore only shows spots you
 * don't have yet.
 */
export function SaveButton({
  placeId,
  initial,
  signedIn,
  variant = "icon",
  className,
  city,
  leave = false,
}: {
  placeId: string;
  initial: boolean;
  signedIn: boolean;
  variant?: "icon" | "pill" | "bar";
  className?: string;
  city?: string;
  leave?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const path = usePathname();
  const label = saved ? "Saved" : "Save";
  const base =
    variant === "bar"
      ? cx("flex-1 inline-flex items-center justify-center gap-2 rounded-full h-12 text-[15px] font-semibold", saved ? "bg-terracotta-tint text-terracotta-deep border border-terracotta-soft" : "bg-terracotta text-white")
      : variant === "pill"
      ? cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium", saved ? "border-terracotta bg-terracotta-tint text-terracotta-deep" : "border-line text-ink")
      : cx("w-9 h-9 -m-1.5 flex items-center justify-center rounded-full", saved ? "text-terracotta" : "text-ink-faint hover:text-terracotta");

  if (!signedIn) {
    return (
      <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} aria-label="Save" className={cx(base, className)}>
        <BookmarkIcon size={variant === "icon" ? 19 : 16} />
        {variant !== "icon" && label}
      </Link>
    );
  }

  /** The row this button sits in folds away (Explore). */
  const slideOut = () => {
    const row = btn.current?.closest<HTMLElement>("[data-leave]");
    if (!row) return;
    row.style.overflow = "hidden";
    row.style.maxHeight = `${row.offsetHeight}px`;
    row.style.transition = "max-height 320ms ease, opacity 220ms ease";
    requestAnimationFrame(() => {
      row.style.opacity = "0";
      row.style.maxHeight = "0px";
    });
    setTimeout(() => {
      row.hidden = true;
    }, 360);
  };

  const toggle = () => {
    const next = !saved;
    setSaved(next);
    if (next) {
      let seen = false;
      try {
        seen = localStorage.getItem("mg_saved_hint") === "1";
        localStorage.setItem("mg_saved_hint", "1");
        localStorage.setItem(SPOTS_DOT_KEY, "1");
      } catch {
        /* storage blocked — just show the full hint */
      }
      window.dispatchEvent(new Event(SPOTS_DOT_EVENT));
      emit({ kind: "saved", city, first: !seen });
      if (leave) slideOut();
    } else {
      emit({ kind: "clear" });
    }
    start(async () => {
      try {
        const r = await toggleSavedPlace(placeId);
        setSaved(r.saved);
        if (r.nudge) emit({ kind: "nudge", nudge: r.nudge });
      } catch {
        setSaved(!next);
      }
    });
  };
  return (
    <button ref={btn} type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? "Remove from Saved" : "Save to try"} className={cx(base, className)}>
      <BookmarkIcon size={variant === "icon" ? 19 : 16} filled={saved} />
      {variant !== "icon" && label}
    </button>
  );
}

/**
 * The save toasts (19 Oct 2026), mounted once with the tab bar: "Saved to your Lisbon spots · Open"
 * (first time: only you see it, vouch once you've been), and the follow nudge after a second save
 * from the same person.
 */
export function SaveToasts() {
  const [toast, setToast] = useState<{ city?: string; first: boolean } | null>(null);
  const [nudge, setNudge] = useState<FollowNudge | null>(null);
  const [followed, setFollowed] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (d.kind === "saved") {
        setNudge(null);
        setToast({ city: d.city, first: d.first });
      } else if (d.kind === "nudge") {
        setToast(null);
        setFollowed(false);
        setNudge(d.nudge);
      } else setToast(null);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.first ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), followed ? 1800 : 7000);
    return () => clearTimeout(t);
  }, [nudge, followed]);
  if (toast) {
    const where = toast.city ? `your ${toast.city} spots` : "My spots";
    const openHref = toast.city ? `/my-places?city=${encodeURIComponent(toast.city)}` : "/my-places?tab=saved";
    return (
      <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[440px] flex items-center gap-2.5 rounded-2xl bg-ink text-cream px-4 py-3 shadow-lg text-[13px] leading-snug">
          <BookmarkIcon size={16} filled className="text-terracotta-soft shrink-0" />
          <span className="flex-1">
            Saved to {where}
            {toast.first && <span className="block text-cream/70 text-[12px]">Only you see it. Been and loved it? Vouch for it there.</span>}
          </span>
          <Link href={openHref} onClick={() => setToast(null)} className="shrink-0 underline underline-offset-2 font-semibold">Open</Link>
        </div>
      </div>
    );
  }
  if (!nudge) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto max-w-[440px] flex items-center gap-3 rounded-2xl bg-ink text-cream px-4 py-3 shadow-lg text-[13px] leading-snug">
        <BookmarkIcon size={16} filled className="text-terracotta-soft shrink-0" />
        <span className="flex-1">
          {followed ? <>Following {nudge.name}. Their new spots show up on Explore.</> : <>You&apos;ve saved {nudge.count} of {nudge.name}&apos;s spots. Follow {nudge.name}?</>}
        </span>
        {!followed && (
          <button
            type="button"
            className="shrink-0 rounded-full bg-cream text-ink px-3 py-1 text-[12.5px] font-semibold"
            onClick={() => {
              setFollowed(true);
              toggleFollow(nudge.userId).catch(() => setFollowed(false));
            }}
          >
            Follow
          </button>
        )}
      </div>
    </div>
  );
}
