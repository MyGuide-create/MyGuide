"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { tidyCity } from "@/lib/places/cityName";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { hiddenUserIds } from "../blocks";
import { getDb } from "../db";
import { guides, placePhotos, placeTips, places, trips, type Guide, type Place, type Trip, type User } from "../db/schema";
import { canViewGuide, isCollaborator } from "../guides";
import { findCity } from "../places/cities";
import { copyBranches, copyPlace, freshGuideSlug, isReusable, notifyGuideUsed, placeKey } from "../reuse";
import { newId, newToken } from "../utils";
import { canViewSharedPlace } from "../citySpots";
import { isStash } from "../stash";
import { canonicalCity } from "../places/cities";

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
  // Saved places lists aren't public, but a place recommended from one can be picked on its own.
  const sharedOnly = new Set<string>();
  for (const g of sources) {
    if (g.id === target.id || hidden.has(g.ownerId)) continue;
    // Your own places can always go into another guide of yours.
    if (g.ownerId !== user.id && (!isReusable(g) || !(await canViewGuide(g, user.id)))) {
      if (!isStash(g) || !(await canViewSharedPlace(g.ownerId, user.id))) continue;
      sharedOnly.add(g.id);
    }
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
  const ownPairs: Array<[string, string]> = [];
  for (const id of ids) {
    const p: Place | undefined = byId.get(id);
    const source = p && usable.get(p.guideId);
    if (!p || !source) continue;
    if (sharedOnly.has(source.id) && !p.sharedAt) continue;
    const key = placeKey(p);
    if (have.has(key)) continue;
    have.add(key);
    const row =
      source.ownerId === user.id
        ? // Your own place: a straight copy, your words included (not a credited quote of yourself).
          { ...p, id: newId(), guideId: target.id, position: position++, createdAt: now, sharedAt: null }
        : copyPlace(p, source, { guideId: target.id, position: position++, now });
    rows.push(row);
    pairs.push([p.id, row.id!]);
    if (source.ownerId === user.id) ownPairs.push([p.id, row.id!]);
    perSource.set(source.id, (perSource.get(source.id) ?? 0) + 1);
  }
  if (!rows.length) return 0;
  await db.insert(places).values(rows);
  await copyBranches(pairs);
  // Your own places bring their tips and photos along (other people's stay theirs, credited).
  if (ownPairs.length) {
    const newOf = new Map(ownPairs);
    const srcIds = ownPairs.map(([a]) => a);
    const tips = await db.select().from(placeTips).where(inArray(placeTips.placeId, srcIds));
    if (tips.length) await db.insert(placeTips).values(tips.map((t) => ({ ...t, id: newId(), placeId: newOf.get(t.placeId)!, createdAt: now })));
    const photos = await db.select().from(placePhotos).where(inArray(placePhotos.placeId, srcIds));
    if (photos.length) await db.insert(placePhotos).values(photos.map((ph) => ({ ...ph, id: newId(), placeId: newOf.get(ph.placeId)!, createdAt: now })));
  }
  await db.update(guides).set({ updatedAt: now }).where(eq(guides.id, target.id));
  for (const [gid, n] of perSource) {
    const g = usable.get(gid)!;
    // Creators who keep their notes to themselves aren't told — nothing of theirs was copied.
    if (g.allowFork && g.ownerId !== user.id) await notifyGuideUsed(g, user.id, n);
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

/**
 * Pick places (from a city's spots or someone's guide) into a new guide of your own, or one you
 * already have. Replaces "Copy guide": picking every place of a guide is the old copy.
 */
export async function pickIntoGuide(input: { placeIds: string[]; guideId?: string; newTitle?: string; city?: string }): Promise<Result & { created?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in." };
  if (!input.placeIds.length) return { ok: false, error: "Pick at least one place." };
  const db = await getDb();
  let target: Guide | undefined;
  let created = false;
  if (input.guideId) {
    target = await db.query.guides.findFirst({ where: eq(guides.id, input.guideId) });
    if (!target || (target.ownerId !== user.id && !(await isCollaborator(target.id, user.id)))) return { ok: false, error: "You can only add to your own guides." };
  } else {
    const title = (input.newTitle ?? "").trim().slice(0, 80);
    if (!title) return { ok: false, error: "Give your guide a title." };
    // City: the one picked from, else the most common city among the places.
    let cityName = (input.city ?? "").trim();
    if (!cityName) {
      const rows = await db.select({ city: places.city }).from(places).where(inArray(places.id, input.placeIds.slice(0, MAX_PLACES)));
      const counts = new Map<string, number>();
      for (const r of rows) if (r.city.trim()) counts.set(canonicalCity(r.city), (counts.get(canonicalCity(r.city)) ?? 0) + 1);
      cityName = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    }
    const known = findCity(cityName);
    const now = new Date();
    const row: typeof guides.$inferInsert = {
      id: newId(),
      ownerId: user.id,
      slug: await freshGuideSlug(title),
      title,
      city: known?.city ?? cityName,
      country: known?.country ?? "",
      lat: known?.lat ?? null,
      lng: known?.lng ?? null,
      description: "",
      visibility: "private",
      allowFork: true,
      shareToken: newToken(),
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(guides).values(row);
    target = (await db.query.guides.findFirst({ where: eq(guides.id, row.id) }))!;
    created = true;
  }
  const added = await copyInto(user, target, input.placeIds);
  if (!added && created) {
    await db.delete(guides).where(eq(guides.id, target.id));
    return { ok: false, error: "None of those places could be added." };
  }
  revalidateTarget(target.slug);
  return { ok: true, slug: target.slug, title: target.title, added, created };
}
