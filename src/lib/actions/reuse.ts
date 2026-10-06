"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { tidyCity } from "@/lib/places/cityName";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { hiddenUserIds } from "../blocks";
import { getDb } from "../db";
import { guides, places, trips, type Guide, type Place, type Trip, type User } from "../db/schema";
import { canViewGuide, isCollaborator } from "../guides";
import { findCity } from "../places/cities";
import { copyBranches, copyPlace, freshGuideSlug, isReusable, notifyGuideUsed, placeKey } from "../reuse";
import { newId, newToken } from "../utils";

type Result = { ok: true; slug: string; title: string; added: number } | { ok: false; error: string };

const MAX_PLACES = 300;

/** The trip's own guide, creating "My <City> trip" (private) the first time. */
async function ensureTripGuide(user: User, trip: Trip, title?: string): Promise<Guide> {
  const db = await getDb();
  if (trip.guideId) {
    const g = await db.query.guides.findFirst({ where: eq(guides.id, trip.guideId) });
    if (g && (g.ownerId === user.id || (await isCollaborator(g.id, user.id)))) return g;
  }
  const now = new Date();
  const name = (title ?? "").trim().slice(0, 80) || `My ${trip.city} trip`;
  const row: typeof guides.$inferInsert = {
    id: newId(),
    ownerId: user.id,
    slug: await freshGuideSlug(name),
    title: name,
    city: trip.city,
    country: trip.country,
    description: "",
    visibility: "private",
    allowFork: true,
    shareToken: newToken(),
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(guides).values(row);
  await db.update(trips).set({ guideId: row.id }).where(eq(trips.id, trip.id));
  return (await db.query.guides.findFirst({ where: eq(guides.id, row.id) }))!;
}

/** Copy chosen places into `target`, skipping ones it already has and ones the viewer may not reuse. */
async function copyInto(user: User, target: Guide, placeIds: string[]): Promise<number> {
  const db = await getDb();
  const ids = [...new Set(placeIds)].slice(0, MAX_PLACES);
  if (!ids.length) return 0;
  const chosen = await db.select().from(places).where(inArray(places.id, ids));
  const sourceIds = [...new Set(chosen.map((p) => p.guideId))];
  const sources = sourceIds.length ? await db.select().from(guides).where(inArray(guides.id, sourceIds)) : [];
  const hidden = await hiddenUserIds(user.id);
  const usable = new Map<string, Guide>();
  for (const g of sources) {
    if (g.id === target.id || !isReusable(g) || hidden.has(g.ownerId)) continue;
    if (g.ownerId !== user.id && !(await canViewGuide(g, user.id))) continue;
    usable.set(g.id, g);
  }
  const existing = await db.select().from(places).where(eq(places.guideId, target.id));
  const have = new Set(existing.map(placeKey));
  let position = existing.reduce((m, p) => Math.max(m, p.position + 1), 0);
  const byId = new Map(chosen.map((p) => [p.id, p]));
  const now = new Date();
  const rows: (typeof places.$inferInsert)[] = [];
  const perSource = new Map<string, number>();
  const pairs: Array<[string, string]> = [];
  for (const id of ids) {
    const p: Place | undefined = byId.get(id);
    const source = p && usable.get(p.guideId);
    if (!p || !source) continue;
    const key = placeKey(p);
    if (have.has(key)) continue;
    have.add(key);
    const row = copyPlace(p, source, { guideId: target.id, position: position++, now });
    rows.push(row);
    pairs.push([p.id, row.id!]);
    perSource.set(source.id, (perSource.get(source.id) ?? 0) + 1);
  }
  if (!rows.length) return 0;
  await db.insert(places).values(rows);
  await copyBranches(pairs);
  await db.update(guides).set({ updatedAt: now }).where(eq(guides.id, target.id));
  for (const [gid, n] of perSource) {
    const g = usable.get(gid)!;
    // Creators who keep their notes to themselves aren't told — nothing of theirs was copied.
    if (g.allowFork) await notifyGuideUsed(g, user.id, n);
  }
  return rows.length;
}

function revalidateTarget(slug: string, tripId?: string) {
  revalidatePath(`/g/${slug}`);
  revalidatePath(`/g/${slug}/edit`);
  revalidatePath("/me");
  revalidatePath("/trips");
  if (tripId) revalidatePath(`/trips/${tripId}`);
}

/** Trip planner: combine the places picked from several guides into the trip's own guide. */
export async function combineForTrip(tripId: string, placeIds: string[], title?: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in." };
  const db = await getDb();
  const trip = await db.query.trips.findFirst({ where: and(eq(trips.id, tripId), eq(trips.userId, user.id)) });
  if (!trip) return { ok: false, error: "Trip not found." };
  if (!placeIds.length) return { ok: false, error: "Pick at least one place." };
  const target = await ensureTripGuide(user, trip, title);
  const added = await copyInto(user, target, placeIds);
  revalidateTarget(target.slug, trip.id);
  return { ok: true, slug: target.slug, title: target.title, added };
}

/**
 * "Add to my guide" from a place page. `target` is one of the viewer's guides,
 * or "trip" for this city's trip guide (creating the trip and guide if needed).
 */
export async function addPlaceToMyGuide(placeId: string, target: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in." };
  const db = await getDb();
  const place = await db.query.places.findFirst({ where: eq(places.id, placeId) });
  if (!place) return { ok: false, error: "Place not found." };
  let guide: Guide | undefined;
  let tripId: string | undefined;
  if (target === "trip") {
    const source = await db.query.guides.findFirst({ where: eq(guides.id, place.guideId) });
    // The guide's city ("Bali") beats a place's admin area; tidyCity cleans older rows.
    const rawCity = tidyCity(source?.city || place.city);
    if (!rawCity) return { ok: false, error: "We don't know which city this place is in." };
    let trip = await db.query.trips.findFirst({
      where: and(eq(trips.userId, user.id), sql`lower(${trips.city}) = ${rawCity.toLowerCase()}`),
      orderBy: desc(trips.createdAt),
    });
    if (!trip) {
      const known = findCity(rawCity);
      const id = newId();
      await db.insert(trips).values({ id, userId: user.id, city: known?.city ?? rawCity, country: known?.country ?? place.country, createdAt: new Date() });
      trip = (await db.query.trips.findFirst({ where: eq(trips.id, id) }))!;
    }
    guide = await ensureTripGuide(user, trip);
    tripId = trip.id;
  } else {
    guide = await db.query.guides.findFirst({ where: eq(guides.id, target) });
    if (!guide || (guide.ownerId !== user.id && !(await isCollaborator(guide.id, user.id)))) return { ok: false, error: "You can only add to your own guides." };
  }
  if (guide.id === place.guideId) return { ok: false, error: "It's already in that guide." };
  const added = await copyInto(user, guide, [place.id]);
  revalidateTarget(guide.slug, tripId);
  if (!added) {
    const existing = await db.select().from(places).where(eq(places.guideId, guide.id));
    if (existing.some((p) => placeKey(p) === placeKey(place))) return { ok: true, slug: guide.slug, title: guide.title, added: 0 };
    return { ok: false, error: "This place can't be added — the guide isn't public." };
  }
  return { ok: true, slug: guide.slug, title: guide.title, added };
}
