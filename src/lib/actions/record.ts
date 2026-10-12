"use server";

import { UserError } from "../userError";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guides, placePhotos, placeTips, places, type Guide } from "../db/schema";
import { findOrCreateStash, findStash, loadMyPlaces, unguidedByCity } from "../myPlaces";
import { canonicalCity } from "../places/cities";
import { getGuideById } from "../guides";
import { getPlacesProvider, isCategory, resolvePlaceByName, type PlaceResult } from "../places";
import { reverseGeocode } from "../places/google";
import { validPin } from "../places/pins";
import { notifyPlacesAdded } from "../notify";
import { fileSavedPlaces } from "./fileSaved";
import { citySpots, spotKey } from "../citySpots";
import { settleGuides } from "../settleCities";
import { newId } from "../utils";

export interface RecordPlaceInput {
  providerId?: string;
  /** A dropped pin for a spot with no Google listing (skips the Google lookup). */
  pin?: { lat: number; lng: number; category?: string };
  name: string;
  cityHint?: string;
  special: string;
  /** As many expert tips as the person captured. */
  tips: string[];
  photoMediaIds: string[];
  /** Opened from one of your guides (/record?guide=): straight into that guide (must be yours). */
  guideId?: string;
  /** Otherwise it goes into My places. Recommend it, so it shows on the city page (Save & recommend). */
  share?: boolean;
}

/** Finishes the "record a place" flow: resolves the place, files it into a guide, and saves what was captured. */
export interface RecordedPlace {
  guideSlug: string;
  /** Saved into a guide it was opened from (not My places). */
  intoGuide: boolean;
  placeId: string;
  name: string;
  /** The place's city, tidied ("" when unknown). */
  city: string;
  shared: boolean;
  /** Places in My places in this city that aren't in any of your guides yet (for the nudge). */
  unguided: number;
  /** Spots you recommend in this city (for "Send Tomás your N Kyoto spots"). */
  recommended: number;
}

export async function saveRecordedPlace(input: RecordPlaceInput): Promise<RecordedPlace> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/record");
  const db = await getDb();

  let resolved: PlaceResult | null = null;
  if (input.pin) {
    if (!validPin(input.pin.lat, input.pin.lng)) throw new UserError("That pin isn't on the map.", "invalid");
    const where = await reverseGeocode(input.pin.lat, input.pin.lng);
    resolved = {
      providerId: "",
      name: input.name.trim().slice(0, 120) || "Pinned spot",
      address: where?.area ?? "",
      area: where?.hood ?? "",
      city: where?.city ?? "",
      country: where?.country ?? "",
      lat: input.pin.lat,
      lng: input.pin.lng,
      category: isCategory(input.pin.category) ? input.pin.category : "Scenic Spots",
      photoUrl: null,
      photoUrls: [],
      phone: null,
      website: null,
      instagram: null,
      hours: null,
      businessStatus: null,
      source: "pin",
    };
  } else try {
    if (input.providerId) resolved = await getPlacesProvider().details(input.providerId);
    if (!resolved) resolved = await resolvePlaceByName(input.name, input.cityHint);
  } catch (e) {
    console.warn("[saveRecordedPlace] resolve failed", e);
  }

  let guide: Guide;
  let toStash = false;
  if (input.guideId) {
    const g = await getGuideById(input.guideId);
    if (!g || g.ownerId !== user.id) throw new UserError("You can only add to your own guides.", "forbidden");
    guide = g;
  } else {
    guide = await findOrCreateStash(user.id);
    toStash = true;
  }

  const now = new Date();
  const liked = input.special.trim();
  const tips = input.tips.map((t) => t.trim()).filter(Boolean);
  // The area the place ends up in (settled below: a North Vancouver café counts as Vancouver).
  let cityOut = resolved?.city?.trim() ? canonicalCity(resolved.city) : "";
  const unguidedIn = async () => (toStash && cityOut ? (unguidedByCity((await loadMyPlaces(user.id)).items).get(cityOut)?.length ?? 0) : 0);
  const recommendedIn = async () => (toStash && cityOut ? (await citySpots({ city: cityOut, viewerId: user.id, ownerIds: [user.id] })).length : 0);

  // Already in My places (added twice): update that one instead of keeping two — new words win, tips and photos add up.
  if (toStash && resolved) {
    const key = spotKey({ googlePlaceId: resolved.providerId || null, name: resolved.name, lat: resolved.lat ?? null, lng: resolved.lng ?? null });
    const same = (await db.select().from(places).where(eq(places.guideId, guide.id))).find((p) => spotKey(p) === key);
    if (same) {
      if (same.city.trim()) cityOut = canonicalCity(same.city);
      const [{ n: tipCount }] = await db.select({ n: sql<number>`count(*)` }).from(placeTips).where(eq(placeTips.placeId, same.id));
      const [{ n: photoCount }] = await db.select({ n: sql<number>`count(*)` }).from(placePhotos).where(eq(placePhotos.placeId, same.id));
      await db
        .update(places)
        .set({
          ...(liked ? { note: liked, noteAuthorId: user.id } : {}),
          ...(input.share && !same.sharedAt ? { sharedAt: now } : {}),
          ...(!same.photoMediaId && input.photoMediaIds[0] ? { photoMediaId: input.photoMediaIds[0] } : {}),
        })
        .where(eq(places.id, same.id));
      if (tips.length) await db.insert(placeTips).values(tips.map((body, i) => ({ id: newId(), placeId: same.id, body, position: Number(tipCount) + i, createdAt: now })));
      if (input.photoMediaIds.length) await db.insert(placePhotos).values(input.photoMediaIds.map((mediaId, i) => ({ id: newId(), placeId: same.id, mediaId, position: Number(photoCount) + i, createdAt: now })));
      revalidatePath("/my-places");
      return { guideSlug: guide.slug, intoGuide: false, placeId: same.id, name: same.name, city: cityOut, shared: !!input.share || !!same.sharedAt, unguided: await unguidedIn(), recommended: await recommendedIn() };
    }
  }

  // Newest place goes to the top of the guide.
  const [{ min }] = await db.select({ min: sql<number>`coalesce(min(${places.position}), 1)` }).from(places).where(eq(places.guideId, guide.id));
  const placeId = newId();
  await db.insert(places).values({
    id: placeId,
    guideId: guide.id,
    position: Number(min) - 1,
    name: resolved?.name ?? input.name,
    address: resolved?.address ?? "",
    area: resolved?.area ?? "",
    city: resolved?.city ?? "",
    country: resolved?.country ?? "",
    lat: resolved?.lat ?? null,
    lng: resolved?.lng ?? null,
    category: resolved?.category ?? "Food & Drinks",
    photoUrl: resolved?.photoUrl ?? null,
    photoMediaId: input.photoMediaIds[0] ?? null,
    phone: resolved?.phone ?? null,
    website: resolved?.website ?? null,
    instagram: resolved?.instagram ?? null,
    hoursJson: resolved?.hours ? JSON.stringify(resolved.hours) : null,
    googlePlaceId: resolved?.providerId || null,
    businessStatus: resolved?.businessStatus ?? null,
    note: liked,
    special: null,
    noteAuthorId: user.id,
    sharedAt: toStash && input.share ? now : null,
    createdAt: now,
  });
  if (input.photoMediaIds.length) {
    await db.insert(placePhotos).values(input.photoMediaIds.map((mediaId, i) => ({ id: newId(), placeId, mediaId, position: i, createdAt: now })));
  }
  if (tips.length) {
    await db.insert(placeTips).values(tips.map((body, i) => ({ id: newId(), placeId, body, position: i, createdAt: now })));
  }
  if (!guide.city && resolved?.city) {
    await db.update(guides).set({ city: resolved.city, country: resolved.country, updatedAt: now }).where(eq(guides.id, guide.id));
  } else {
    await db.update(guides).set({ updatedAt: now }).where(eq(guides.id, guide.id));
  }

  await settleGuides(db, [guide.id]);
  const settled = await db.query.places.findFirst({ where: eq(places.id, placeId) });
  if (settled?.city.trim()) cityOut = canonicalCity(settled.city);
  await notifyPlacesAdded(guide, placeId, user.id);
  revalidatePath(`/g/${guide.slug}`);
  revalidatePath(`/g/${guide.slug}/edit`);
  revalidatePath("/me");
  revalidatePath("/my-places");
  return { guideSlug: guide.slug, intoGuide: !toStash, placeId, name: resolved?.name ?? input.name, city: cityOut, shared: toStash && !!input.share, unguided: await unguidedIn(), recommended: await recommendedIn() };
}

/** Recommend (or stop recommending) places in My places, so they show on their city's page. */
export async function setPlacesShared(placeIds: string[], shared: boolean): Promise<number> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Sign in first.", "auth");
  const ids = [...new Set(placeIds)].slice(0, 500);
  if (!ids.length) return 0;
  const db = await getDb();
  const stash = await findStash(user.id);
  if (!stash) return 0;
  const res = await db
    .update(places)
    .set({ sharedAt: shared ? new Date() : null })
    .where(and(eq(places.guideId, stash.id), inArray(places.id, ids)));
  revalidatePath("/my-places");
  revalidatePath("/city");
  return res.rowsAffected ?? ids.length;
}

/**
 * Done screen → "Put it in a guide": copy a place from My places into one of your guides (or a new
 * one, title required). It stays in My places.
 */
export async function putPlaceInGuide(placeId: string, target: { guideId: string } | { newTitle: string }): Promise<{ slug: string; created: boolean; already: boolean }> {
  const res = await fileSavedPlaces({ placeIds: [placeId], keepCopy: true, ...target });
  return { slug: res.slug, created: res.created, already: res.already > 0 };
}
