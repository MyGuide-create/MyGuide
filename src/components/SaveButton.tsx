"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toggleSavedPlace } from "@/lib/actions/saved";
import { HeartIcon } from "./Icons";
import { cx } from "./ui";

/** Heart toggle for saving a place to the reader's "Saved" list. */
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
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast === "first" ? 4500 : 1600);
    return () => clearTimeout(t);
  }, [toast]);
  const path = usePathname();
  const label = saved ? "Saved" : "Save";
  const base =
    variant === "pill"
      ? cx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium", saved ? "border-terracotta bg-terracotta-tint text-terracotta-deep" : "border-line text-ink")
      : cx("w-9 h-9 -m-1.5 flex items-center justify-center rounded-full", saved ? "text-terracotta" : "text-ink-faint hover:text-terracotta");

  if (!signedIn) {
    return (
      <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} aria-label="Save this place" className={cx(base, className)}>
        <HeartIcon size={variant === "pill" ? 15 : 19} />
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
      } catch {
        setSaved(!next);
      }
    });
  };
  return (
    <>
    <button type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save this place"} className={cx(base, className)}>
      <HeartIcon size={variant === "pill" ? 15 : 19} filled={saved} />
      {variant === "pill" && label}
    </button>
    {toast && (
      <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto max-w-[440px] flex items-center gap-2.5 rounded-2xl bg-ink text-cream px-4 py-3 shadow-lg text-[13px] leading-snug">
          <HeartIcon size={16} filled className="text-terracotta-soft shrink-0" />
          {toast === "first" ? (
            <span>
              Saved to your list. Find it any time under <b>You → Saved places</b>.{" "}
              <Link href="/saved" className="underline underline-offset-2 font-medium">Open</Link>
            </span>
          ) : (
            <span>Saved</span>
          )}
        </div>
      </div>
    )}
    </>
  );
}
