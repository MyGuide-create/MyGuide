import { getPlacesProvider } from ".";
import { findCityExact } from "./cities";
import { looksLikeMisspelling } from "./spelling";
import type { PlaceSuggestion } from "./types";

/** The city someone typed into a place search, to offer "Looking for a place in Cincinnati?". */
export interface TypedCity {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Same text, or a clear misspelling of it (the city-check rule: "Cincinatti" → Cincinnati). */
const sameCity = (typed: string, real: string) => norm(typed) === norm(real) || looksLikeMisspelling(typed, real);

/**
 * Is the typed text a city? Uses the city/region suggestions the place search already got back (no extra
 * Google call to decide), then the built-in city list by its own name — not its aliases, so "Alfama" (a
 * Lisbon alias, and a fine spot) isn't taken for Lisbon. The centre comes from the built-in list when
 * known, else one lookup of the region suggestion.
 */
export async function typedCityHint(q: string, regions: PlaceSuggestion[]): Promise<TypedCity | null> {
  const text = q.trim();
  if (text.length < 3) return null;
  const hit = regions.find((r) => sameCity(text, r.mainText));
  const known = findCityExact(hit?.mainText ?? text);
  if (known && (hit || norm(known.city) === norm(text))) return { name: known.city, country: known.country, lat: known.lat, lng: known.lng };
  if (!hit) return null;
  try {
    const info = await getPlacesProvider().city(hit.providerId);
    if (info && Number.isFinite(info.lat)) return { name: hit.mainText, country: info.country, lat: info.lat, lng: info.lng };
  } catch (e) {
    console.warn("[typedCityHint]", e);
  }
  return null;
}

/**
 * A saved spot that is really a city ("Cincinnati" in Cincinnati, "Portugal" in Portugal): its name is its own
 * city or country. Cheap guess for Fix location (no Google call); saving a fix still checks Google's types.
 */
export function citySpotOf(p: { name: string; city: string; country: string; lat: number | null; lng: number | null }): TypedCity | null {
  const n = norm(p.name);
  if (!n || p.lat == null || p.lng == null) return null;
  if (n !== norm(p.city) && n !== norm(p.country)) return null;
  const known = findCityExact(p.name);
  return known && norm(known.city) === n
    ? { name: known.city, country: known.country, lat: known.lat, lng: known.lng }
    : { name: p.name, country: p.country, lat: p.lat, lng: p.lng };
}
