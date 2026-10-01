"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
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
    <button type="button" onClick={toggle} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save this place"} className={cx(base, className)}>
      <HeartIcon size={variant === "pill" ? 15 : 19} filled={saved} />
      {variant === "pill" && label}
    </button>
  );
}
