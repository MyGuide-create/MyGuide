/**
 * Settle each place into an area (12 Oct 2026). Google gives every place its own town, so one
 * Comporta guide made four "cities" (Comporta, Grândola, Melides, Costa da Caparica) and Vancouver
 * split from North Vancouver. A place's `city` is now its area; the town Google gave stays in
 * `source_city` (and becomes the place's area line when it had none). Rules, in order:
 *
 * 0. Countries that are one area (Maldives, Seychelles, Mauritius, Malta…): the country. cities.ts COUNTRY_AREA.
 * 1. Districts of a big city (Üsküdar → Istanbul): cities.ts, already applied by canonicalCity.
 * 2. The guide's city: a place in a guide (not My places) within GUIDE_KM of the guide's centre
 *    counts as the guide's city ("Shaz's Comporta guide" → all its nearby spots are Comporta).
 *    Never over a known city (CITIES), so Kyoto in an Osaka guide stays Kyoto.
 * 3. A town near a bigger one: a place within NEAR_KM of a known city's centre, or of a town with
 *    more spots on MyGuide, in the same country, joins the nearest of them (North Vancouver → Vancouver,
 *    Ishøj → Copenhagen, Sintra → Lisbon). Hisham (13 Oct 2026): day-trip towns belong under the main city,
 *    with their own name as the area line. Known cities (CITIES) never join another.
 * 4. A lone town in a guide: a guide's place whose town has only a few spots on MyGuide (SMALL_TOWN) joins
 *    the guide's main city (the one most of its other places are in) within LONE_KM (Flúðir in an
 *    Iceland guide → Reykjavik).
 * Before all of these, Admin › Cities decisions (city_merges): a town merged into a city, or kept as its own.
 *
 * Runs for a guide whenever places go into it, and once over everything at startup (job
 * "settle-cities-v1"). Re-running is safe: it always starts again from source_city.
 */
import { eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { appJobs, cityMerges, guides, places } from "./db/schema";
import { CITIES, areaForCountry, canonicalCity, districtArea, findCityExact } from "./places/cities";
import { haversineMeters } from "./places/geo";
import { isStash } from "./stash";

const GUIDE_KM = 40;
/** v7: 40 km (was 12), so day-trip towns join (Ishøj 16 km, Sintra 25 km, Humlebæk 35 km). */
const NEAR_KM = 40;
/** v7: a town with this many spots or fewer is "lone" (rule 4, and Admin › Cities). */
export const SMALL_TOWN = 3;
/** v7: how far a lone town in a guide may be from the guide's main city (Flúðir is ~100 km from Reykjavik). */
export const LONE_KM = 150;
/** A guide centred on its own places is usually a region (The Cotswolds, Amalfi Coast): a wider reach. */
const REGION_KM = 80;
/**
 * v2: countries that are one area (Maldives…). v3: a place in its guide's own city stays there (live data had
 * Comporta spots pulled into Grândola because more spots were tagged Grândola). v4: English names for cities Google
 * gives in the local language (Genève → Geneva, Zürich, München). v5: a guide with no centre (The Cotswolds)
 * is centred on its places, so its villages count as its area. v6: Greater Copenhagen's areas and suburbs
 * (Ishøj, Frederiksberg, Hellerup, up the coast to Humlebæk) settle into Copenhagen. v7: towns within 40 km (same
 * country) join, lone towns in a guide follow its main city, Admin › Cities merges. v8: Cincinnati is a known city, so
 * spots Google filed under a county (Son of a Butcher, "Butler County") settle into it. Each bump re-runs over everything.
 */
export const SETTLE_JOB = "settle-cities-v8";

type Row = {
  id: string;
  city: string;
  sourceCity: string;
  country: string;
  area: string;
  lat: number | null;
  lng: number | null;
  guide: { id: string; title: string; city: string; lat: number | null; lng: number | null; publishedAt: Date | null; region?: boolean };
};

const key = (c: string) => canonicalCity(c).toLowerCase();
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * "Genève" for Geneva: the same name in another language or spelling, not a district or
 * neighbourhood alias (a guide titled for "Shoreditch" keeps its own city name).
 */
function isLocalName(name: string, city: string): boolean {
  const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (name.trim() === city) return false;
  // Same name with accents or case ("Zürich", "geneva"), or a name in another language ("Genève", "Genf").
  return plain(name) === plain(city) || LOCAL_NAMES.has(plain(name));
}
/** Local-language and alternative spellings of whole cities (not districts). */
const LOCAL_NAMES = new Set(
  ["geneve", "genf", "ginevra", "zurich", "zuerich", "luzern", "bale", "berne", "munchen", "muenchen", "koln", "koeln", "venezia", "torino", "sevilla", "brugge", "antwerpen", "anvers", "gent", "gand", "den haag", "'s-gravenhage", "goteborg", "krakow", "warszawa", "lisboa", "roma", "firenze", "milano", "wien", "praha", "kobenhavn", "napoli"],
);

/** Where each town on MyGuide is (median of its places) and how many places it has, from the towns Google gave. */
export type TownStats = Map<string, { name: string; lat: number; lng: number; n: number; country: string }>;

export async function townStats(db: Db): Promise<TownStats> {
  const rows = await db.select({ city: places.city, sourceCity: places.sourceCity, lat: places.lat, lng: places.lng, country: places.country }).from(places);
  const by = new Map<string, { name: string; lats: number[]; lngs: number[]; n: number; countries: Map<string, number> }>();
  // Counted by area (the settled city), so a town Google uses a lot inside a guide's area
  // (Grândola, around Comporta) doesn't outweigh the area itself.
  for (const r of rows) {
    const src = (r.city || r.sourceCity).trim();
    if (!src) continue;
    const k = key(src);
    const e = by.get(k) ?? { name: canonicalCity(src), lats: [], lngs: [], n: 0, countries: new Map<string, number>() };
    e.n++;
    const cn = (r.country ?? "").trim();
    if (cn) e.countries.set(cn, (e.countries.get(cn) ?? 0) + 1);
    if (r.lat != null && r.lng != null) {
      e.lats.push(r.lat);
      e.lngs.push(r.lng);
    }
    by.set(k, e);
  }
  const out: TownStats = new Map();
  for (const [k, e] of by) {
    const country = [...e.countries].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    if (e.lats.length) out.set(k, { name: e.name, lat: median(e.lats), lng: median(e.lngs), n: e.n, country });
  }
  return out;
}

const countryKey = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();
/** Same country, or one of them unknown. */
const sameCountry = (a: string | null | undefined, b: string | null | undefined) => !countryKey(a) || !countryKey(b) || countryKey(a) === countryKey(b);

/**
 * The nearest known city, or town with more places on MyGuide, within `maxKm` of `here` and in the same
 * country (Malmö is 28 km from Copenhagen but in Sweden). Not `base` itself.
 */
export function nearestBigger(base: string, here: { lat: number; lng: number }, country: string, stats: TownStats, maxKm: number): { name: string; d: number } | null {
  const mine = stats.get(key(base))?.n ?? 0;
  let best: { name: string; d: number } | null = null;
  for (const c of CITIES) {
    if (key(c.city) === key(base) || !sameCountry(c.country, country) || areaForCountry(c.country)) continue;
    const d = km(here, c);
    if (d <= maxKm && (!best || d < best.d)) best = { name: c.city, d };
  }
  for (const [k, t] of stats) {
    // Known cities are measured from their real centre (above), not the middle of their spots, which
    // drifts out to the suburbs and day trips that joined them.
    if (k === key(base) || t.n <= mine || !sameCountry(t.country, country) || findCityExact(t.name)) continue;
    const d = km(here, t);
    if (d <= maxKm && (!best || d < best.d)) best = { name: t.name, d };
  }
  return best;
}

/** The area a place belongs to (see the rules above). */
function settle(r: Row, stats: TownStats, merges: Map<string, string>): string {
  const src = (r.sourceCity || r.city).trim();
  // 0. Countries that are one area: every atoll, island and resort in the Maldives is "Maldives".
  const whole = areaForCountry(r.country);
  if (whole) return whole;
  if (!src) return r.city;
  const base = canonicalCity(src);
  // Admin › Cities: merged into a city, or kept as its own ("").
  const decided = merges.get(key(base));
  if (decided !== undefined) return decided || base;
  if (r.lat == null || r.lng == null) return base;
  const here = { lat: r.lat, lng: r.lng };
  const knownBase = !!findCityExact(base);

  // 2. The guide's city.
  const g = r.guide;
  if (g.city.trim() && !isStash(g) && !knownBase) {
    const gc = canonicalCity(g.city);
    // Already the guide's own city: it stays (a bigger neighbour mustn't pull Comporta into Grândola).
    if (key(gc) === key(base)) return base;
    {
      const known = findCityExact(gc);
      const centre = g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng } : known ? { lat: known.lat, lng: known.lng } : stats.get(key(gc)) ?? null;
      if (centre && km(here, centre) <= (g.region ? REGION_KM : GUIDE_KM)) return gc;
    }
  }

  // 3. Near a known city, or a town with more places, in the same country: the nearest of them.
  if (!knownBase) {
    const best = nearestBigger(base, here, r.country, stats, NEAR_KM);
    if (best) return best.name;
  }
  return base;
}

/** Settle these places (or every place when `placeIds` is undefined). Returns how many changed. */
async function settlePlaces(db: Db, where: { guideIds?: string[] } = {}): Promise<number> {
  if (where.guideIds && !where.guideIds.length) return 0;
  const stats = await townStats(db);
  const merges = await loadMerges(db);
  const q = db
    .select({
      id: places.id,
      city: places.city,
      sourceCity: places.sourceCity,
      country: places.country,
      area: places.area,
      lat: places.lat,
      lng: places.lng,
      guide: { id: guides.id, title: guides.title, city: guides.city, lat: guides.lat, lng: guides.lng, publishedAt: guides.publishedAt },
    })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId));
  const rows: Row[] = await (where.guideIds ? q.where(inArray(places.guideId, where.guideIds)) : q);
  // A guide with no centre of its own ("The Cotswolds": not a known city, no pin) is centred on the
  // middle of its places, so its villages count as the guide's area (v5).
  const byGuide = new Map<string, { lats: number[]; lngs: number[] }>();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const e = byGuide.get(r.guide.id) ?? { lats: [], lngs: [] };
    e.lats.push(r.lat);
    e.lngs.push(r.lng);
    byGuide.set(r.guide.id, e);
  }
  for (const r of rows) {
    const e = byGuide.get(r.guide.id);
    if (r.guide.lat == null && e && !findCityExact(r.guide.city)) r.guide = { ...r.guide, lat: median(e.lats), lng: median(e.lngs), region: true };
  }
  const settled = new Map(rows.map((r) => [r.id, settle(r, stats, merges)]));
  // 4. A lone town in a guide follows the guide's main city (most of its other places), within LONE_KM.
  const byGuideCity = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const c = settled.get(r.id)!;
    const m = byGuideCity.get(r.guide.id) ?? new Map<string, number>();
    m.set(c, (m.get(c) ?? 0) + 1);
    byGuideCity.set(r.guide.id, m);
  }
  for (const r of rows) {
    const c = settled.get(r.id)!;
    if (isStash(r.guide) || r.lat == null || r.lng == null || findCityExact(c) || merges.has(key(c))) continue;
    if ((stats.get(key(c))?.n ?? 0) > SMALL_TOWN) continue;
    const main = [...(byGuideCity.get(r.guide.id) ?? [])].filter(([name]) => key(name) !== key(c)).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!main) continue;
    const known = findCityExact(main);
    const centre = known ?? stats.get(key(main));
    if (!centre || !sameCountry(known?.country ?? stats.get(key(main))?.country, r.country)) continue;
    if (km({ lat: r.lat, lng: r.lng }, centre) <= LONE_KM) settled.set(r.id, main);
  }
  const updates = [];
  for (const r of rows) {
    const src = (r.sourceCity || r.city).trim();
    const city = settled.get(r.id)!;
    // The area line shows the town when it differs from the area; never the area's own name again.
    // "Genève" is just Geneva's local name, not an area within it.
    let area = r.area.trim() || (src && src.toLowerCase() !== city.toLowerCase() && !isLocalName(src, city) ? src : "");
    if (area.toLowerCase() === city.toLowerCase() || isLocalName(area, city)) area = "";
    // "København K" → no area, "Frederiksberg C" → Frederiksberg (v6).
    if (area) area = districtArea(area, city);
    if (city === r.city && src === r.sourceCity && area === r.area) continue;
    updates.push(db.update(places).set({ city, sourceCity: src, area }).where(eq(places.id, r.id)));
  }
  // Guides in a one-area country ("Baa Atoll" guide in the Maldives) take the area as their city too.
  const gq = db.select({ id: guides.id, city: guides.city, country: guides.country }).from(guides);
  for (const g of await (where.guideIds ? gq.where(inArray(guides.id, where.guideIds)) : gq)) {
    const whole = areaForCountry(g.country);
    // A known city under its local name ("Genève") takes the English one, like its places.
    const named = g.city.trim() ? findCityExact(g.city)?.city : undefined;
    const city = whole ?? (named && isLocalName(g.city, named) ? named : null);
    if (city && g.city !== city) updates.push(db.update(guides).set({ city }).where(eq(guides.id, g.id)));
  }
  // In batches: one round trip each (the first run touches every place).
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    await db.batch(chunk as [(typeof chunk)[number], ...(typeof chunk)[number][]]);
  }
  return updates.length;
}

/** Admin › Cities decisions, by the town's key: the city it joins, or "" to keep it as its own. */
export async function loadMerges(db: Db): Promise<Map<string, string>> {
  const rows = await db.select().from(cityMerges);
  return new Map(rows.map((m) => [key(m.town), m.into]));
}

/** Admin › Cities: after a merge (or keep), settle everything again. Returns how many places changed. */
export async function resettleAll(db: Db): Promise<number> {
  return settlePlaces(db);
}

/** After places go into these guides (or a guide's city changes): settle their places. Never throws. */
export async function settleGuides(db: Db, guideIds: string[]): Promise<void> {
  try {
    await settlePlaces(db, { guideIds: [...new Set(guideIds.filter(Boolean))] });
  } catch (e) {
    console.warn("[settleCities]", e);
  }
}

/** Startup: settle every place once per database (job "settle-cities-v1"). */
export async function settleAllOnce(db: Db): Promise<void> {
  try {
    const done = await db.select().from(appJobs).where(eq(appJobs.name, SETTLE_JOB));
    if (done.length) return;
    const n = await settlePlaces(db);
    await db.insert(appJobs).values({ name: SETTLE_JOB, doneAt: new Date() }).onConflictDoNothing();
    console.log(`[settleCities] settled ${n} places`);
  } catch (e) {
    console.warn("[settleCities] startup job failed", e);
  }
}
