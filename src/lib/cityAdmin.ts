import { desc, inArray, sql } from "drizzle-orm";
import type { Db } from "./db";
import { cityMerges, guides, places } from "./db/schema";
import { areaForCountry, findCityExact } from "./places/cities";
import { LONE_KM, SMALL_TOWN, loadMerges, nearestBigger, townStats } from "./settleCities";

export type LoneCity = {
  town: string;
  country: string;
  spots: number;
  /** Example places and the guides they're in. */
  samples: { name: string; guide: string }[];
  /** The nearest bigger city in the same country within LONE_KM, if any. */
  suggest: { name: string; km: number } | null;
};

/**
 * Admin › Cities (13 Oct 2026): cities on MyGuide with only a few spots (SMALL_TOWN) that aren't known
 * cities, and the bigger city each could join. The settle rules catch most of these; this lists what's left
 * so a merge is one tap. Towns already decided (merged or kept) aren't listed.
 */
export async function loneCities(db: Db): Promise<LoneCity[]> {
  const [stats, merges] = await Promise.all([townStats(db), loadMerges(db)]);
  const lone = [...stats.values()].filter(
    (t) => t.n <= SMALL_TOWN && !findCityExact(t.name) && !areaForCountry(t.country) && !merges.has(t.name.trim().toLowerCase()),
  );
  if (!lone.length) return [];
  const names = lone.map((t) => t.name.toLowerCase());
  const rows = await db
    .select({ city: places.city, name: places.name, guide: guides.title })
    .from(places)
    .innerJoin(guides, sql`${guides.id} = ${places.guideId}`)
    .where(inArray(sql`lower(trim(${places.city}))`, names))
    .limit(500);
  const samples = new Map<string, { name: string; guide: string }[]>();
  for (const r of rows) {
    const k = r.city.trim().toLowerCase();
    const list = samples.get(k) ?? [];
    if (list.length < 3) list.push({ name: r.name, guide: r.guide });
    samples.set(k, list);
  }
  return lone
    .map((t) => {
      const near = nearestBigger(t.name, t, t.country, stats, LONE_KM);
      return {
        town: t.name,
        country: t.country,
        spots: t.n,
        samples: samples.get(t.name.toLowerCase()) ?? [],
        suggest: near ? { name: near.name, km: Math.round(near.d) } : null,
      };
    })
    .sort((a, b) => Number(!a.suggest) - Number(!b.suggest) || (a.suggest?.km ?? 0) - (b.suggest?.km ?? 0) || a.town.localeCompare(b.town));
}

/** Decisions already made in Admin › Cities, newest first. */
export async function cityDecisions(db: Db) {
  return db.select().from(cityMerges).orderBy(desc(cityMerges.createdAt));
}
