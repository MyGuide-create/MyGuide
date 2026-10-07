"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "./Icons";
import { Button, Spinner } from "./ui";
import { pushState, subscribePush, unsubscribePush, type PushState } from "@/lib/pushClient";

type State = "loading" | PushState;

/** "Get alerts on your phone" — turns Web Push on or off for this device. */
export function PushToggle({ publicKey, compact }: { publicKey: string | null; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState(publicKey).then(setState).catch(() => setState("unsupported"));
  }, [publicKey]);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      setState(await subscribePush(publicKey));
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await unsubscribePush();
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading" || state === "unsupported") return null;
  if (compact && state === "on") return null;

  return (
    <div className="rounded-2xl border border-line bg-paper px-4 py-3 flex items-center gap-3">
      <span className="w-9 h-9 rounded-full bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><BellIcon size={18} /></span>
      <div className="flex-1 min-w-0 text-[12.5px] leading-snug">
        {state === "ios-install" && (
          <>
            <span className="block font-semibold text-[13.5px]">Get alerts on your iPhone</span>
            Tap Share <span aria-hidden>⬆︎</span> → <b>Add to Home Screen</b>, open MyGuide from there, then turn alerts on.
          </>
        )}
        {state === "denied" && (
          <>
            <span className="block font-semibold text-[13.5px]">Alerts are blocked</span>
            Allow notifications for this site in your phone or browser settings.
          </>
        )}
        {state === "off" && (
          <>
            <span className="block font-semibold text-[13.5px]">Get alerts on your phone</span>
            New guides from people you follow, new followers and comments.
          </>
        )}
        {state === "on" && (
          <>
            <span className="block font-semibold text-[13.5px]">Phone alerts are on</span>
            For this device.
          </>
        )}
      </div>
      {state === "off" && <Button size="sm" onClick={turnOn} disabled={busy}>{busy ? <Spinner /> : "Turn on"}</Button>}
      {state === "on" && <Button size="sm" variant="ghost" className="border border-line" onClick={turnOff} disabled={busy}>{busy ? <Spinner /> : "Turn off"}</Button>}
    </div>
  );
}
