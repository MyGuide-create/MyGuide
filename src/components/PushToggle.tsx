"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "./Icons";
import { Button, Spinner } from "./ui";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** "Get alerts on your phone" — turns Web Push on or off for this device. */
export function PushToggle({ publicKey, compact }: { publicKey: string | null; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!publicKey || !("serviceWorker" in navigator)) return setState("unsupported");
      if (!("PushManager" in window)) return setState(isIOS && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState("on");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
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
