"use client";

import { useEffect, useState } from "react";
import { isStandalone, pushState, subscribePush } from "@/lib/pushClient";
import { BellIcon } from "./Icons";
import { Spinner } from "./ui";

const KEY = "mg_alerts_nudge";
const AGAIN_MS = 3 * 24 * 60 * 60 * 1000; // "Not now" → ask again in 3 days

/**
 * First time someone opens the home-screen app (where iPhone alerts finally work) with alerts off:
 * a small card above the bottom nav with one "Turn on" button.
 */
export function AlertsNudge({ publicKey }: { publicKey: string | null }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicKey || !isStandalone()) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {}
    if (Date.now() - last < AGAIN_MS) return;
    pushState(publicKey)
      .then((s) => setShow(s === "off"))
      .catch(() => {});
  }, [publicKey]);

  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
    setShow(false);
  };

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      await subscribePush(publicKey);
    } catch {}
    later();
    setBusy(false);
  };

  if (!show) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 pointer-events-none">
      <div role="dialog" aria-label="Turn on alerts" className="fade-up pointer-events-auto w-full max-w-[456px] rounded-[20px] bg-ink text-cream p-4 flex gap-3 items-center shadow-[0_12px_32px_oklch(22%_0.02_60/0.3)]">
        <span className="w-10 h-10 rounded-full bg-terracotta text-white flex items-center justify-center shrink-0"><BellIcon size={20} /></span>
        <div className="flex-1 min-w-0 text-[13.5px] leading-snug text-cream/80">
          <span className="block text-[15.5px] font-semibold text-cream">Turn on alerts</span>
          Hear when friends add guides, follow you or comment.
        </div>
        <div className="flex flex-col items-stretch gap-1 shrink-0">
          <button type="button" onClick={turnOn} disabled={busy} className="h-9 px-4 rounded-full bg-terracotta text-white text-[14px] font-semibold disabled:opacity-60">
            {busy ? <Spinner /> : "Turn on"}
          </button>
          <button type="button" onClick={later} className="h-7 text-[13px] text-cream/70">Not now</button>
        </div>
      </div>
    </div>
  );
}
