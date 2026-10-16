"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicUser } from "@/lib/auth";
import { BookmarkIcon, ChevronDown, XIcon } from "./Icons";
import { Avatar, cx } from "./ui";

export interface WhoOption {
  key: string;
  label: string;
  /** "8 spots", "Spots you saved here"… */
  sub?: string;
  href: string;
  active: boolean;
  user?: PublicUser | null;
  kind?: "all" | "saved";
}

/**
 * City page's "Whose spots" filter as one chip (16 Oct 2026): "Everyone ▾" opens a sheet with
 * Everyone, your Saved, You and each friend. Sits first in the sticky filter row.
 */
export function WhoPicker({ options }: { options: WhoOption[] }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.active) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!current) return null;
  const filtered = current.kind !== "all";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cx(
          "shrink-0 inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-3 py-1 text-[13.5px] font-semibold whitespace-nowrap",
          filtered ? "bg-ink text-cream border-ink" : "bg-paper border-line text-ink",
        )}
      >
        <OptionFace o={current} size={26} />
        {current.kind === "all" ? "Everyone" : current.label}
        <ChevronDown size={15} aria-hidden />
      </button>
      {/* Portalled to <body>: the sticky filter bar's backdrop blur would otherwise trap a fixed sheet inside it. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Whose spots">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full max-w-[480px] rounded-t-[28px] bg-cream px-4 pt-3 pb-8 safe-bottom max-h-[80dvh] overflow-y-auto fade-up">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" />
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="font-display text-[22px]">Whose spots</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full text-ink-muted">
                <XIcon size={18} />
              </button>
            </div>
            <ul className="flex flex-col">
              {options.map((o) => (
                <li key={o.key}>
                  <Link
                    href={o.href}
                    replace
                    scroll={false}
                    onClick={() => setOpen(false)}
                    aria-current={o.active ? "true" : undefined}
                    className={cx("flex items-center gap-3 rounded-2xl px-2 py-2.5", o.active && "bg-paper border border-line")}
                  >
                    <OptionFace o={o} size={40} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold truncate">{o.label}</span>
                      {o.sub && <span className="block text-[12.5px] text-ink-muted truncate">{o.sub}</span>}
                    </span>
                    {o.active && <span className="text-[12px] font-semibold text-terracotta-deep">Showing</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function OptionFace({ o, size }: { o: WhoOption; size: number }) {
  if (o.user) return <Avatar user={o.user} size={size} />;
  if (o.kind === "saved")
    return (
      <span style={{ width: size, height: size }} className="rounded-full bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0">
        <BookmarkIcon size={Math.round(size * 0.45)} filled />
      </span>
    );
  return (
    <span style={{ width: size, height: size }} className="rounded-full bg-cream-deep text-ink flex items-center justify-center shrink-0 text-[11px] font-semibold">
      All
    </span>
  );
}
