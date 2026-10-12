/**
 * An iconic photo of each city for city tiles (Home, trip card, /cities), from Unsplash: its
 * landmark (Burj Khalifa, Alfama rooftops…) — never a guide cover, which can be anything (a plate
 * of steak and fries for Dubai). Looked up once per
 * city and stored in city_photos; a city with no photo (or no Unsplash key) gets a warm tile.
 */
import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { cityPhotos, type CityPhoto } from "./db/schema";
import { claimUnsplashPhoto, hasUnsplashKey, searchUnsplash } from "./covers/unsplash";
import { canonicalCity, findCityExact } from "./places/cities";

/** New lookups per page load, to stay well inside Unsplash's hourly limit. */
const MAX_LOOKUPS = 3;
/** Retry a city that found nothing after a week. */
const RETRY_MS = 7 * 86_400_000;

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
};

export async function cityPhotosFor(cities: string[]): Promise<Map<string, CityPhoto>> {
  const out = new Map<string, CityPhoto>();
  const keys = [...new Set(cities.filter((c) => c.trim()).map(keyOf))];
  if (!keys.length) return out;
  const db = await getDb();
  const rows = await db.select().from(cityPhotos).where(inArray(cityPhotos.cityKey, keys));
  for (const r of rows) if (r.url) out.set(r.cityKey, r);
  if (!hasUnsplashKey()) return out;

  const known = new Map(rows.map((r) => [r.cityKey, r]));
  const missing = keys.filter((k) => {
    const r = known.get(k);
    return !r || (!r.url && Date.now() - r.createdAt.getTime() > RETRY_MS);
  });
  for (const k of missing.slice(0, MAX_LOOKUPS)) {
    try {
      const city = findCityExact(k)?.city ?? cities.find((c) => keyOf(c) === k) ?? k;
      const hit = (await searchUnsplash(ICONIC[k] ?? `${city} landmark skyline`))[0] ?? (await searchUnsplash(`${city} city`))[0];
      const photo = hit ? await claimUnsplashPhoto(hit.id) : null;
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
