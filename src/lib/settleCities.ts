/**
 * Settle each place into an area (12 Oct 2026). Google gives every place its own town, so one
 * Comporta guide made four "cities" (Comporta, Grândola, Melides, Costa da Caparica) and Vancouver
 * split from North Vancouver. A place's `city` is now its area; the town Google gave stays in
 * `source_city` (and becomes the place's area line when it had none). Rules, in order:
 *
 * 1. Districts of a big city (Üsküdar → Istanbul): cities.ts, already applied by canonicalCity.
 * 2. The guide's city: a place in a guide (not My places) within GUIDE_KM of the guide's centre
 *    counts as the guide's city ("Shaz's Comporta guide" → all its nearby spots are Comporta).
 *    Never over a known city (CITIES), so Kyoto in an Osaka guide stays Kyoto.
 * 3. A town right next to a bigger one: a place within NEAR_KM of a known city's centre, or of a
 *    city with more spots on MyGuide, joins it (North Vancouver → Vancouver, Sparks → Reno).
 *
 * Runs for a guide whenever places go into it, and once over everything at startup (job
 * "settle-cities-v1"). Re-running is safe: it always starts again from source_city.
 */
import { eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { appJobs, guides, places } from "./db/schema";
import { CITIES, canonicalCity, findCityExact } from "./places/cities";
import { haversineMeters } from "./places/geo";
import { isStash } from "./stash";

const GUIDE_KM = 40;
const NEAR_KM = 12;
export const SETTLE_JOB = "settle-cities-v1";

type Row = {
  id: string;
  city: string;
  sourceCity: string;
  area: string;
  lat: number | null;
  lng: number | null;
  guide: { id: string; title: string; city: string; lat: number | null; lng: number | null; publishedAt: Date | null };
};

const key = (c: string) => canonicalCity(c).toLowerCase();
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Where each town on MyGuide is (median of its places) and how many places it has, from the towns Google gave. */
async function townStats(db: Db): Promise<Map<string, { name: string; lat: number; lng: number; n: number }>> {
  const rows = await db.select({ city: places.city, sourceCity: places.sourceCity, lat: places.lat, lng: places.lng }).from(places);
  const by = new Map<string, { name: string; lats: number[]; lngs: number[]; n: number }>();
  for (const r of rows) {
    const src = (r.sourceCity || r.city).trim();
    if (!src) continue;
    const k = key(src);
    const e = by.get(k) ?? { name: canonicalCity(src), lats: [], lngs: [], n: 0 };
    e.n++;
    if (r.lat != null && r.lng != null) {
      e.lats.push(r.lat);
      e.lngs.push(r.lng);
    }
    by.set(k, e);
  }
  const out = new Map<string, { name: string; lat: number; lng: number; n: number }>();
  for (const [k, e] of by) if (e.lats.length) out.set(k, { name: e.name, lat: median(e.lats), lng: median(e.lngs), n: e.n });
  return out;
}

/** The area a place belongs to (see the rules above). */
function settle(r: Row, stats: Awaited<ReturnType<typeof townStats>>): string {
  const src = (r.sourceCity || r.city).trim();
  if (!src) return r.city;
  const base = canonicalCity(src);
  if (r.lat == null || r.lng == null) return base;
  const here = { lat: r.lat, lng: r.lng };
  const knownBase = !!findCityExact(base);

  // 2. The guide's city.
  const g = r.guide;
  if (g.city.trim() && !isStash(g) && !knownBase) {
    const gc = canonicalCity(g.city);
    if (key(gc) !== key(base)) {
      const known = findCityExact(gc);
      const centre = g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng } : known ? { lat: known.lat, lng: known.lng } : stats.get(key(gc)) ?? null;
      if (centre && km(here, centre) <= GUIDE_KM) return gc;
    }
  }

  // 3. Right next to a known city, or to a town with more places.
  if (!knownBase) {
    const mine = stats.get(key(base))?.n ?? 0;
    let best: { name: string; d: number } | null = null;
    for (const c of CITIES) {
      if (key(c.city) === key(base)) continue;
      const d = km(here, c);
      if (d <= NEAR_KM && (!best || d < best.d)) best = { name: c.city, d };
    }
    if (!best) {
      for (const [k, t] of stats) {
        if (k === key(base) || t.n <= mine) continue;
        const d = km(here, t);
        if (d <= NEAR_KM && (!best || d < best.d)) best = { name: t.name, d };
      }
    }
    if (best) return best.name;
  }
  return base;
}

/** Settle these places (or every place when `placeIds` is undefined). Returns how many changed. */
async function settlePlaces(db: Db, where: { guideIds?: string[] } = {}): Promise<number> {
  if (where.guideIds && !where.guideIds.length) return 0;
  const stats = await townStats(db);
  const q = db
    .select({
      id: places.id,
      city: places.city,
      sourceCity: places.sourceCity,
      area: places.area,
      lat: places.lat,
      lng: places.lng,
      guide: { id: guides.id, title: guides.title, city: guides.city, lat: guides.lat, lng: guides.lng, publishedAt: guides.publishedAt },
    })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId));
  const rows: Row[] = await (where.guideIds ? q.where(inArray(places.guideId, where.guideIds)) : q);
  const updates = [];
  for (const r of rows) {
    const src = (r.sourceCity || r.city).trim();
    const city = settle(r, stats);
    const area = r.area.trim() || (src && src.toLowerCase() !== city.toLowerCase() ? src : "");
    if (city === r.city && src === r.sourceCity && area === r.area) continue;
    updates.push(db.update(places).set({ city, sourceCity: src, area }).where(eq(places.id, r.id)));
  }
  // In batches: one round trip each (the first run touches every place).
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    await db.batch(chunk as [(typeof chunk)[number], ...(typeof chunk)[number][]]);
  }
  return updates.length;
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
