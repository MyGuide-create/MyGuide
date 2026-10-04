/**
 * Dropped pins: places with no Google listing (a sunset spot, a campsite, a trailhead).
 * They have coordinates but no Google place id, so links and labels are built from lat/lng.
 */
type PinLike = { name: string; address: string; lat: number | null; lng: number | null; googlePlaceId: string | null };

export function isDroppedPin(p: PinLike): boolean {
  return !p.googlePlaceId && p.lat != null && p.lng != null;
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** "Open in Google Maps" / directions link that works for listed places and dropped pins. */
export function mapsUrl(p: PinLike): string {
  if (isDroppedPin(p)) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  const id = p.googlePlaceId && !p.googlePlaceId.startsWith("mock:") ? `&query_place_id=${p.googlePlaceId}` : "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " " + p.address)}${id}`;
}

export function validPin(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
