import { CITIES } from "./cities";

/** A city, region, country or neighbourhood as mock autocomplete returns it (Google types included). */
export interface MockRegion {
  name: string;
  country: string;
  lat: number;
  lng: number;
  types: string[];
  /** The city it belongs to, for neighbourhoods ("Alfama" → Lisbon). */
  city?: string;
}

/**
 * Mock mode's cities and regions, so the "a city isn't a spot" checks can be tried without a Maps key
 * (21 Oct 2026). Every built-in city is a locality; a few regions, countries and a neighbourhood besides.
 */
const EXTRA: MockRegion[] = [
  { name: "Cincinnati", country: "United States", lat: 39.1031, lng: -84.512, types: ["locality", "political"] },
  { name: "Bali", country: "Indonesia", lat: -8.3405, lng: 115.092, types: ["administrative_area_level_1", "political"] },
  { name: "Portugal", country: "Portugal", lat: 39.3999, lng: -8.2245, types: ["country", "political"] },
  { name: "Alfama", country: "Portugal", lat: 38.7118, lng: -9.1303, types: ["neighborhood", "political"], city: "Lisbon" },
];

export const MOCK_REGIONS: MockRegion[] = [
  ...CITIES.filter((c) => !EXTRA.some((e) => e.name === c.city)).map((c) => ({ name: c.city, country: c.country, lat: c.lat, lng: c.lng, types: ["locality", "political"] })),
  ...EXTRA,
];
