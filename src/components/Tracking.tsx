"use client";

import { useEffect } from "react";
import { EVENT_TYPES, track, type EventType } from "@/lib/track";

/** Records one view when mounted (guide page or place page). */
export function TrackView({ type, guideId, placeId }: { type: EventType; guideId: string; placeId?: string | null }) {
  useEffect(() => {
    track(type, guideId, placeId);
  }, [type, guideId, placeId]);
  return null;
}

/** One document-level listener: any click on an element carrying trackAttrs(...) is recorded. Works for server-rendered links too. */
export function TrackClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-track]");
      if (!el) return;
      const type = el.getAttribute("data-track") as EventType;
      const guideId = el.getAttribute("data-track-guide");
      if (!guideId || !EVENT_TYPES.includes(type)) return;
      track(type, guideId, el.getAttribute("data-track-place"));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
