"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guideShares, guides, media, notifications, placeTips, places, users, type Guide, type Place, type PlaceTip } from "../db/schema";
import { canViewGuide, getGuideById } from "../guides";
import { getPlacesProvider, isCategory, resolvePlaceByName, type PlaceResult } from "../places";
import { findCity } from "../places/cities";
import { getPlacePhotos } from "../places/google";
import { claimUnsplashPhoto } from "../covers/unsplash";
import { newId, newToken, slugify } from "../utils";

async function requireOwner(guideId: string): Promise<{ guide: Guide; userId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in.");
  const guide = await getGuideById(guideId);
  if (!guide || guide.ownerId !== user.id) throw new Error("You can only edit your own guides.");
  return { guide, userId: user.id };
}

async function uniqueSlug(title: string): Promise<string> {
  const db = await getDb();
  const base = slugify(title);
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${newId().slice(0, 6)}`;
    const exists = await db.query.guides.findFirst({ where: eq(guides.slug, slug) });
    if (!exists) return slug;
  }
  return `${base}-${newId()}`;
}

async function touch(guideId: string) {
  const db = await getDb();
  await db.update(guides).set({ updatedAt: new Date() }).where(eq(guides.id, guideId));
}

function revalidateGuide(slug: string) {
  revalidatePath(`/g/${slug}`);
  revalidatePath(`/g/${slug}/edit`);
  revalidatePath("/");
  revalidatePath("/me");
}

export interface DraftPlaceInput {
  name: string;
  providerId?: string | null;
  cityHint?: string;
}

/** Create a guide (optionally with already-resolved places) and go to the editor. */
export async function createGuide(input: { title: string; city?: string; country?: string; places?: DraftPlaceInput[] }): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/create");
  const db = await getDb();
  const title = input.title.trim() || "Untitled guide";
  const known = findCity(input.city);
  const id = newId();
  const slug = await uniqueSlug(title);
  const now = new Date();
  await db.insert(guides).values({
    id,
    ownerId: user.id,
    slug,
    title,
    city: known?.city ?? input.city?.trim() ?? "",
    country: known?.country ?? input.country?.trim() ?? "",
    shareToken: newToken(),
    createdAt: now,
    updatedAt: now,
  });

  const provider = getPlacesProvider();
  let position = 0;
  let derivedCity: { city: string; country: string } | null = null;
  for (const p of input.places ?? []) {
    let resolved: PlaceResult | null = null;
    try {
      if (p.providerId) resolved = await provider.details(p.providerId);
      if (!resolved) resolved = await resolvePlaceByName(p.name, p.cityHint ?? input.city);
    } catch (e) {
      console.warn("[createGuide] resolve failed", e);
    }
    await db.insert(places).values(placeValues(id, position++, p.name, resolved, user.id));
    if (!derivedCity && resolved?.city) derivedCity = { city: resolved.city, country: resolved.country };
  }
  if (!known && derivedCity) {
    await db.update(guides).set({ city: derivedCity.city, country: derivedCity.country }).where(eq(guides.id, id));
  }
  revalidatePath("/me");
  return slug;
}

function placeValues(guideId: string, position: number, fallbackName: string, r: PlaceResult | null, authorId: string): typeof places.$inferInsert {
  return {
    id: newId(),
    guideId,
    position,
    name: r?.name ?? fallbackName,
    address: r?.address ?? "",
    city: r?.city ?? "",
    country: r?.country ?? "",
    lat: r?.lat ?? null,
    lng: r?.lng ?? null,
    category: r?.category ?? "Food & Drinks",
    photoUrl: r?.photoUrl ?? null,
    phone: r?.phone ?? null,
    hoursJson: r?.hours ? JSON.stringify(r.hours) : null,
    googlePlaceId: r?.source === "google" ? r.providerId : r?.providerId ?? null,
    businessStatus: r?.businessStatus ?? null,
    note: "",
    noteAuthorId: authorId,
    createdAt: new Date(),
  };
}

export async function updateGuideMeta(
  guideId: string,
  patch: { title?: string; city?: string; country?: string; description?: string; allowFork?: boolean; coverMediaId?: string | null },
): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  const set: Partial<typeof guides.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title.trim() || guide.title;
  if (patch.city !== undefined) {
    const known = findCity(patch.city);
    set.city = known?.city ?? patch.city.trim();
    if (known && patch.country === undefined) set.country = known.country;
  }
  if (patch.country !== undefined) set.country = patch.country.trim();
  if (patch.description !== undefined) set.description = patch.description.trim();
  if (patch.allowFork !== undefined) set.allowFork = patch.allowFork;
  if (patch.coverMediaId !== undefined) {
    set.coverMediaId = patch.coverMediaId;
    // A cover is either the creator's own photo or an external one, never both.
    set.coverUrl = null;
    set.coverSource = null;
    set.coverCredit = null;
    set.coverCreditUrl = null;
  }
  await db.update(guides).set(set).where(eq(guides.id, guideId));
  revalidateGuide(guide.slug);
}

export type CoverChoice =
  | { kind: "unsplash"; photoId: string }
  | { kind: "google"; placeId: string; ref: string };

export interface CoverResult {
  coverMediaId: null;
  coverUrl: string;
  coverSource: string;
  coverCredit: string;
  coverCreditUrl: string | null;
}

/** Set a guide cover from Unsplash or from a Google Maps photo of one of the guide's places. */
export async function setExternalCover(guideId: string, choice: CoverChoice): Promise<CoverResult> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  let result: CoverResult;
  if (choice.kind === "unsplash") {
    const photo = await claimUnsplashPhoto(choice.photoId);
    if (!photo) throw new Error("That photo isn't available any more. Try another one.");
    result = { coverMediaId: null, coverUrl: photo.url, coverSource: "unsplash", coverCredit: photo.author, coverCreditUrl: photo.authorUrl };
  } else {
    const place = await db.query.places.findFirst({ where: and(eq(places.id, choice.placeId), eq(places.guideId, guide.id)) });
    if (!place?.googlePlaceId) throw new Error("That place isn't in this guide.");
    const photos = await getPlacePhotos(place.googlePlaceId, 10);
    const photo = photos.find((p) => p.ref === choice.ref);
    if (!photo) throw new Error("That photo isn't available any more. Try another one.");
    result = {
      coverMediaId: null,
      coverUrl: `/api/places/photo?ref=${encodeURIComponent(photo.ref)}&w=1600`,
      coverSource: "google",
      coverCredit: photo.author,
      coverCreditUrl: photo.authorUrl,
    };
  }
  await db.update(guides).set({ ...result, updatedAt: new Date() }).where(eq(guides.id, guideId));
  revalidateGuide(guide.slug);
  return result;
}

/** Remove any cover photo and go back to the generated title card. */
export async function clearCover(guideId: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  await db
    .update(guides)
    .set({ coverMediaId: null, coverUrl: null, coverSource: null, coverCredit: null, coverCreditUrl: null, updatedAt: new Date() })
    .where(eq(guides.id, guideId));
  revalidateGuide(guide.slug);
}

export async function publishGuide(guideId: string, visibility: "public" | "private"): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  await db
    .update(guides)
    .set({ visibility, publishedAt: guide.publishedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(guides.id, guideId));
  revalidateGuide(guide.slug);
}

export async function deleteGuide(guideId: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  await db.delete(guides).where(eq(guides.id, guideId));
  revalidatePath("/");
  revalidatePath("/me");
  redirect(`/u/${(await getCurrentUser())!.username}`);
  void guide;
}

/** Add a place by provider id (from autocomplete) or by free-text name. */
export async function addPlace(guideId: string, input: { providerId?: string; name: string; cityHint?: string }): Promise<Place> {
  const { guide, userId } = await requireOwner(guideId);
  const db = await getDb();
  const provider = getPlacesProvider();
  let resolved: PlaceResult | null = null;
  try {
    if (input.providerId) resolved = await provider.details(input.providerId);
    if (!resolved) resolved = await resolvePlaceByName(input.name, input.cityHint ?? guide.city);
  } catch (e) {
    console.warn("[addPlace] resolve failed", e);
  }
  // Newest place goes to the top of the guide, right under the add box.
  const [{ min }] = await db.select({ min: sql<number>`coalesce(min(${places.position}), 1)` }).from(places).where(eq(places.guideId, guideId));
  const values = placeValues(guideId, Number(min) - 1, input.name, resolved, userId);
  await db.insert(places).values(values);
  if (!guide.city && resolved?.city) {
    await db.update(guides).set({ city: resolved.city, country: resolved.country }).where(eq(guides.id, guideId));
  }
  await touch(guideId);
  revalidateGuide(guide.slug);
  const row = await db.query.places.findFirst({ where: eq(places.id, values.id!) });
  return row!;
}

/** Re-point an existing place at a different search result (fixing a mis-match). */
export async function replacePlace(guideId: string, placeId: string, providerId: string): Promise<Place | null> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  const resolved = await getPlacesProvider().details(providerId);
  if (!resolved) return null;
  await db
    .update(places)
    .set({
      name: resolved.name,
      address: resolved.address,
      city: resolved.city,
      country: resolved.country,
      lat: resolved.lat,
      lng: resolved.lng,
      category: resolved.category,
      photoUrl: resolved.photoUrl,
      phone: resolved.phone,
      hoursJson: resolved.hours ? JSON.stringify(resolved.hours) : null,
      googlePlaceId: resolved.providerId,
      businessStatus: resolved.businessStatus,
    })
    .where(and(eq(places.id, placeId), eq(places.guideId, guideId)));
  await touch(guideId);
  revalidateGuide(guide.slug);
  return (await db.query.places.findFirst({ where: eq(places.id, placeId) })) ?? null;
}

export async function updatePlace(
  guideId: string,
  placeId: string,
  patch: { name?: string; note?: string; category?: string; noteClipMediaId?: string | null; photoMediaId?: string | null; special?: string | null },
): Promise<void> {
  const { guide, userId } = await requireOwner(guideId);
  const db = await getDb();
  const set: Partial<typeof places.$inferInsert> = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim();
  if (patch.note !== undefined) {
    set.note = patch.note.trim();
    set.noteAuthorId = userId; // editing a carried-over note makes it yours
  }
  if (patch.category !== undefined && isCategory(patch.category)) set.category = patch.category;
  if (patch.noteClipMediaId !== undefined) {
    set.noteClipMediaId = patch.noteClipMediaId;
    if (patch.noteClipMediaId) set.noteAuthorId = userId;
  }
  if (patch.photoMediaId !== undefined) set.photoMediaId = patch.photoMediaId;
  if (patch.special !== undefined) set.special = patch.special?.trim() || null;
  if (Object.keys(set).length) {
    await db.update(places).set(set).where(and(eq(places.id, placeId), eq(places.guideId, guideId)));
    await touch(guideId);
  }
  revalidateGuide(guide.slug);
}

async function requirePlaceInGuide(guideId: string, placeId: string): Promise<void> {
  const db = await getDb();
  const place = await db.query.places.findFirst({ where: and(eq(places.id, placeId), eq(places.guideId, guideId)) });
  if (!place) throw new Error("That place isn't in this guide.");
}

/** A tip's place must belong to the given guide — throws otherwise (guards against a tipId from another guide). */
async function requireTipInGuide(guideId: string, tipId: string): Promise<PlaceTip> {
  const db = await getDb();
  const tip = await db.query.placeTips.findFirst({ where: eq(placeTips.id, tipId) });
  if (!tip) throw new Error("That tip no longer exists.");
  await requirePlaceInGuide(guideId, tip.placeId);
  return tip;
}

/** Add one expert tip to a place. A place can have as many as the creator wants. */
export async function addPlaceTip(guideId: string, placeId: string, body: string): Promise<PlaceTip> {
  const { guide } = await requireOwner(guideId);
  const text = body.trim();
  if (!text) throw new Error("Tip can't be empty.");
  await requirePlaceInGuide(guideId, placeId);
  const db = await getDb();
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${placeTips.position}), -1)` }).from(placeTips).where(eq(placeTips.placeId, placeId));
  const id = newId();
  await db.insert(placeTips).values({ id, placeId, body: text, position: Number(max) + 1, createdAt: new Date() });
  await touch(guideId);
  revalidateGuide(guide.slug);
  return (await db.query.placeTips.findFirst({ where: eq(placeTips.id, id) }))!;
}

export async function updatePlaceTip(guideId: string, tipId: string, body: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const text = body.trim();
  if (!text) throw new Error("Tip can't be empty.");
  await requireTipInGuide(guideId, tipId);
  const db = await getDb();
  await db.update(placeTips).set({ body: text }).where(eq(placeTips.id, tipId));
  await touch(guideId);
  revalidateGuide(guide.slug);
}

export async function removePlaceTip(guideId: string, tipId: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  await requireTipInGuide(guideId, tipId);
  const db = await getDb();
  await db.delete(placeTips).where(eq(placeTips.id, tipId));
  await touch(guideId);
  revalidateGuide(guide.slug);
}

export async function removePlace(guideId: string, placeId: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  await db.delete(places).where(and(eq(places.id, placeId), eq(places.guideId, guideId)));
  await touch(guideId);
  revalidateGuide(guide.slug);
}

export async function reorderPlaces(guideId: string, orderedIds: string[]): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  await Promise.all(
    orderedIds.map((id, i) => db.update(places).set({ position: i }).where(and(eq(places.id, id), eq(places.guideId, guideId)))),
  );
  await touch(guideId);
  revalidateGuide(guide.slug);
}

/** Copy someone's guide into a private, editable guide of your own. */
export async function forkGuide(guideId: string, shareKey?: string | null): Promise<string> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const source = await getGuideById(guideId);
  if (!source) throw new Error("Guide not found.");
  if (!(await canViewGuide(source, user.id, shareKey))) throw new Error("You don't have access to this guide.");
  if (!source.allowFork) throw new Error("The creator has turned off forking for this guide.");
  if (source.ownerId === user.id) throw new Error("This is already your guide.");

  const sourcePlaces = await db.select().from(places).where(eq(places.guideId, guideId)).orderBy(places.position);
  const id = newId();
  const slug = await uniqueSlug(source.title);
  const now = new Date();
  await db.insert(guides).values({
    id,
    ownerId: user.id,
    slug,
    title: source.title,
    city: source.city,
    country: source.country,
    description: source.description,
    coverMediaId: null,
    visibility: "private",
    allowFork: true,
    forkedFromGuideId: source.id,
    forkedFromUserId: source.ownerId,
    shareToken: newToken(),
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  if (sourcePlaces.length) {
    await db.insert(places).values(
      sourcePlaces.map((p, i) => ({
        ...p,
        id: newId(),
        guideId: id,
        position: i,
        // Carry the original creator's note (and voice clip) with attribution.
        noteAuthorId: p.noteAuthorId ?? source.ownerId,
        createdAt: now,
      })),
    );
  }
  revalidatePath("/me");
  return slug;
}

/** Share a guide with a specific person: creates the share and a notification. */
export async function shareGuideWithUser(guideId: string, username: string): Promise<{ ok: true; user: { username: string; displayName: string } } | { ok: false; error: string }> {
  const { guide, userId } = await requireOwner(guideId);
  const db = await getDb();
  const target = await db.query.users.findFirst({ where: eq(users.username, username.toLowerCase().replace(/^@/, "")) });
  if (!target) return { ok: false, error: "No one with that username yet." };
  if (target.id === userId) return { ok: false, error: "That's you." };
  const existing = await db.query.guideShares.findFirst({ where: and(eq(guideShares.guideId, guideId), eq(guideShares.sharedWithId, target.id)) });
  const now = new Date();
  if (!existing) {
    await db.insert(guideShares).values({ id: newId(), guideId, sharedById: userId, sharedWithId: target.id, createdAt: now });
  }
  await db.insert(notifications).values({ id: newId(), userId: target.id, type: "guide_shared", actorId: userId, guideId, createdAt: now });
  revalidateGuide(guide.slug);
  revalidatePath("/notifications");
  return { ok: true, user: { username: target.username, displayName: target.displayName } };
}

export async function unshareGuideWithUser(guideId: string, targetUserId: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  await db.delete(guideShares).where(and(eq(guideShares.guideId, guideId), eq(guideShares.sharedWithId, targetUserId)));
  revalidateGuide(guide.slug);
}

export async function markNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const db = await getDb();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), sql`${notifications.readAt} is null`));
  revalidatePath("/notifications");
}

export async function deleteMedia(mediaId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const db = await getDb();
  await db.delete(media).where(and(eq(media.id, mediaId), eq(media.ownerId, user.id)));
}

