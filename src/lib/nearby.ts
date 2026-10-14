/**
 * "Near you" for city rows (13 Oct 2026): the city the person is in (or nearest to) goes first.
 * Where they are comes from Vercel's IP location headers — no permission prompt, city-level only,
 * never stored. Where a city is: the built-in list, else the middle of its places on MyGuide.
 */
import { headers } from "next/headers";
import { isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import { places } from "./db/schema";
import { CITIES, canonicalCity, findCityExact } from "./places/cities";
import { haversineMeters } from "./places/geo";

export type LatLng = { lat: number; lng: number };

/** A city this close counts as "near you". */
export const NEAR_KM = 150;

const keyOf = (city: string) => canonicalCity(city).toLowerCase();

/** Roughly where the viewer is (city level), or null (local dev, unknown IP). */
export async function viewerLocation(): Promise<LatLng | null> {
  try {
    const h = await headers();
    const lat = Number(decodeURIComponent(h.get("x-vercel-ip-latitude") ?? ""));
    const lng = Number(decodeURIComponent(h.get("x-vercel-ip-longitude") ?? ""));
    if (!h.get("x-vercel-ip-latitude") || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Centre of each city: built-in coordinates, else the average of its places. */
async function cityCentres(cities: string[]): Promise<Map<string, LatLng>> {
  const out = new Map<string, LatLng>();
  const unknown = new Set<string>();
  for (const c of cities) {
    const k = keyOf(c);
    const known = findCityExact(c);
    if (known) out.set(k, { lat: known.lat, lng: known.lng });
    else unknown.add(k);
  }
  if (!unknown.size) return out;
  const db = await getDb();
  const rows = await db.select({ city: places.city, lat: places.lat, lng: places.lng }).from(places).where(isNotNull(places.lat));
  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const r of rows) {
    if (!r.city.trim() || r.lat == null || r.lng == null) continue;
    const k = keyOf(r.city);
    if (!unknown.has(k)) continue;
    const s = sums.get(k) ?? { lat: 0, lng: 0, n: 0 };
    s.lat += r.lat;
    s.lng += r.lng;
    s.n++;
    sums.set(k, s);
  }
  for (const [k, s] of sums) out.set(k, { lat: s.lat / s.n, lng: s.lng / s.n });
  return out;
}

/**
 * Most spots first, with the nearest city within NEAR_KM moved to the front. Returns the key of
 * that city (for a "Near you" label) — null when nothing is near or the location is unknown.
 */
export async function nearestFirst<T extends { city: string; spots: number }>(items: T[], here: LatLng | null): Promise<{ items: T[]; nearKey: string | null }> {
  const sorted = [...items].sort((a, b) => b.spots - a.spots);
  if (!here || !sorted.length) return { items: sorted, nearKey: null };
  const centres = await cityCentres(sorted.map((c) => c.city));
  let best: { i: number; km: number } | null = null;
  sorted.forEach((c, i) => {
    const at = centres.get(keyOf(c.city));
    if (!at) return;
    const km = haversineMeters(here.lat, here.lng, at.lat, at.lng) / 1000;
    if (km <= NEAR_KM && (!best || km < best.km)) best = { i, km };
  });
  if (!best) return { items: sorted, nearKey: null };
  const { i } = best as { i: number; km: number };
  const [near] = sorted.splice(i, 1);
  return { items: [near, ...sorted], nearKey: keyOf(near.city) };
}

export const nearKeyOf = keyOf;

/** The known city the viewer is in or next to (within 100 km), for "Your Dubai" on a new person's Home. */
export function nearestKnownCity(here: LatLng | null): { city: string; country: string } | null {
  if (!here) return null;
  let best: { city: string; country: string; km: number } | null = null;
  for (const c of CITIES) {
    const km = haversineMeters(here.lat, here.lng, c.lat, c.lng) / 1000;
    if (km <= 100 && (!best || km < best.km)) best = { city: c.city, country: c.country, km };
  }
  return best ? { city: best.city, country: best.country } : null;
}
