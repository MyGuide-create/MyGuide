/**
 * Lightweight usage tracking for the pilot. Shared by the client (to send) and the /api/events route (to validate).
 * Later, "tap_book" can be added when booking-partner links go in.
 */
export const EVENT_TYPES = ["guide_view", "place_view", "share", "fork", "tap_directions", "tap_call"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Fire-and-forget: never blocks navigation, never throws. */
export function track(type: EventType, guideId: string, placeId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ type, guideId, placeId: placeId ?? undefined });
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/events", blob)) return;
    void fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Props to spread on a link so the global click listener (TrackClicks) records a tap on it. */
export function trackAttrs(type: EventType, guideId: string, placeId?: string | null) {
  return { "data-track": type, "data-track-guide": guideId, ...(placeId ? { "data-track-place": placeId } : {}) };
}
