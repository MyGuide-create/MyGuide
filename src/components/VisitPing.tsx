"use client";

import { useEffect } from "react";

const EVERY_MS = 30 * 60 * 1000;

/** Tells the server the app was opened (at most every 30 min per browser), and whether from the home-screen app. */
export function VisitPing({ userId }: { userId: string }) {
  useEffect(() => {
    const KEY = `mg_visit_${userId}`;
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY) ?? 0);
    } catch {}
    if (Date.now() - last < EVERY_MS) return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ standalone }), keepalive: true })
      .then(() => {
        try {
          localStorage.setItem(KEY, String(Date.now()));
        } catch {}
      })
      .catch(() => {});
  }, [userId]);
  return null;
}
