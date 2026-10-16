"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toggleSavedPlace, type FollowNudge } from "@/lib/actions/saved";
import { toggleFollow } from "@/lib/actions/social";
import { BookmarkIcon } from "./Icons";
import { cx } from "./ui";

/** Bookmark: Save a place to your Saved list (your private shortlist of other people's spots). */
export function SaveButton({
  placeId,
  initial,
  signedIn,
  variant = "icon",
  className,
}: {
  placeId: string;
  initial: boolean;
  signedIn: boolean;
  variant?: "icon" | "pill";
  className?: string;
}) {
  const [saved, setSaved] = useState(initial);
  const [, start] = useTransition();
  const [toast, setToast] = useState<"first" | "short" | null>(null);
  // "You've saved 2 of Sami's spots — Follow" (15 Oct 2026).
  const [nudge, setNudge] = useState<FollowNudge | null>(null);
  const [followed, setFollowed] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast === "first" ? 4500 : 1600);
    return () => clearTimeout(t);
  }, [toast]);
  // Only one toast on screen: a follow nudge clears any "Added to Want to go" from other buttons.
  useEffect(() => {
    const clear = () => setToast(null);
    window.addEventListener("mg:save-toast-clear", clear);
    return () => window.removeEventListener("mg:save-toast-clear", clear);
  }, []);
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), followed ? 1800 : 7000);
    return () => clearTimeout(t);
  }, [nudge, followed]);
  const path = usePathname();
  const label = saved ? "Saved" : "Save";
  const base =
    variant === "pill"
      ? cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium", saved ? "border-terracotta bg-terracotta-tint text-terracotta-deep" : "border-line text-ink")
      : cx("w-9 h-9 -m-1.5 flex items-center justify-center rounded-full", saved ? "text-terracotta" : "text-ink-faint hover:text-terracotta");

  if (!signedIn) {
    return (
      <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} aria-label="Save" className={cx(base, className)}>
        <BookmarkIcon size={variant === "pill" ? 15 : 19} />
        {variant === "pill" && label}
      </Link>
    );
  }
  const toggle = () => {
    const next = !saved;
    setSaved(next);
    if (next) {
      let seen = false;
      try {
        seen = localStorage.getItem("mg_saved_hint") === "1";
        localStorage.setItem("mg_saved_hint", "1");
      } catch {
        /* storage blocked — just show the full hint */
      }
      setToast(seen ? "short" : "first");
    } else {
      setToast(null);
    }
    start(async () => {
      try {
        const r = await toggleSavedPlace(placeId);
        setSaved(r.saved);
        if (r.nudge) {
          window.dispatchEvent(new Event("mg:save-toast-clear"));
          setFollowed(false);
          setNudge(r.nudge);
        }
      } catch {
        setSaved(!next);
      }
    });
  };
  return (
    <>
    <button type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? "Remove from Saved" : "Save"} className={cx(base, className)}>
      <BookmarkIcon size={variant === "pill" ? 15 : 19} filled={saved} />
      {variant === "pill" && label}
    </button>
    {toast && (
      <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto max-w-[440px] flex items-center gap-2.5 rounded-2xl bg-ink text-cream px-4 py-3 shadow-lg text-[13px] leading-snug">
          <BookmarkIcon size={16} filled className="text-terracotta-soft shrink-0" />
          {toast === "first" ? (
            <span>
              Saved. Find it any time under <b>My spots → Saved</b>.{" "}
              <Link href="/my-places?tab=saved" className="underline underline-offset-2 font-medium">Open</Link>
            </span>
          ) : (
            <span>Saved</span>
          )}
        </div>
      </div>
    )}
    {nudge && (
      <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto max-w-[440px] flex items-center gap-3 rounded-2xl bg-ink text-cream px-4 py-3 shadow-lg text-[13px] leading-snug">
          <BookmarkIcon size={16} filled className="text-terracotta-soft shrink-0" />
          <span className="flex-1">
            {followed ? (
              <>Following {nudge.name} — their new spots show up on Home.</>
            ) : (
              <>You&apos;ve saved {nudge.count} of {nudge.name}&apos;s spots. Follow {nudge.name}?</>
            )}
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
    )}
    </>
  );
}
