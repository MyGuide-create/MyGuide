/**
 * Recommendations, places first. "Friends' spots" for the city page: every place from published guides in a city (plus places people
 * recommended on their own from My places), merged so the
 * same spot added by several people shows once, with who recommends it and their tip.
 * Reads only; nothing here changes stored data.
 */
import { and, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, placeTips, places, users, type Place } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import { hiddenUserIds } from "./blocks";
import { canonicalCity, cityNameVariants } from "./places/cities";

const sameCity = (a: string, b: string) => canonicalCity(a).toLowerCase() === canonicalCity(b).toLowerCase();

export interface SpotRecommender {
  user: PublicUser;
  placeId: string;
  guideSlug: string;
  guideTitle: string;
  /** Their own words about the place: their description, else their first tip. "" when none. */
  tip: string;
  addedAt: Date;
  /** The viewer's own place that nobody else can see (draft/private guide, unshared Saved place). */
  isPrivate?: boolean;
}

export interface CitySpot {
  key: string;
  place: Place;
  recommenders: SpotRecommender[];
}

/** Same spot across guides: Google place id, else name + location (~100 m), else name. */
export function spotKey(p: Pick<Place, "googlePlaceId" | "name" | "lat" | "lng">): string {
  if (p.googlePlaceId) return `g:${p.googlePlaceId}`;
  const name = p.name.trim().toLowerCase().replace(/\s+/g, " ");
  if (p.lat != null && p.lng != null) return `n:${name}@${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  return `n:${name}`;
}

const clip = (s: string, n = 140) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** People the viewer follows (accepted only). */
export async function acceptedFollowingIds(viewerId: string | null | undefined): Promise<string[]> {
  if (!viewerId) return [];
  const db = await getDb();
  const rows = await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted")));
  return rows.map((r) => r.id);
}

/** One person's recommendation of one place, as stored (before merging by spot). */
export interface Recommendation {
  place: Place;
  guide: { id: string; slug: string; title: string; city: string; country: string; publishedAt: Date | null };
  owner: PublicUser;
  /** Their own words: description, else first tip. */
  tip: string;
  /** When it became a recommendation: shared from My places, else added. */
  at: Date;
  /** The spot's city, tidied ("Lisboa" → Lisbon); "" when unknown. */
  city: string;
  /** The viewer's own place that only they can see. */
  isPrivate?: boolean;
}

/**
 * Places people recommend: in a public, published guide, or shared on their own from Saved
 * places. Filtered for blocks and private accounts; places copied from someone else (or in a
 * copied guide) only count once the person adds their own words. Optional `city` / `ownerIds`.
 */
export async function loadRecommendations(opts: { viewerId?: string | null; ownerIds?: string[]; city?: string }): Promise<Recommendation[]> {
  const { viewerId, ownerIds, city } = opts;
  if (ownerIds && !ownerIds.length) return [];
  const db = await getDb();
  const conds: SQL[] = [or(and(eq(guides.visibility, "public"), isNotNull(guides.publishedAt)), isNotNull(places.sharedAt))!];
  if (city) {
    const variants = cityNameVariants(city);
    conds.push(or(inArray(sql`lower(trim(${places.city}))`, variants), inArray(sql`lower(trim(${guides.city}))`, variants))!);
  }
  if (ownerIds) conds.push(inArray(guides.ownerId, ownerIds));
  const rows = await db
    .select({
      place: places,
      guide: { id: guides.id, slug: guides.slug, title: guides.title, city: guides.city, country: guides.country, publishedAt: guides.publishedAt, forkedFrom: guides.forkedFromGuideId },
      owner: users,
    })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .innerJoin(users, eq(users.id, guides.ownerId))
    .where(and(...conds))
    .limit(5000);

  const hidden = await hiddenUserIds(viewerId);
  const followed = ownerIds ? new Set(ownerIds) : new Set(await acceptedFollowingIds(viewerId));
  const visible = rows.filter(
    (r) =>
      !hidden.has(r.owner.id) &&
      // A day trip in a Lisbon guide (place city Sintra) isn't a Lisbon spot.
      (!city || r.place.city.trim() === "" || sameCity(r.place.city, city)) &&
      (r.owner.profileVisibility !== "private" || r.owner.id === viewerId || followed.has(r.owner.id)),
  );

  const ids = visible.map((r) => r.place.id);
  const firstTip = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const tips = await db.select({ placeId: placeTips.placeId, body: placeTips.body, position: placeTips.position }).from(placeTips).where(inArray(placeTips.placeId, chunk));
    tips.sort((a, b) => a.position - b.position);
    for (const t of tips) if (!firstTip.has(t.placeId) && t.body.trim()) firstTip.set(t.placeId, t.body);
  }

  const out: Recommendation[] = [];
  for (const r of visible) {
    // Their own words only: a note written by someone else (a copied or forked place) isn't theirs.
    const notTheirs = (r.place.noteAuthorId && r.place.noteAuthorId !== r.owner.id) || (r.place.sourcePlaceId && r.place.noteAuthorId !== r.owner.id);
    const tip = clip((notTheirs ? "" : r.place.note) || firstTip.get(r.place.id) || "");
    // Picked/copied from someone else (or in a copied guide): "want to try", not a recommendation,
    // until they add words of their own.
    if ((r.place.sourcePlaceId || r.guide.forkedFrom) && !tip) continue;
    const rawCity = r.place.city.trim() || r.guide.city.trim();
    const { forkedFrom: _f, ...guide } = r.guide;
    void _f;
    out.push({ place: r.place, guide, owner: toPublicUser(r.owner), tip, at: r.place.sharedAt ?? r.place.createdAt, city: rawCity ? canonicalCity(rawCity) : "" });
  }
  return out;
}

/**
 * Every place the viewer has in `city` — published, draft and private guides and all of Saved
 * places — so their own spots sit with their friends' on the city page and map. Only ever shown
 * to the viewer; `isPrivate` marks the ones nobody else can see.
 */
export async function loadOwnPlaces(viewerId: string, city: string): Promise<Recommendation[]> {
  const db = await getDb();
  const variants = cityNameVariants(city);
  const rows = await db
    .select({ place: places, guide: { id: guides.id, slug: guides.slug, title: guides.title, city: guides.city, country: guides.country, publishedAt: guides.publishedAt, visibility: guides.visibility }, owner: users })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .innerJoin(users, eq(users.id, guides.ownerId))
    .where(and(eq(guides.ownerId, viewerId), or(inArray(sql`lower(trim(${places.city}))`, variants), inArray(sql`lower(trim(${guides.city}))`, variants))!))
    .limit(2000);
  const mine = rows.filter((r) => r.place.city.trim() === "" || sameCity(r.place.city, city));
  const ids = mine.map((r) => r.place.id);
  const firstTip = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const tips = await db.select({ placeId: placeTips.placeId, body: placeTips.body, position: placeTips.position }).from(placeTips).where(inArray(placeTips.placeId, ids.slice(i, i + 500)));
    tips.sort((a, b) => a.position - b.position);
    for (const t of tips) if (!firstTip.has(t.placeId) && t.body.trim()) firstTip.set(t.placeId, t.body);
  }
  return mine.map((r) => {
    const isPublic = r.guide.visibility === "public" && !!r.guide.publishedAt;
    const theirs = !r.place.noteAuthorId || r.place.noteAuthorId === viewerId;
    const { visibility: _v, ...guide } = r.guide;
    void _v;
    return {
      place: r.place,
      guide,
      owner: toPublicUser(r.owner),
      tip: clip((theirs ? r.place.note : "") || firstTip.get(r.place.id) || ""),
      at: r.place.sharedAt ?? r.place.createdAt,
      city: canonicalCity(r.place.city.trim() || r.guide.city.trim() || city),
      isPrivate: !isPublic && !r.place.sharedAt,
    };
  });
}

/** Merge recommendations into one spot per place, most recommended first. */
export function mergeSpots(recs: Recommendation[]): CitySpot[] {
  const groups = new Map<string, CitySpot>();
  for (const r of recs) {
    const k = spotKey(r.place);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, place: r.place, recommenders: [] };
      groups.set(k, g);
    }
    const existing = g.recommenders.find((x) => x.user.id === r.owner.id);
    if (existing) {
      // Prefer the copy others can see, then one with words.
      if ((existing.isPrivate && !r.isPrivate) || (!existing.tip && r.tip && !!existing.isPrivate === !!r.isPrivate))
        Object.assign(existing, { tip: r.tip || existing.tip, placeId: r.place.id, guideSlug: r.guide.slug, guideTitle: r.guide.title, isPrivate: r.isPrivate });
      continue;
    }
    g.recommenders.push({ user: r.owner, placeId: r.place.id, guideSlug: r.guide.slug, guideTitle: r.guide.title, tip: r.tip, addedAt: r.at, isPrivate: r.isPrivate });
    // Prefer a copy with a photo for the card.
    if (!g.place.photoMediaId && !g.place.photoUrl && (r.place.photoMediaId || r.place.photoUrl)) g.place = r.place;
  }
  const latest = (s: CitySpot) => Math.max(...s.recommenders.map((x) => x.addedAt.getTime()));
  for (const g of groups.values()) g.recommenders.sort((a, b) => Number(!!b.tip) - Number(!!a.tip) || b.addedAt.getTime() - a.addedAt.getTime());
  return [...groups.values()].filter((g) => g.recommenders.length > 0).sort((a, b) => b.recommenders.length - a.recommenders.length || latest(b) - latest(a));
}

/**
 * Spots in `city`. With `ownerIds`, only those people's (friends); without, everyone's (the
 * fallback when you don't follow anyone there). Sorted by how many people recommend the spot.
 */
export async function citySpots(opts: { city: string; viewerId?: string | null; ownerIds?: string[]; withOwn?: boolean }): Promise<CitySpot[]> {
  if (!opts.city) return [];
  const recs = await loadRecommendations(opts);
  // The viewer's own places (all of them, private ones too), replacing their public copies.
  if (opts.withOwn && opts.viewerId) {
    const own = await loadOwnPlaces(opts.viewerId, opts.city);
    return mergeSpots([...recs.filter((r) => r.owner.id !== opts.viewerId), ...own]);
  }
  return mergeSpots(recs);
}

export interface FriendCity {
  city: string;
  country: string;
  spots: number;
  /** Friends with spots here, most spots first. */
  friends: PublicUser[];
  /** A spot with a photo, for the tile when there's no guide cover. */
  photo: Place | null;
}

/** Cities where people the viewer follows recommend spots, most friends first. */
export async function friendCities(viewerId: string | null | undefined, recs?: Recommendation[], opts: { withOwn?: boolean } = {}): Promise<FriendCity[]> {
  if (!viewerId) return [];
  const all = recs ?? (await loadRecommendations({ viewerId, ownerIds: await acceptedFollowingIds(viewerId) }));
  const by = new Map<string, { city: string; country: string; keys: Set<string>; owners: Map<string, { user: PublicUser; n: number }>; photo: Place | null }>();
  for (const r of all) {
    if (!r.city) continue;
    const k = r.city.toLowerCase();
    let c = by.get(k);
    if (!c) {
      c = { city: r.city, country: r.place.country || r.guide.country, keys: new Set(), owners: new Map(), photo: null };
      by.set(k, c);
    }
    c.keys.add(spotKey(r.place));
    const o = c.owners.get(r.owner.id) ?? { user: r.owner, n: 0 };
    o.n++;
    c.owners.set(r.owner.id, o);
    if (!c.photo && (r.place.photoMediaId || r.place.photoUrl)) c.photo = r.place;
  }
  // The viewer's own places count too (the same number as the city page): friends' spots ∪ yours.
  if (opts.withOwn) {
    const own = await ownSpotKeys(viewerId);
    for (const [k, c] of by) for (const key of own.get(k) ?? []) c.keys.add(key);
  }
  return [...by.values()]
    .map((c) => ({ city: c.city, country: c.country, spots: c.keys.size, friends: [...c.owners.values()].sort((a, b) => b.n - a.n).map((o) => o.user), photo: c.photo }))
    .sort((a, b) => b.friends.length - a.friends.length || b.spots - a.spots);
}

export type ActivityItem =
  | { kind: "spots"; at: Date; user: PublicUser; city: string; recs: Recommendation[] }
  | { kind: "overlap"; at: Date; city: string; spot: CitySpot };

/**
 * "New from friends" on Home: friends recommending spots (grouped per person, city and day) and
 * spots that just reached 3+ friends. Places that went in with a newly published guide are left
 * out — the guide itself is the news (the page adds those).
 */
export function friendsActivity(recs: Recommendation[], opts: { days?: number } = {}): ActivityItem[] {
  const since = Date.now() - (opts.days ?? 45) * 86_400_000;
  const fresh = recs.filter((r) => {
    if (r.at.getTime() < since) return false;
    if (r.place.sharedAt) return true;
    const pub = r.guide.publishedAt?.getTime();
    return !!pub && r.place.createdAt.getTime() > pub + 10 * 60_000;
  });
  const groups = new Map<string, ActivityItem & { kind: "spots" }>();
  for (const r of fresh) {
    const k = `${r.owner.id}|${r.city.toLowerCase()}|${r.at.toISOString().slice(0, 10)}`;
    const g = groups.get(k);
    if (g) {
      if (!g.recs.some((x) => spotKey(x.place) === spotKey(r.place))) g.recs.push(r);
      if (r.at > g.at) g.at = r.at;
    } else groups.set(k, { kind: "spots", at: r.at, user: r.owner, city: r.city, recs: [r] });
  }
  const items: ActivityItem[] = [...groups.values()];
  // Spots that now have 3+ friends, where the latest one came recently.
  const byCity = new Map<string, Recommendation[]>();
  for (const r of recs) if (r.city) byCity.set(r.city.toLowerCase(), [...(byCity.get(r.city.toLowerCase()) ?? []), r]);
  for (const [, cityRecs] of byCity) {
    for (const spot of mergeSpots(cityRecs)) {
      if (spot.recommenders.length < 3) break;
      const last = Math.max(...spot.recommenders.map((x) => x.addedAt.getTime()));
      if (last >= since) items.push({ kind: "overlap", at: new Date(last), city: cityRecs[0].city, spot });
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Can the viewer see a place its owner recommended on its own (outside a public guide)? Same rules as a public guide. */
export async function canViewSharedPlace(ownerId: string, viewerId: string | null | undefined): Promise<boolean> {
  if (viewerId === ownerId) return true;
  if ((await hiddenUserIds(viewerId)).has(ownerId)) return false;
  const db = await getDb();
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId) });
  if (!owner) return false;
  if (owner.profileVisibility !== "private") return true;
  return !!viewerId && (await acceptedFollowingIds(viewerId)).includes(ownerId);
}

/**
 * Every place the viewer has (all their guides, drafts and private ones, and My places), as spot
 * keys per city (lower-case canonical city). For counts the viewer alone sees, matching the city
 * page, which always includes your own spots.
 */
export async function ownSpotKeys(viewerId: string): Promise<Map<string, Set<string>>> {
  const db = await getDb();
  const rows = await db
    .select({ googlePlaceId: places.googlePlaceId, name: places.name, lat: places.lat, lng: places.lng, city: places.city, guideCity: guides.city })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(eq(guides.ownerId, viewerId))
    .limit(5000);
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const raw = r.city.trim() || r.guideCity.trim();
    if (!raw) continue;
    const k = canonicalCity(raw).toLowerCase();
    const set = out.get(k) ?? new Set<string>();
    set.add(spotKey(r));
    out.set(k, set);
  }
  return out;
}
