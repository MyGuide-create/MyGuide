/**
 * An iconic photo of each city for city tiles (Home, trip card, /cities), from Unsplash: its
 * landmark (Burj Khalifa, Alfama rooftops…) — never a guide cover, which can be anything (a plate
 * of steak and fries for Dubai). Looked up once per
 * city and stored in city_photos; a city with no photo (or no Unsplash key) gets a warm tile.
 */
import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { cityPhotos, type CityPhoto } from "./db/schema";
import { firstUnsplashPhoto, hasUnsplashKey } from "./covers/unsplash";
import { canonicalCity, findCityExact } from "./places/cities";

/** New lookups per page load, to stay well inside Unsplash's hourly limit (50/hour on the demo tier; ~2 requests per city). */
const MAX_LOOKUPS = 4;
/** Retry a city whose searches really found nothing after a day. */
const RETRY_MS = 86_400_000;
/** After Unsplash refuses (rate limit, bad key, outage), stop asking for a while instead of failing on every page. */
const PAUSE_MS = 15 * 60_000;
let pausedUntil = 0;

const keyOf = (city: string) => canonicalCity(city).toLowerCase();

/** What each city is known for, so its tile shows its landmark. Others search "<city> landmark skyline". */
const ICONIC: Record<string, string> = {
  dubai: "Burj Khalifa Dubai skyline",
  "abu dhabi": "Sheikh Zayed Grand Mosque",
  sharjah: "Sharjah corniche",
  doha: "Doha skyline corniche",
  riyadh: "Riyadh Kingdom Centre skyline",
  muscat: "Muscat Sultan Qaboos mosque",
  beirut: "Beirut Raouche pigeon rocks",
  cairo: "Giza pyramids Cairo",
  istanbul: "Istanbul Hagia Sophia Bosphorus",
  marrakech: "Marrakech Koutoubia medina",
  lisbon: "Lisbon Alfama rooftops",
  porto: "Porto Ribeira Douro",
  madrid: "Madrid Gran Via",
  barcelona: "Barcelona Sagrada Familia",
  london: "London Big Ben Westminster",
  paris: "Paris Eiffel Tower",
  rome: "Rome Colosseum",
  milan: "Milan Duomo",
  florence: "Florence Duomo skyline",
  venice: "Venice Grand Canal",
  athens: "Athens Acropolis",
  amsterdam: "Amsterdam canal houses",
  berlin: "Berlin Brandenburg Gate",
  vienna: "Vienna Schonbrunn",
  prague: "Prague Charles Bridge",
  "new york": "New York Manhattan skyline",
  "los angeles": "Los Angeles Hollywood sign",
  miami: "Miami Beach South Beach",
  "mexico city": "Mexico City Palacio de Bellas Artes",
  tokyo: "Tokyo Shibuya crossing night",
  kyoto: "Kyoto Fushimi Inari",
  osaka: "Osaka Dotonbori",
  seoul: "Seoul Gyeongbokgung palace",
  singapore: "Singapore Marina Bay Sands",
  bangkok: "Bangkok Wat Arun",
  bali: "Bali rice terraces Ubud",
  "hong kong": "Hong Kong Victoria Harbour skyline",
  sydney: "Sydney Opera House",
  "cape town": "Cape Town Table Mountain",
  tashkent: "Tashkent Khast Imam",
  tbilisi: "Tbilisi old town",
  baku: "Baku Flame Towers",
  // Resort areas and islands: the place itself, not a skyline it doesn't have.
  maldives: "Maldives overwater villas",
  seychelles: "Seychelles La Digue beach",
  mauritius: "Mauritius Le Morne beach",
  fiji: "Fiji island beach",
  "french polynesia": "Bora Bora lagoon",
  sotogrande: "Sotogrande marina",
  marbella: "Marbella Puerto Banus",
  comporta: "Comporta beach Portugal",
  mykonos: "Mykonos windmills",
  santorini: "Santorini Oia",
  ibiza: "Ibiza Dalt Vila",
};

/** `countries`: city key → country, for towns not in the built-in list (helps the last search). */
export async function cityPhotosFor(cities: string[], countries?: Map<string, string>): Promise<Map<string, CityPhoto>> {
  const out = new Map<string, CityPhoto>();
  const keys = [...new Set(cities.filter((c) => c.trim()).map(keyOf))];
  if (!keys.length) return out;
  const db = await getDb();
  const rows = await db.select().from(cityPhotos).where(inArray(cityPhotos.cityKey, keys));
  for (const r of rows) if (r.url) out.set(r.cityKey, r);
  if (!hasUnsplashKey() || Date.now() < pausedUntil) return out;

  const known = new Map(rows.map((r) => [r.cityKey, r]));
  const missing = keys.filter((k) => {
    const r = known.get(k);
    return !r || (!r.url && Date.now() - r.createdAt.getTime() > RETRY_MS);
  });
  for (const k of missing.slice(0, MAX_LOOKUPS)) {
    try {
      const city = findCityExact(k)?.city ?? cities.find((c) => keyOf(c) === k) ?? k;
      // Landmark first; small towns and resorts have no skyline, so then just the name (Sotogrande
      // found nothing for "landmark skyline" or "city"), then the name with its country.
      const country = findCityExact(k)?.country ?? countries?.get(k) ?? "";
      const queries = [ICONIC[k] ?? `${city} landmark skyline`, city, ...(country && country.toLowerCase() !== k ? [`${city} ${country}`] : [])];
      let found: Awaited<ReturnType<typeof firstUnsplashPhoto>> = { photo: null, failed: false };
      for (const q of queries) {
        found = await firstUnsplashPhoto(q);
        if (found.failed || found.photo) break;
      }
      // Couldn't ask (rate limit etc.): store nothing, so the city is tried again soon — not a week later.
      if (found.failed) {
        pausedUntil = Date.now() + PAUSE_MS;
        break;
      }
      const photo = found.photo;
      const row: CityPhoto = {
        cityKey: k,
        url: photo?.url ?? null,
        author: photo?.author ?? null,
        authorUrl: photo?.authorUrl ?? null,
        unsplashId: photo?.id ?? null,
        createdAt: new Date(),
      };
      await db.insert(cityPhotos).values(row).onConflictDoUpdate({ target: cityPhotos.cityKey, set: { ...row } });
      if (row.url) out.set(k, row);
    } catch (e) {
      console.warn("[cityPhotos]", k, e);
    }
  }
  return out;
}

export const cityPhotoKey = keyOf;
