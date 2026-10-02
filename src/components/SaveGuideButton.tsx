"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toggleSavedGuide } from "@/lib/actions/saved";
import { HeartIcon } from "./Icons";
import { cx } from "./ui";

/** Heart for saving a whole guide to Favourites. "round" sits in the guide's action row; "icon" sits on cards. */
export function SaveGuideButton({ guideId, initial, signedIn, variant = "round", className }: { guideId: string; initial: boolean; signedIn: boolean; variant?: "round" | "icon"; className?: string }) {
  const [saved, setSaved] = useState(initial);
  const [toast, setToast] = useState(false);
  const [, start] = useTransition();
  const path = usePathname();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const cls =
    variant === "round"
      ? cx("w-10 h-10 rounded-full border flex items-center justify-center shrink-0", saved ? "border-terracotta bg-terracotta-tint text-terracotta" : "border-line text-ink")
      : cx("w-9 h-9 -m-1.5 flex items-center justify-center rounded-full shrink-0", saved ? "text-terracotta" : "text-ink-faint hover:text-terracotta");
  const size = variant === "round" ? 18 : 19;

  if (!signedIn) {
    return (
      <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} aria-label="Save this guide" className={cx(cls, className)}>
        <HeartIcon size={size} />
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? "Remove guide from favourites" : "Save this guide"}
        className={cx(cls, className)}
        onClick={(e) => {
          e.preventDefault();
          const next = !saved;
          setSaved(next);
          setToast(next);
          start(async () => {
            try {
              const r = await toggleSavedGuide(guideId);
              setSaved(r.saved);
            } catch {
              setSaved(!next);
            }
          });
        }}
      >
        <HeartIcon size={size} filled={saved} />
      </button>
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-[440px] flex items-center gap-2.5 rounded-2xl bg-ink text-cream px-4 py-3 shadow-lg text-[13px] leading-snug">
            <HeartIcon size={16} filled className="text-terracotta-soft shrink-0" />
            <span>
              Guide saved to your Favourites. <Link href="/saved?tab=guides" className="underline underline-offset-2 font-medium">Open</Link>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
