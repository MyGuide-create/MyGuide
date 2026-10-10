/**
 * Data for the admin-only preview of the city-first Home (/home-v2) and city page (/city-v2).
 * Nothing here changes stored data; it only reads and groups what's already there.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, places, savedGuides, savedPlaces, trips, type Trip } from "./db/schema";
import { listFeed, type GuideCard } from "./guides";
import { listAllWishes, type CityWishes } from "./wishes";

const key = (city: string) => city.trim().toLowerCase();

/** People the viewer follows (accepted). */
export async function followedIds(viewerId: string | null | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const db = await getDb();
  const rows = await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted")));
  return new Set(rows.map((r) => r.id));
}

/** People the viewer knows: follows them or is followed by them (accepted). */
async function knownIds(viewerId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db
    .select({ a: follows.followerId, b: follows.followingId })
    .from(follows)
    .where(and(eq(follows.status, "accepted"), or(eq(follows.followerId, viewerId), eq(follows.followingId, viewerId))));
  const out = new Set<string>();
  for (const r of rows) out.add(r.a === viewerId ? r.b : r.a);
  return out;
}

export interface CityTile {
  city: string;
  country: string;
  guides: number;
  /** Distinct people the viewer follows with a guide here. */
  friends: number;
  /** Best-ranked guide with a photo (else the best-ranked guide): its cover stands for the city. */
  cover: GuideCard;
}

/** Every city with a public guide the viewer can see, split into ones friends know and the rest. */
export async function cityTiles(viewerId: string | null | undefined): Promise<{ friendCities: CityTile[]; moreCities: CityTile[]; byCity: Map<string, CityTile> }> {
  const [cards, followed] = await Promise.all([listFeed({ viewerId, limit: 300 }), followedIds(viewerId)]);
  const groups = new Map<string, { tile: CityTile; owners: Set<string> }>();
  for (const c of cards) {
    const city = c.guide.city.trim();
    if (!city) continue;
    const k = key(city);
    let g = groups.get(k);
    if (!g) {
      g = { tile: { city, country: c.guide.country, guides: 0, friends: 0, cover: c }, owners: new Set() };
      groups.set(k, g);
    }
    g.tile.guides++;
    if (!g.tile.country && c.guide.country) g.tile.country = c.guide.country;
    if (followed.has(c.owner.id)) g.owners.add(c.owner.id);
    const hasPhoto = (x: GuideCard) => !!(x.guide.coverMediaId || x.guide.coverUrl);
    if (!hasPhoto(g.tile.cover) && hasPhoto(c)) g.tile.cover = c;
  }
  const tiles = [...groups.values()].map((g) => ({ ...g.tile, friends: g.owners.size }));
  const byCity = new Map(tiles.map((t) => [key(t.city), t]));
  const friendCities = tiles.filter((t) => t.friends > 0).sort((a, b) => b.friends - a.friends || b.guides - a.guides);
  const moreCities = tiles.filter((t) => t.friends === 0).sort((a, b) => b.guides - a.guides);
  return { friendCities, moreCities, byCity };
}

/**
 * The trip to show on Home: only trips the person chose to plan (Plan a trip), never ones created
 * behind the scenes by "Add to my guide". Soonest upcoming dated trip, else the newest undated one.
 */
export async function nextTrip(userId: string): Promise<{ trip: Trip; daysAway: number | null } | null> {
  const db = await getDb();
  const mine = await db.select().from(trips).where(and(eq(trips.userId, userId), eq(trips.planned, true))).orderBy(desc(trips.createdAt));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = mine
    .filter((t) => t.startDate && (t.endDate ?? t.startDate) >= today)
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
  if (upcoming.length) {
    const t = upcoming[0];
    const days = Math.round((Date.parse(t.startDate!) - Date.parse(today)) / 86_400_000);
    return { trip: t, daysAway: days };
  }
  const recent = mine.find((t) => !t.startDate);
  return recent ? { trip: recent, daysAway: null } : null;
}

export interface WantedCity {
  group: CityWishes;
  /** Wishes from other people (not the viewer). */
  others: CityWishes["people"];
  /** Of those, people the viewer knows. */
  known: CityWishes["people"];
  /** Places the viewer has there: in their own guides plus saved places. */
  viewerPlaces: number;
  /** The viewer's published guides to this city (for "Send my guide"). */
  viewerGuides: Array<{ id: string; slug: string; title: string }>;
}

async function viewerPlaceCounts(viewerId: string, cities: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!cities.length) return out;
  const db = await getDb();
  const keys = cities.map(key);
  const own = await db
    .select({ city: sql<string>`lower(${guides.city})`, n: sql<number>`count(*)` })
    .from(places)
    .innerJoin(guides, eq(places.guideId, guides.id))
    .where(and(eq(guides.ownerId, viewerId), inArray(sql`lower(${guides.city})`, keys)))
    .groupBy(sql`lower(${guides.city})`);
  const saved = await db
    .select({ city: sql<string>`lower(${guides.city})`, n: sql<number>`count(*)` })
    .from(savedPlaces)
    .innerJoin(places, eq(savedPlaces.placeId, places.id))
    .innerJoin(guides, eq(places.guideId, guides.id))
    .where(and(eq(savedPlaces.userId, viewerId), inArray(sql`lower(${guides.city})`, keys)))
    .groupBy(sql`lower(${guides.city})`);
  for (const r of [...own, ...saved]) out.set(r.city, (out.get(r.city) ?? 0) + Number(r.n));
  return out;
}

/**
 * Cities other people want guides for. `help` is the one the viewer is best placed to make:
 * someone they know wants it and they already have places there.
 */
export async function wantedGuides(viewerId: string | null | undefined, limit = 3): Promise<{ help: WantedCity | null; list: WantedCity[] }> {
  const groups = await listAllWishes(viewerId);
  const known = viewerId ? await knownIds(viewerId) : new Set<string>();
  const counts = viewerId ? await viewerPlaceCounts(viewerId, groups.map((g) => g.city)) : new Map<string, number>();
  const all: WantedCity[] = groups
    .map((g) => {
      const others = g.people.filter((p) => !p.isViewer);
      const firstOther = others[0];
      return {
        group: g,
        others,
        known: others.filter((p) => known.has(p.user.id)),
        viewerPlaces: counts.get(key(g.city)) ?? 0,
        viewerGuides: firstOther?.viewerGuides ?? [],
      };
    })
    .filter((w) => w.others.length > 0);
  const help =
    all
      .filter((w) => w.known.length > 0 && (w.viewerPlaces > 0 || w.viewerGuides.length > 0))
      .sort((a, b) => b.known.length - a.known.length || b.viewerPlaces - a.viewerPlaces)[0] ?? null;
  const list = all.filter((w) => w !== help).slice(0, limit);
  return { help, list };
}

/** How many people saved each guide. */
export async function guideSaveCounts(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const db = await getDb();
  const rows = await db
    .select({ id: savedGuides.guideId, n: sql<number>`count(*)` })
    .from(savedGuides)
    .where(inArray(savedGuides.guideId, ids))
    .groupBy(savedGuides.guideId);
  for (const r of rows) out.set(r.id, Number(r.n));
  return out;
}

/** "Sam and Lina", "Sam, Lina and 2 others". */
export function nameList(names: string[]): string {
  const first = names.map((n) => n.split(" ")[0]);
  if (first.length <= 1) return first[0] ?? "";
  if (first.length === 2) return `${first[0]} and ${first[1]}`;
  if (first.length === 3) return `${first[0]}, ${first[1]} and ${first[2]}`;
  return `${first[0]}, ${first[1]} and ${first.length - 2} others`;
}
