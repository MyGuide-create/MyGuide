/**
 * My places: every place you've added. The list itself is a private, never-published guide (the
 * "stash", once called Saved places); places you put straight into one of your guides (guide editor,
 * a trip) also count as yours and show on the My places page, read from those guides.
 * Places picked from friends stay theirs until you add your own words (same rule as the city page).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { guides, placeLocations, placePhotos, placeTips, places, type Guide, type Place } from "./db/schema";
import { spotKey } from "./citySpots";
import { canonicalCity } from "./places/cities";
import { STASH_TITLE, STASH_TITLES } from "./stash";
import { newId, newToken, slugify } from "./utils";
import { settleGuides } from "./settleCities";

/** The user's My places list (either name, never a published guide), if they have one. */
export async function findStash(userId: string): Promise<Guide | undefined> {
  const db = await getDb();
  const rows = await db.select().from(guides).where(and(eq(guides.ownerId, userId), inArray(guides.title, STASH_TITLES), isNull(guides.publishedAt)));
  // Both names can only exist together before migration 0028 if someone named a guide "My places"; the new name wins.
  return rows.find((g) => g.title === STASH_TITLE) ?? rows[0];
}

export interface MyPlace {
  place: Place;
  /** In the My places list itself (you can recommend it there). False: only in one of your guides. */
  inStash: boolean;
  /** Your other guides that have this spot. */
  inGuides: { slug: string; title: string }[];
  /** Tidied city ("" when unknown). */
  city: string;
  /** Link to the place. */
  href: string;
}

/** Every place that's yours, one row per spot, My places list order first, then the rest newest first. */
export async function loadMyPlaces(userId: string): Promise<{ stash: Guide | undefined; items: MyPlace[] }> {
  const db = await getDb();
  const stash = await findStash(userId);
  const rows = await db
    .select({ place: places, guide: { id: guides.id, slug: guides.slug, title: guides.title, city: guides.city, forkedFrom: guides.forkedFromGuideId } })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(eq(guides.ownerId, userId))
    .orderBy(asc(places.position), asc(places.createdAt))
    .limit(5000);

  const stashRows = rows.filter((r) => r.guide.id === stash?.id);
  const guideRows = rows.filter((r) => r.guide.id !== stash?.id);
  // Copies of other people's places count once you've written something of your own.
  const copied = guideRows.filter((r) => r.place.sourcePlaceId || r.guide.forkedFrom);
  const withTips = new Set<string>();
  const copiedIds = copied.map((r) => r.place.id);
  for (let i = 0; i < copiedIds.length; i += 500) {
    const t = await db.select({ placeId: placeTips.placeId, body: placeTips.body }).from(placeTips).where(inArray(placeTips.placeId, copiedIds.slice(i, i + 500)));
    for (const x of t) if (x.body.trim()) withTips.add(x.placeId);
  }
  const yours = (r: (typeof rows)[number]) => {
    if (!r.place.sourcePlaceId && !r.guide.forkedFrom) return true;
    const theirWords = !r.place.noteAuthorId || r.place.noteAuthorId === userId;
    return (theirWords && !!r.place.note.trim()) || withTips.has(r.place.id);
  };

  const guidesByKey = new Map<string, { slug: string; title: string }[]>();
  for (const r of guideRows) {
    const k = spotKey(r.place);
    const list = guidesByKey.get(k) ?? [];
    if (!list.some((g) => g.slug === r.guide.slug)) list.push({ slug: r.guide.slug, title: r.guide.title });
    guidesByKey.set(k, list);
  }
  const cityOf = (r: (typeof rows)[number]) => {
    const raw = r.place.city.trim() || r.guide.city.trim();
    return raw ? canonicalCity(raw) : "";
  };

  const seen = new Set<string>();
  const items: MyPlace[] = [];
  for (const r of stashRows) {
    const k = spotKey(r.place);
    seen.add(k);
    items.push({ place: r.place, inStash: true, inGuides: guidesByKey.get(k) ?? [], city: cityOf(r), href: `/g/${r.guide.slug}/p/${r.place.id}` });
  }
  const extra = guideRows.filter(yours).sort((a, b) => b.place.createdAt.getTime() - a.place.createdAt.getTime());
  for (const r of extra) {
    const k = spotKey(r.place);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ place: r.place, inStash: false, inGuides: guidesByKey.get(k) ?? [], city: cityOf(r), href: `/g/${r.guide.slug}/p/${r.place.id}` });
  }
  return { stash, items };
}

/** Places in the My places list (not yet in any of your guides), per city — for the "Make them a guide?" nudge. */
export function unguidedByCity(items: MyPlace[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const it of items) {
    if (!it.inStash || it.inGuides.length || !it.city) continue;
    m.set(it.city, [...(m.get(it.city) ?? []), it.place.id]);
  }
  return m;
}

/** The nudge shows from this many places in one city that aren't in a guide yet. */
export const NUDGE_MIN = 4;

async function uniqueSlug(title: string): Promise<string> {
  const db = await getDb();
  const base = slugify(title) || "places";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${newId().slice(0, 6)}`;
    if (!(await db.query.guides.findFirst({ where: eq(guides.slug, slug) }))) return slug;
  }
  return `${base}-${newId()}`;
}

/** The user's My places list, created (private, never published) the first time they add a place. */
export async function findOrCreateStash(userId: string): Promise<Guide> {
  const existing = await findStash(userId);
  if (existing) return existing;
  const db = await getDb();
  const id = newId();
  const now = new Date();
  await db.insert(guides).values({
    id,
    ownerId: userId,
    slug: await uniqueSlug(STASH_TITLE),
    title: STASH_TITLE,
    description: "Every place you've added. Group them into guides whenever you like.",
    shareToken: newToken(),
    createdAt: now,
    updatedAt: now,
  });
  return (await db.query.guides.findFirst({ where: eq(guides.id, id) }))!;
}

/**
 * Put copies of these places (already resolved rows) at the top of the user's My places, skipping
 * spots already there. `share` recommends them (city page). Tips/photos are copied by the caller
 * via the returned id pairs ([fromId, newId]) when the rows came from an existing place.
 */
export async function addToStash(
  userId: string,
  rows: (typeof places.$inferInsert)[],
  opts: { share: boolean },
): Promise<{ stash: Guide; pairs: Array<[string, string]>; skipped: number }> {
  const db = await getDb();
  const stash = await findOrCreateStash(userId);
  const have = new Set((await db.select({ googlePlaceId: places.googlePlaceId, name: places.name, lat: places.lat, lng: places.lng }).from(places).where(eq(places.guideId, stash.id))).map(spotKey));
  const fresh: (typeof places.$inferInsert)[] = [];
  const pairs: Array<[string, string]> = [];
  for (const r of rows) {
    const k = spotKey({ googlePlaceId: r.googlePlaceId ?? null, name: r.name, lat: r.lat ?? null, lng: r.lng ?? null });
    if (have.has(k)) continue;
    have.add(k);
    const id = newId();
    if (r.id) pairs.push([r.id, id]);
    fresh.push({ ...r, id, guideId: stash.id });
  }
  if (fresh.length) {
    const [{ min }] = await db.select({ min: sql<number>`coalesce(min(${places.position}), 0)` }).from(places).where(eq(places.guideId, stash.id));
    const start = Number(min) - fresh.length;
    const now = new Date();
    const values = fresh.map((r, i) => ({ ...r, position: start + i, createdAt: now, sharedAt: opts.share ? now : null }));
    for (let i = 0; i < values.length; i += 50) await db.insert(places).values(values.slice(i, i + 50));
    await db.update(guides).set({ updatedAt: now }).where(eq(guides.id, stash.id));
    await settleGuides(db, [stash.id]);
  }
  return { stash, pairs, skipped: rows.length - fresh.length };
}

/** Copy tips, photos and branches from each place to its copy ([fromId, toId]). */
export async function copyPlaceExtras(pairs: Array<[string, string]>): Promise<void> {
  if (!pairs.length) return;
  const db = await getDb();
  const to = new Map(pairs);
  const from = pairs.map(([a]) => a);
  const now = new Date();
  for (let i = 0; i < from.length; i += 500) {
    const chunk = from.slice(i, i + 500);
    const [tips, photos, branches] = await Promise.all([
      db.select().from(placeTips).where(inArray(placeTips.placeId, chunk)),
      db.select().from(placePhotos).where(inArray(placePhotos.placeId, chunk)),
      db.select().from(placeLocations).where(inArray(placeLocations.placeId, chunk)),
    ]);
    if (tips.length) await db.insert(placeTips).values(tips.map((t) => ({ ...t, id: newId(), placeId: to.get(t.placeId)!, createdAt: now })));
    if (photos.length) await db.insert(placePhotos).values(photos.map((t) => ({ ...t, id: newId(), placeId: to.get(t.placeId)!, createdAt: now })));
    if (branches.length) await db.insert(placeLocations).values(branches.map((t) => ({ ...t, id: newId(), placeId: to.get(t.placeId)!, createdAt: now })));
  }
}

/**
 * Your own copy of a spot someone else saved (a friend's page opens from the city page when you both
 * have it), so you can fix your copy's location from there. My places first, then your guides.
 */
export async function ownCopyOf(userId: string, place: Pick<Place, "id" | "googlePlaceId" | "name" | "lat" | "lng">): Promise<{ guideId: string; placeId: string; slug: string; droppedPin: boolean; lat: number | null; lng: number | null; inStash: boolean; recommended: boolean; city: string } | null> {
  const db = await getDb();
  const k = spotKey(place);
  const rows = await db
    .select({ place: places, guide: guides })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(place.googlePlaceId ? and(eq(guides.ownerId, userId), eq(places.googlePlaceId, place.googlePlaceId)) : eq(guides.ownerId, userId));
  const hit = rows.filter((r) => r.place.id !== place.id && spotKey(r.place) === k).sort((a, b) => Number(STASH_TITLES.includes(b.guide.title) && !b.guide.publishedAt) - Number(STASH_TITLES.includes(a.guide.title) && !a.guide.publishedAt))[0];
  if (!hit) return null;
  const inStash = STASH_TITLES.includes(hit.guide.title) && !hit.guide.publishedAt;
  // Recommended: shared from My places, or in one of your published public guides.
  const recommended = !!hit.place.sharedAt || (!inStash && !!hit.guide.publishedAt && hit.guide.visibility === "public");
  return { guideId: hit.guide.id, placeId: hit.place.id, slug: hit.guide.slug, droppedPin: !hit.place.googlePlaceId && hit.place.lat != null, lat: hit.place.lat, lng: hit.place.lng, inStash, recommended, city: hit.place.city };
}
