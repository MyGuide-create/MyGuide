/**
 * Match places from a saved Google Maps list to Google Places listings. The list gives us each
 * place's own coordinates, so a real match sits right on top of them; anything else is kept as a
 * dropped pin rather than guessing.
 */
import { haversineMeters } from "./geo";
import { searchTextNear } from "./google";
import type { PlaceResult } from "./types";

export interface ListPlaceToMatch {
  name: string;
  lat: number;
  lng: number;
}

/** "Café Nero (Soho)" → "cafe nero soho" */
function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function similarNames(a: string, b: string): boolean {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 3 && long.includes(short)) return true;
  const xs = new Set(x.split(" "));
  const ys = new Set(y.split(" "));
  const shared = [...xs].filter((w) => ys.has(w)).length;
  return shared / Math.min(xs.size, ys.size) >= 0.6;
}

/** Same name within a short walk, or practically the same pin. */
const NAME_MATCH_METERS = 250;
const SAME_PIN_METERS = 10;

export function pickConfidentMatch(target: ListPlaceToMatch, candidates: PlaceResult[]): PlaceResult | null {
  let best: { r: PlaceResult; d: number } | null = null;
  for (const r of candidates) {
    const d = haversineMeters(target.lat, target.lng, r.lat, r.lng);
    const ok = d <= SAME_PIN_METERS || (d <= NAME_MATCH_METERS && similarNames(target.name, r.name));
    if (ok && (!best || d < best.d)) best = { r, d };
  }
  return best?.r ?? null;
}

/** Never throws: no confident match (or a Google error) → null, and the caller keeps it as a pin. */
export async function matchListPlace(p: ListPlaceToMatch): Promise<PlaceResult | null> {
  try {
    return pickConfidentMatch(p, await searchTextNear(p.name, { lat: p.lat, lng: p.lng }, 200, 3));
  } catch (e) {
    console.warn("[matchList] search failed", p.name, e);
    return null;
  }
}
