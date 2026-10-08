import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { guides, notifications, placeLocations, places, placeTips, trips, users, type Guide, type Place } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import { addNotifications } from "./notifications";
import { newId, slugify } from "./utils";

/**
 * Reusing other people's places (Copy guide, combining guides for a trip, "Add to my guide").
 * The place itself is public information and is copied. The creator's note, tips and voice clip are
 * never copied as text: the copy points at the original (places.sourcePlaceId) and shows them live,
 * credited and read-only — only when the guide allows it (guides.allowFork — "Let others copy my notes and tips").
 * The copier writes their own note in the copy's empty note box.
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
    // The copier's own note starts empty; the creator's words are shown from the original, credited.
    note: "",
    noteClipMediaId: null,
    noteAuthorId: null,
    special: null,
    photoMediaId: withNotes ? p.photoMediaId : null,
    sourcePlaceId: withNotes ? p.id : null,
  };
}

/** A creator's note and tips shown on someone's copy of their place — read-only, credited, live from the original. */
export interface CreditedNote {
  sourcePlaceId: string;
  author: PublicUser;
  note: string;
  clipMediaId: string | null;
  tips: string[];
  guideSlug: string;
  guideTitle: string;
}

/**
 * Credited notes for the places of `copy` (follows copies of copies, up to 3 steps back).
 * Shown when the original guide still shares its notes, and either the original is public or the copy isn't
 * (so someone's private-guide notes never end up on a published copy).
 */
export async function creditedNotesFor(placeRows: Place[], copy: Pick<Guide, "visibility" | "publishedAt">, hidden: Set<string>): Promise<Record<string, CreditedNote[]>> {
  const out: Record<string, CreditedNote[]> = {};
  const copyIsPublic = copy.visibility === "public" && !!copy.publishedAt;
  // place in this guide -> the source id we still need to look at
  let pending = new Map(placeRows.filter((p) => p.sourcePlaceId).map((p) => [p.id, p.sourcePlaceId!]));
  if (!pending.size) return out;
  const db = await getDb();
  for (let hop = 0; hop < 3 && pending.size; hop++) {
    const ids = [...new Set(pending.values())];
    const srcRows = await db.select().from(places).where(inArray(places.id, ids));
    const src = new Map(srcRows.map((p) => [p.id, p]));
    const gIds = [...new Set(srcRows.map((p) => p.guideId))];
    const gRows = gIds.length ? await db.select().from(guides).where(inArray(guides.id, gIds)) : [];
    const gMap = new Map(gRows.map((g) => [g.id, g]));
    const tipRows = ids.length ? await db.select().from(placeTips).where(inArray(placeTips.placeId, ids)).orderBy(placeTips.position, placeTips.createdAt) : [];
    const tipsBy = new Map<string, string[]>();
    for (const t of tipRows) tipsBy.set(t.placeId, [...(tipsBy.get(t.placeId) ?? []), t.body]);
    const authorIds = [...new Set(srcRows.map((p) => p.noteAuthorId ?? gMap.get(p.guideId)?.ownerId).filter((x): x is string => !!x))];
    const authorRows = authorIds.length ? await db.select().from(users).where(inArray(users.id, authorIds)) : [];
    const authors = new Map(authorRows.map((u) => [u.id, toPublicUser(u)]));

    const next = new Map<string, string>();
    for (const [placeId, srcId] of pending) {
      const s = src.get(srcId);
      const g = s ? gMap.get(s.guideId) : undefined;
      if (!s || !g || !g.allowFork) continue;
      const author = authors.get(s.noteAuthorId ?? g.ownerId);
      const tips = tipsBy.get(s.id) ?? [];
      const visible = isReusable(g) || !copyIsPublic;
      if (author && visible && !hidden.has(author.id) && (s.note.trim() || tips.length || s.noteClipMediaId)) {
        (out[placeId] ??= []).push({ sourcePlaceId: s.id, author, note: s.note, clipMediaId: s.noteClipMediaId, tips, guideSlug: g.slug, guideTitle: g.title });
      }
      if (s.sourcePlaceId) next.set(placeId, s.sourcePlaceId);
    }
    pending = next;
  }
  return out;
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
