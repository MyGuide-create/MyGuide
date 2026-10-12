/**
 * Data for the admin-only preview of the city-first Home (/home-v2) and city page (/city-v2).
 * Nothing here changes stored data; it only reads and groups what's already there.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, notifications, places, savedGuides, savedPlaces, trips, type Trip } from "./db/schema";
import { friendCities, friendsActivity, loadRecommendations, spotKey, type ActivityItem, type Recommendation } from "./citySpots";
import { listFeed, type GuideCard } from "./guides";
import { listAllWishes, type CityWishes } from "./wishes";
import { capRuns } from "./fill";
import { canonicalCity, cityNameVariants, findCityExact } from "./places/cities";

/** Grouping key: "Dubai Marina", "dubai " and "Dubai" are one city. */
export const cityKey = (city: string) => canonicalCity(city).toLowerCase();
const key = cityKey;

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
  /** Distinct spots recommended here (published guides and places recommended on their own) that the viewer can see. */
  spots: number;
  /** Distinct people the viewer follows with a guide here. */
  friends: number;
  /** Best-ranked guide with a photo (else the best-ranked guide): its cover stands for the city. */
  cover: GuideCard;
}

/** Every city with a public guide the viewer can see, split into ones friends know and the rest. */
export async function cityTiles(viewerId: string | null | undefined): Promise<{ friendCities: CityTile[]; moreCities: CityTile[]; byCity: Map<string, CityTile> }> {
  const [cards, followed, recs] = await Promise.all([listFeed({ viewerId, limit: 300 }), followedIds(viewerId), loadRecommendations({ viewerId })]);
  const spotsBy = new Map<string, Set<string>>();
  for (const r of recs) {
    if (!r.city) continue;
    const k = key(r.city);
    const set = spotsBy.get(k) ?? new Set<string>();
    set.add(spotKey(r.place));
    spotsBy.set(k, set);
  }
  const groups = new Map<string, { tile: CityTile; owners: Set<string> }>();
  for (const c of cards) {
    if (!c.guide.city.trim()) continue;
    const city = canonicalCity(c.guide.city);
    const k = key(city);
    let g = groups.get(k);
    if (!g) {
      g = { tile: { city, country: findCityExact(city)?.country ?? c.guide.country, guides: 0, spots: spotsBy.get(k)?.size ?? 0, friends: 0, cover: c }, owners: new Set() };
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
  const moreCities = tiles.filter((t) => t.friends === 0).sort((a, b) => b.spots - a.spots || b.guides - a.guides);
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
  /** Spots the viewer recommends there (for "Send your spots"). */
  viewerSpots: number;
}

async function viewerPlaceCounts(viewerId: string, cities: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!cities.length) return out;
  const db = await getDb();
  const keys = [...new Set(cities.flatMap(cityNameVariants))];
  const own = await db
    .select({ city: sql<string>`lower(trim(${guides.city}))`, n: sql<number>`count(*)` })
    .from(places)
    .innerJoin(guides, eq(places.guideId, guides.id))
    .where(and(eq(guides.ownerId, viewerId), inArray(sql`lower(trim(${guides.city}))`, keys)))
    .groupBy(sql`lower(trim(${guides.city}))`);
  const saved = await db
    .select({ city: sql<string>`lower(trim(${guides.city}))`, n: sql<number>`count(*)` })
    .from(savedPlaces)
    .innerJoin(places, eq(savedPlaces.placeId, places.id))
    .innerJoin(guides, eq(places.guideId, guides.id))
    .where(and(eq(savedPlaces.userId, viewerId), inArray(sql`lower(trim(${guides.city}))`, keys)))
    .groupBy(sql`lower(trim(${guides.city}))`);
  for (const r of [...own, ...saved]) out.set(key(r.city), (out.get(key(r.city)) ?? 0) + Number(r.n));
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
  // The viewer's recommended spots per city, and who they've already sent spots to.
  const spotCounts = new Map<string, number>();
  const sentSpots = new Set<string>();
  if (viewerId) {
    for (const c of await friendCities(viewerId, await loadRecommendations({ viewerId, ownerIds: [viewerId] }))) spotCounts.set(key(c.city), c.spots);
    const db = await getDb();
    const sent = await db.select({ userId: notifications.userId, city: notifications.city }).from(notifications).where(and(eq(notifications.actorId, viewerId), eq(notifications.type, "spots_sent")));
    for (const n of sent) sentSpots.add(`${n.userId}|${key(n.city ?? "")}`);
  }
  const all: WantedCity[] = groups
    .map((g) => {
      // Open wishes only: not the viewer's own, and nobody has sent a guide for it yet
      // (the viewer's own sends included). Granted wishes stay on /wishes and profiles.
      const others = g.people.filter((p) => !p.isViewer && p.viewerSent.length === 0 && p.granted.length === 0 && !sentSpots.has(`${p.user.id}|${key(g.city)}`));
      const firstOther = others[0];
      return {
        group: g,
        others,
        known: others.filter((p) => known.has(p.user.id)),
        viewerPlaces: counts.get(key(g.city)) ?? 0,
        viewerGuides: firstOther?.viewerGuides ?? [],
        viewerSpots: spotCounts.get(key(g.city)) ?? 0,
      };
    })
    .filter((w) => w.others.length > 0);
  const help =
    all
      .filter((w) => w.known.length > 0 && (w.viewerSpots > 0 || w.viewerPlaces > 0 || w.viewerGuides.length > 0))
      .sort((a, b) => b.viewerSpots - a.viewerSpots || b.known.length - a.known.length || b.viewerPlaces - a.viewerPlaces)[0] ?? null;
  // Friends' wishes first, then other people's where the viewer has spots ("you recommend 4 there"),
  // then everyone else's open wishes; never more than 2 in a row from the same person.
  const tier = (w: WantedCity) => (w.known.length > 0 ? 0 : w.viewerSpots > 0 ? 1 : 2);
  const ordered = all.filter((w) => w !== help).map((w, i) => ({ w, i })).sort((a, b) => tier(a.w) - tier(b.w) || a.i - b.i).map((x) => x.w);
  const list = capRuns(ordered, (w) => (w.known[0] ?? w.others[0]).user.id).slice(0, limit);
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

export type FeedEntry = ActivityItem | { kind: "guide"; at: Date; card: GuideCard };

/** Home's "New from friends": spots they recommend, spots several now share, and guides they published, newest first. */
export function homeFeed(recs: Recommendation[], followingGuides: GuideCard[], days = 45): FeedEntry[] {
  const since = Date.now() - days * 86_400_000;
  return [
    ...friendsActivity(recs, { days }),
    ...followingGuides
      .filter((g) => g.guide.publishedAt && g.guide.publishedAt.getTime() >= since)
      .map((card) => ({ kind: "guide" as const, at: card.guide.publishedAt!, card })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

/**
 * Home's "New on MyGuide": everyone else's recent recommended spots and published guides (not
 * yours, not people you follow — those are "New from friends"), last `days` days. Ranked by recency
 * and quality: guides by their feed rank (feedScore), spots by how many people recommend them.
 * Same visibility rules as everywhere: blocks, private accounts, never private places or drafts.
 */
export async function everyoneFeed(viewerId: string | null | undefined, exclude: Set<string>, opts: { days?: number; limit?: number } = {}): Promise<FeedEntry[]> {
  const days = opts.days ?? 30;
  const since = Date.now() - days * 86_400_000;
  const [recs, guidesPool] = await Promise.all([loadRecommendations({ viewerId }), listFeed({ viewerId, scope: "public", limit: 80 })]);
  // How many people recommend each spot (all of MyGuide), for the spots' quality.
  const people = new Map<string, Set<string>>();
  for (const r of recs) {
    const k = spotKey(r.place);
    const set = people.get(k) ?? new Set<string>();
    set.add(r.owner.id);
    people.set(k, set);
  }
  const theirs = recs.filter((r) => !exclude.has(r.owner.id) && r.at.getTime() >= since);
  const spotItems = friendsActivity(theirs, { days }).filter((f): f is ActivityItem & { kind: "spots" } => f.kind === "spots");
  const freshGuides = guidesPool.filter((g) => !exclude.has(g.owner.id) && g.guide.publishedAt && g.guide.publishedAt.getTime() >= since);
  const recency = (at: Date) => Math.max(0, 1 - (Date.now() - at.getTime()) / (days * 86_400_000));
  const scored: Array<{ e: FeedEntry; score: number; owner: string }> = [
    ...spotItems.map((f) => {
      const top = Math.max(...f.recs.map((r) => people.get(spotKey(r.place))?.size ?? 1));
      const quality = Math.min(1, (top - 1) / 3 + Math.min(f.recs.length, 5) * 0.06);
      return { e: f as FeedEntry, score: 0.6 * recency(f.at) + 0.4 * quality, owner: f.user.id };
    }),
    // listFeed is already ranked by feedScore (quality + freshness): earlier = better.
    ...freshGuides.map((card, i) => ({
      e: { kind: "guide" as const, at: card.guide.publishedAt!, card },
      score: 0.6 * recency(card.guide.publishedAt!) + 0.4 * (1 - i / Math.max(1, freshGuides.length)),
      owner: card.owner.id,
    })),
  ];
  scored.sort((a, b) => b.score - a.score);
  return capRuns(scored, (x) => x.owner).slice(0, opts.limit ?? 15).map((x) => x.e);
}

/** Who an entry on Home is from (for "max 2 in a row" and the Follow button). */
export function feedOwner(f: FeedEntry): string {
  if (f.kind === "guide") return f.card.owner.id;
  if (f.kind === "overlap") return `overlap:${f.spot.key}`;
  return f.user.id;
}
