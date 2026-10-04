import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { guides, notifications, placeLocations, places, trips, type Guide, type Place } from "./db/schema";
import { addNotifications } from "./notifications";
import { newId, slugify } from "./utils";

/**
 * Reusing other people's places (copying a guide, combining guides for a trip,
 * "Add to my guide"). The place itself is public information; the creator's
 * notes, photos and voice clips are theirs and only come along when the guide
 * allows it (guides.allowFork — "Let others reuse my notes and photos").
 */

/** Same real-world place across guides: Google id when we have one, otherwise name + rough location. */
export function placeKey(p: Pick<Place, "googlePlaceId" | "name" | "lat" | "lng" | "city">): string {
  if (p.googlePlaceId) return `g:${p.googlePlaceId}`;
  const name = p.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  if (p.lat != null && p.lng != null) return `n:${name}@${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  return `n:${name}@${p.city.toLowerCase()}`;
}

/** Only live public guides can be reused place-by-place; private, shared and draft guides never. */
export const isReusable = (g: Pick<Guide, "visibility" | "publishedAt">) => g.visibility === "public" && !!g.publishedAt;

/** Columns for a copy of `p` in someone else's guide. */
export function copyPlace(p: Place, source: Pick<Guide, "ownerId" | "allowFork">, target: { guideId: string; position: number; now: Date }): typeof places.$inferInsert {
  const withNotes = source.allowFork;
  return {
    ...p,
    id: newId(),
    guideId: target.guideId,
    position: target.position,
    createdAt: target.now,
    note: withNotes ? p.note : "",
    noteClipMediaId: withNotes ? p.noteClipMediaId : null,
    noteAuthorId: withNotes && p.note ? (p.noteAuthorId ?? source.ownerId) : null,
    special: null,
    photoMediaId: withNotes ? p.photoMediaId : null,
  };
}

/** Branches are public facts (addresses), so they always come along with a copied place. */
export async function copyBranches(pairs: Array<[fromPlaceId: string, toPlaceId: string]>): Promise<void> {
  if (!pairs.length) return;
  const db = await getDb();
  const to = new Map(pairs);
  const rows = await db.select().from(placeLocations).where(inArray(placeLocations.placeId, [...to.keys()]));
  if (!rows.length) return;
  const now = new Date();
  await db.insert(placeLocations).values(rows.map((r) => ({ ...r, id: newId(), placeId: to.get(r.placeId)!, createdAt: now })));
}

const BATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** "Yara used 6 places from your Lisbon guide" — batched per person and guide for a day while unread. */
export async function notifyGuideUsed(source: Guide, actorId: string, n: number): Promise<void> {
  if (n < 1 || source.ownerId === actorId) return;
  try {
    const db = await getDb();
    const open = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, source.ownerId),
        eq(notifications.type, "guide_used"),
        eq(notifications.actorId, actorId),
        eq(notifications.guideId, source.id),
        isNull(notifications.readAt),
        gt(notifications.createdAt, new Date(Date.now() - BATCH_WINDOW_MS)),
      ),
    });
    if (open) {
      await db.update(notifications).set({ count: open.count + n, createdAt: new Date() }).where(eq(notifications.id, open.id));
      return;
    }
    await addNotifications([{ id: newId(), userId: source.ownerId, type: "guide_used", actorId, guideId: source.id, count: n, createdAt: new Date() }]);
  } catch (e) {
    console.warn("[notifyGuideUsed]", e);
  }
}

/** A fresh, unused guide slug based on the title. */
export async function freshGuideSlug(title: string): Promise<string> {
  const db = await getDb();
  const base = slugify(title);
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${newId().slice(0, 6)}`;
    if (!(await db.query.guides.findFirst({ where: eq(guides.slug, slug) }))) return slug;
  }
  return `${base}-${newId()}`;
}

/** Where "Add to my guide" can put a place: this city's trip guide first, then the viewer's other guides. */
export async function reuseTargets(userId: string, city: string): Promise<{ trip: { guideId: string | null; title: string } | null; guides: { id: string; title: string; city: string }[] }> {
  const db = await getDb();
  const trip = city
    ? await db.query.trips.findFirst({ where: and(eq(trips.userId, userId), sql`lower(${trips.city}) = ${city.toLowerCase()}`), orderBy: desc(trips.createdAt) })
    : undefined;
  let tripTitle = `My ${city} trip`;
  if (trip?.guideId) {
    const g = await db.query.guides.findFirst({ where: eq(guides.id, trip.guideId) });
    if (g) tripTitle = g.title;
  }
  const mine = await db
    .select({ id: guides.id, title: guides.title, city: guides.city })
    .from(guides)
    .where(eq(guides.ownerId, userId))
    .orderBy(desc(guides.updatedAt))
    .limit(15);
  return {
    trip: city ? { guideId: trip?.guideId ?? null, title: tripTitle } : null,
    guides: mine.filter((g) => g.id !== trip?.guideId),
  };
}
