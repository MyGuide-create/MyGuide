/**
 * "Friends' spots" for the city page: every place from published guides in a city (plus places people
 * recommended on their own from Saved places), merged so the
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
}

export interface CitySpot {
  key: string;
  place: Place;
  recommenders: SpotRecommender[];
}

/** Same spot across guides: Google place id, else name + location (~100 m), else name. */
function spotKey(p: Place): string {
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

/**
 * Spots in `city` from public, published guides. With `ownerIds`, only those people's guides
 * (friends); without, everyone's (the fallback when you don't follow anyone there).
 * Sorted by how many people recommend the spot, then most recent.
 */
export async function citySpots(opts: { city: string; viewerId?: string | null; ownerIds?: string[] }): Promise<CitySpot[]> {
  const { city, viewerId, ownerIds } = opts;
  if (!city) return [];
  if (ownerIds && !ownerIds.length) return [];
  const db = await getDb();
  const variants = cityNameVariants(city);
  const conds: SQL[] = [
    // In a public guide, or recommended on its own (a shared place in Saved places).
    or(and(eq(guides.visibility, "public"), isNotNull(guides.publishedAt)), isNotNull(places.sharedAt))!,
    or(inArray(sql`lower(trim(${places.city}))`, variants), inArray(sql`lower(trim(${guides.city}))`, variants))!,
  ];
  if (ownerIds) conds.push(inArray(guides.ownerId, ownerIds));
  const rows = await db
    .select({ place: places, guide: { id: guides.id, slug: guides.slug, title: guides.title, ownerId: guides.ownerId }, owner: users })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .innerJoin(users, eq(users.id, guides.ownerId))
    .where(and(...conds))
    .limit(3000);

  const hidden = await hiddenUserIds(viewerId);
  const followed = ownerIds ? new Set(ownerIds) : new Set(await acceptedFollowingIds(viewerId));
  const visible = rows.filter(
    (r) =>
      !hidden.has(r.owner.id) &&
      // A day trip in a Lisbon guide (place city Sintra) isn't a Lisbon spot.
      (r.place.city.trim() === "" || sameCity(r.place.city, city)) &&
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

  const groups = new Map<string, CitySpot>();
  for (const r of visible) {
    const k = spotKey(r.place);
    let g = groups.get(k);
    if (!g) {
      g = { key: k, place: r.place, recommenders: [] };
      groups.set(k, g);
    }
    // Their own words only: a note written by someone else (a copied or forked place) isn't theirs.
    const notTheirs = (r.place.noteAuthorId && r.place.noteAuthorId !== r.owner.id) || (r.place.sourcePlaceId && r.place.noteAuthorId !== r.owner.id);
    const ownNote = notTheirs ? "" : r.place.note;
    const tip = clip(ownNote || firstTip.get(r.place.id) || "");
    const existing = g.recommenders.find((x) => x.user.id === r.owner.id);
    if (existing) {
      if (!existing.tip && tip) Object.assign(existing, { tip, placeId: r.place.id, guideSlug: r.guide.slug, guideTitle: r.guide.title });
      continue;
    }
    g.recommenders.push({ user: toPublicUser(r.owner), placeId: r.place.id, guideSlug: r.guide.slug, guideTitle: r.guide.title, tip, addedAt: r.place.createdAt });
    // Prefer a copy with a photo for the card.
    if (!g.place.photoMediaId && !g.place.photoUrl && (r.place.photoMediaId || r.place.photoUrl)) g.place = r.place;
  }

  const latest = (s: CitySpot) => Math.max(...s.recommenders.map((x) => x.addedAt.getTime()));
  for (const g of groups.values()) g.recommenders.sort((a, b) => Number(!!b.tip) - Number(!!a.tip) || b.addedAt.getTime() - a.addedAt.getTime());
  return [...groups.values()].sort((a, b) => b.recommenders.length - a.recommenders.length || latest(b) - latest(a));
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
