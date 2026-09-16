import { guessCategoryFromName } from "./categories";
import { CITIES, detectCityInText, findCity } from "./cities";
import { MOCK_PLACES, type MockPlace } from "./mock-data";
import type { PlaceResult, PlaceSuggestion, PlacesProvider } from "./types";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function toResult(p: MockPlace): PlaceResult {
  return {
    providerId: `mock:${p.slug}`,
    name: p.name,
    address: p.address,
    city: p.city,
    country: p.country,
    lat: p.lat,
    lng: p.lng,
    category: p.category,
    photoUrl: null,
    hours: p.hours,
    businessStatus: "OPERATIONAL",
    source: "mock",
  };
}

/** Simple token-overlap score between a query and a place name. */
function score(query: string, p: MockPlace): number {
  const q = norm(query);
  const name = norm(p.name);
  if (!q) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  const nTokens = new Set(name.split(" "));
  const qSet = new Set(q.split(" "));
  if ([...nTokens].every((t) => qSet.has(t))) return 70; // "tsuta ramen" -> Tsuta
  let hits = 0;
  for (const t of qTokens) if (nTokens.has(t) || [...nTokens].some((n) => n.startsWith(t))) hits++;
  if (!qTokens.length) return 0;
  const ratio = hits / qTokens.length;
  return ratio >= 0.5 ? Math.round(50 * ratio) : 0;
}

/** Deterministic pseudo-random jitter so synthesised places get stable coordinates. */
function hashJitter(seed: string): [number, number] {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000 - 0.5;
  const b = (((h * 31) >>> 0) % 1000) / 1000 - 0.5;
  return [a * 0.05, b * 0.06];
}

const strip = (s: string) => s.replace(/\s*\((?:in|near)\s+[^)]+\)\s*$/i, "").trim();

/**
 * Build a plausible place for a name we don't have curated data for. The
 * creator named it, so we trust the name and give it a home in the hinted city.
 */
function synthesize(rawName: string, cityHint?: string): PlaceResult | null {
  const name = strip(rawName);
  if (!name) return null;
  // "Ichiran in Shinjuku" -> city hint from the name itself
  const inMatch = name.match(/^(.*?)\s+(?:in|near|at)\s+(.+)$/i);
  const baseName = inMatch ? inMatch[1].trim() : name;
  const cityFromName = inMatch ? findCity(inMatch[2]) ?? detectCityInText(inMatch[2]) : undefined;
  const city = cityFromName ?? findCity(cityHint) ?? detectCityInText(name) ?? CITIES[0];
  const area = inMatch && !cityFromName ? inMatch[2].trim() : inMatch && cityFromName ? inMatch[2].trim() : null;
  const [dLat, dLng] = hashJitter(`${baseName}|${city.city}`);
  const category = guessCategoryFromName(baseName);
  return {
    providerId: `mock:new:${norm(baseName).replace(/\s+/g, "-")}:${norm(city.city).replace(/\s+/g, "-")}`,
    name: baseName,
    address: area && area.toLowerCase() !== city.city.toLowerCase() ? `${area}, ${city.city}` : city.city,
    city: city.city,
    country: city.country,
    lat: +(city.lat + dLat).toFixed(5),
    lng: +(city.lng + dLng).toFixed(5),
    category,
    photoUrl: null,
    hours: category === "Nature" || category === "Scenic Spots" ? ["Open daily"] : ["Hours not available in demo mode"],
    businessStatus: "OPERATIONAL",
    source: "mock",
  };
}

export const mockProvider: PlacesProvider = {
  name: "mock",

  async autocomplete(input, cityHint) {
    const q = strip(input);
    if (q.length < 2) return [];
    const hint = findCity(cityHint);
    const ranked = MOCK_PLACES.map((p) => ({ p, s: score(q, p) + (hint && p.city === hint.city ? 5 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map<PlaceSuggestion>(({ p }) => ({
        providerId: `mock:${p.slug}`,
        mainText: p.name,
        secondaryText: `${p.address}`,
        source: "mock",
      }));
    const synth = synthesize(q, cityHint);
    if (synth && !ranked.some((r) => norm(r.mainText) === norm(synth.name))) {
      ranked.push({
        providerId: synth.providerId,
        mainText: synth.name,
        secondaryText: `${synth.city}, ${synth.country} · add as named`,
        source: "mock",
      });
    }
    return ranked;
  },

  async searchText(query, cityHint) {
    const q = strip(query);
    const hint = findCity(cityHint) ?? detectCityInText(q);
    let best: { p: MockPlace; s: number } | null = null;
    for (const p of MOCK_PLACES) {
      const s = score(q, p) + (hint && p.city === hint.city ? 5 : 0);
      if (s > 0 && (!best || s > best.s)) best = { p, s };
    }
    if (best && best.s >= 50) return toResult(best.p);
    return synthesize(q, cityHint);
  },

  async details(providerId) {
    if (providerId.startsWith("mock:new:")) {
      const [, , nameSlug, citySlug] = providerId.split(":");
      const city = findCity(citySlug?.replace(/-/g, " "));
      return synthesize(nameSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), city?.city);
    }
    const slug = providerId.replace(/^mock:/, "");
    const p = MOCK_PLACES.find((x) => x.slug === slug);
    return p ? toResult(p) : null;
  },

  async businessStatus() {
    return "OPERATIONAL";
  },
};
