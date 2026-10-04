"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guideCollaborators, guideShares, guides, media, notifications, placeComments, placeLocations, placePhotos, placeTips, places, users, type Guide, type Place, type PlaceLocation, type PlaceTip } from "../db/schema";
import { canViewGuide, getGuideById, isCollaborator } from "../guides";
import { notifyGuidePublished, notifyPlacesAdded } from "../notify";
import { getPlacesProvider, isCategory, resolvePlaceByName, type PlaceResult } from "../places";
import { findCity } from "../places/cities";
import { getPlacePhotos, reverseGeocode } from "../places/google";
import { validPin } from "../places/pins";
import type { BranchCandidate } from "../places/branches";
import { claimUnsplashPhoto } from "../covers/unsplash";
import { mapLimit, newId, newToken, slugify } from "../utils";
import { addNotifications } from "../notifications";
import { copyBranches, notifyGuideUsed } from "../reuse";
import { normaliseInstagram, normaliseReserve, normaliseWebsite, normaliseWhatsapp, type Normalised } from "@/lib/placeLinks";

/** Owner or invited co-editor. Use for editing places, notes, tips and guide details. */
async function requireOwner(guideId: string): Promise<{ guide: Guide; userId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in.");
  const guide = await getGuideById(guideId);
  if (!guide) throw new Error("That guide no longer exists.");
  if (guide.ownerId !== user.id && !(await isCollaborator(guide.id, user.id))) throw new Error("You can only edit your own guides.");
  return { guide, userId: user.id };
}

/** The guide's owner only: publishing, deleting, sharing and managing co-editors. */
async function requireTrueOwner(guideId: string): Promise<{ guide: Guide; userId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in.");
  const guide = await getGuideById(guideId);
  if (!guide || guide.ownerId !== user.id) throw new Error("Only the guide's creator can do that.");
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
  /** A dropped pin (no Google listing), e.g. a Google Maps list place we couldn't match. */
  pin?: { lat: number; lng: number; address?: string } | null;
  /** "Description - What Makes It Special", e.g. the note from a Google Maps list. */
  note?: string;
}

/** Google lookups in flight at once while creating a guide (big imported lists have 100+ places). */
const CREATE_CONCURRENCY = 6;

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
  const rows = await mapLimit(input.places ?? [], CREATE_CONCURRENCY, async (p, position) => {
    const name = p.name.trim().slice(0, 120) || "Unnamed place";
    const note = (p.note ?? "").trim().slice(0, 5000);
    if (p.pin && validPin(p.pin.lat, p.pin.lng)) {
      const where = await reverseGeocode(p.pin.lat, p.pin.lng).catch(() => null);
      return {
        ...placeValues(id, position, name, null, user.id),
        address: p.pin.address?.trim().slice(0, 300) || where?.area || "",
        city: where?.city ?? known?.city ?? "",
        country: where?.country ?? known?.country ?? "",
        lat: p.pin.lat,
        lng: p.pin.lng,
        category: "Scenic Spots",
        note,
      };
    }
    let resolved: PlaceResult | null = null;
    try {
      if (p.providerId) resolved = await provider.details(p.providerId);
      if (!resolved) resolved = await resolvePlaceByName(name, p.cityHint ?? input.city);
    } catch (e) {
      console.warn("[createGuide] resolve failed", e);
    }
    return { ...placeValues(id, position, name, resolved, user.id), note };
  });
  // Insert in chunks to keep each statement a reasonable size.
  for (let i = 0; i < rows.length; i += 50) await db.insert(places).values(rows.slice(i, i + 50));
  // If the guide city was unknown, borrow it from the first place (in list order) that has one.
  const derivedCity = rows.find((r) => r.city);
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
    website: r?.website ?? null,
    instagram: r?.instagram ?? null,
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
  const { guide } = await requireTrueOwner(guideId);
  const db = await getDb();
  await db
    .update(guides)
    .set({ visibility, publishedAt: guide.publishedAt ?? new Date(), verifiedAt: guide.verifiedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(guides.id, guideId));
  // Tell followers the first time a guide goes public (re-publishing doesn't ping again).
  if (visibility === "public") {
    const fresh = await getGuideById(guideId);
    if (fresh) await notifyGuidePublished(fresh);
  }
  revalidateGuide(guide.slug);
}

/**
 * Back to drafts: hides the guide from the feed, search and the owner's public profile until
 * it's published again. Followers who were already told about it aren't told again on re-publish
 * (notifyGuidePublished is once per follower per guide).
 */
export async function unpublishGuide(guideId: string): Promise<void> {
  const { guide } = await requireTrueOwner(guideId);
  const db = await getDb();
  await db.update(guides).set({ publishedAt: null, updatedAt: new Date() }).where(eq(guides.id, guideId));
  revalidateGuide(guide.slug);
}

export async function deleteGuide(guideId: string): Promise<void> {
  const { guide } = await requireTrueOwner(guideId);
  const db = await getDb();
  await db.delete(guides).where(eq(guides.id, guideId));
  revalidatePath("/");
  revalidatePath("/me");
  redirect(`/u/${(await getCurrentUser())!.username}`);
  void guide;
}

/**
 * Add a place that has no Google listing by dropping a pin (a sunset spot, a campsite…).
 * Stored with coordinates and no Google place id; city/area come from reverse geocoding when available.
 */
export async function addPinnedPlace(guideId: string, input: { name: string; lat: number; lng: number; category?: string }): Promise<Place> {
  const { guide, userId } = await requireOwner(guideId);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Give the spot a name.");
  if (!validPin(input.lat, input.lng)) throw new Error("That pin isn't on the map.");
  const db = await getDb();
  const where = await reverseGeocode(input.lat, input.lng);
  const [{ min }] = await db.select({ min: sql<number>`coalesce(min(${places.position}), 1)` }).from(places).where(eq(places.guideId, guideId));
  const values: typeof places.$inferInsert = {
    ...placeValues(guideId, Number(min) - 1, name, null, userId),
    address: where?.area ?? "",
    city: where?.city ?? guide.city,
    country: where?.country ?? guide.country,
    lat: input.lat,
    lng: input.lng,
    category: isCategory(input.category) ? input.category : "Scenic Spots",
  };
  await db.insert(places).values(values);
  if (!guide.city && where?.city) {
    await db.update(guides).set({ city: where.city, country: where.country }).where(eq(guides.id, guideId));
  }
  await touch(guideId);
  await notifyPlacesAdded(guide, values.id!, userId);
  revalidateGuide(guide.slug);
  return (await db.query.places.findFirst({ where: eq(places.id, values.id!) }))!;
}

/** Turn an existing place into a dropped pin (e.g. it couldn't be matched, or Google has it in the wrong spot). */
export async function setPlacePin(guideId: string, placeId: string, input: { lat: number; lng: number }): Promise<Place> {
  const { guide } = await requireOwner(guideId);
  if (!validPin(input.lat, input.lng)) throw new Error("That pin isn't on the map.");
  const db = await getDb();
  const where = await reverseGeocode(input.lat, input.lng);
  await db
    .update(places)
    .set({
      lat: input.lat,
      lng: input.lng,
      googlePlaceId: null,
      businessStatus: null,
      hoursJson: null,
      address: where?.area ?? "",
      ...(where?.city ? { city: where.city, country: where.country } : {}),
    })
    .where(and(eq(places.id, placeId), eq(places.guideId, guideId)));
  await touch(guideId);
  revalidateGuide(guide.slug);
  return (await db.query.places.findFirst({ where: eq(places.id, placeId) }))!;
}

/* ---------------------------------------------------------------------------
 * Branches: one guide entry with several locations (a café with four branches).
 * ------------------------------------------------------------------------- */

async function getPlaceInGuide(guideId: string, placeId: string): Promise<Place> {
  const db = await getDb();
  const p = await db.query.places.findFirst({ where: and(eq(places.id, placeId), eq(places.guideId, guideId)) });
  if (!p) throw new Error("That place isn't in this guide any more.");
  return p;
}

async function listBranches(placeId: string): Promise<PlaceLocation[]> {
  const db = await getDb();
  return db.select().from(placeLocations).where(eq(placeLocations.placeId, placeId)).orderBy(placeLocations.position, placeLocations.createdAt);
}

export interface BranchSuggestion extends BranchCandidate {
  /** This branch is already a separate entry in the guide — adding it merges that entry in. */
  existingPlaceId?: string;
}

/** Other listings with the same name near the place, minus the ones already added. */
export async function findBranches(guideId: string, placeId: string): Promise<BranchSuggestion[]> {
  await requireOwner(guideId);
  const place = await getPlaceInGuide(guideId, placeId);
  if (!place.googlePlaceId || place.lat == null || place.lng == null) return [];
  const db = await getDb();
  let found: BranchCandidate[] = [];
  try {
    found = await getPlacesProvider().branches(place.name, { lat: place.lat, lng: place.lng });
  } catch (e) {
    console.warn("[findBranches]", e);
    return [];
  }
  const have = new Set([place.googlePlaceId, ...(await listBranches(placeId)).map((b) => b.googlePlaceId)].filter(Boolean));
  const others = await db.select({ id: places.id, googlePlaceId: places.googlePlaceId }).from(places).where(eq(places.guideId, guideId));
  const inGuide = new Map(others.filter((o) => o.id !== placeId && o.googlePlaceId).map((o) => [o.googlePlaceId!, o.id]));
  return found
    .filter((b) => !have.has(b.providerId))
    .slice(0, 12)
    .map((b) => ({ ...b, existingPlaceId: inGuide.get(b.providerId) }));
}

/**
 * Add branches by Google id (ticked suggestions or a search pick), or one dropped pin.
 * A branch that's already its own entry in this guide is merged in: its description is appended,
 * its tips, photos and comments move over, and the separate entry is removed.
 */
export async function addBranches(
  guideId: string,
  placeId: string,
  input: { providerIds?: string[]; pin?: { name: string; lat: number; lng: number } },
): Promise<{ branches: PlaceLocation[]; mergedPlaceIds: string[]; note: string }> {
  const { guide } = await requireOwner(guideId);
  const place = await getPlaceInGuide(guideId, placeId);
  const db = await getDb();
  const existing = await listBranches(placeId);
  const have = new Set([place.googlePlaceId, ...existing.map((b) => b.googlePlaceId)].filter(Boolean));
  let position = existing.reduce((m, b) => Math.max(m, b.position + 1), 0);
  const now = new Date();
  const rows: (typeof placeLocations.$inferInsert)[] = [];
  const mergedPlaceIds: string[] = [];
  let note = place.note;

  if (input.pin) {
    if (!validPin(input.pin.lat, input.pin.lng)) throw new Error("That pin isn't on the map.");
    const where = await reverseGeocode(input.pin.lat, input.pin.lng);
    rows.push({ id: newId(), placeId, name: input.pin.name.trim().slice(0, 120) || place.name, address: where?.area ?? "", lat: input.pin.lat, lng: input.pin.lng, googlePlaceId: null, position: position++, createdAt: now });
  }

  const provider = getPlacesProvider();
  for (const pid of [...new Set(input.providerIds ?? [])].slice(0, 20)) {
    if (have.has(pid)) continue;
    have.add(pid);
    const dup = await db.query.places.findFirst({ where: and(eq(places.guideId, guideId), eq(places.googlePlaceId, pid)) });
    if (dup && dup.id !== placeId && dup.lat != null && dup.lng != null) {
      rows.push({ id: newId(), placeId, name: dup.name, address: dup.address, lat: dup.lat, lng: dup.lng, googlePlaceId: pid, phone: dup.phone, hoursJson: dup.hoursJson, position: position++, createdAt: now });
      const extra = dup.note.trim();
      if (extra && !note.includes(extra)) note = note.trim() ? `${note.trim()}\n\n${extra}` : extra;
      await db.update(placeTips).set({ placeId }).where(eq(placeTips.placeId, dup.id));
      await db.update(placePhotos).set({ placeId }).where(eq(placePhotos.placeId, dup.id));
      await db.update(placeComments).set({ placeId }).where(eq(placeComments.placeId, dup.id));
      await db.update(placeLocations).set({ placeId }).where(eq(placeLocations.placeId, dup.id));
      await db.delete(places).where(eq(places.id, dup.id));
      mergedPlaceIds.push(dup.id);
      continue;
    }
    let r: PlaceResult | null = null;
    try {
      r = await provider.details(pid);
    } catch (e) {
      console.warn("[addBranches] details failed", e);
    }
    if (!r) continue;
    rows.push({
      id: newId(),
      placeId,
      name: r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      googlePlaceId: r.source === "google" || r.source === "mock" ? r.providerId : null,
      phone: r.phone,
      hoursJson: r.hours ? JSON.stringify(r.hours) : null,
      position: position++,
      createdAt: now,
    });
  }
  if (rows.length) await db.insert(placeLocations).values(rows);
  if (note !== place.note) await db.update(places).set({ note }).where(eq(places.id, placeId));
  await touch(guideId);
  revalidateGuide(guide.slug);
  return { branches: await listBranches(placeId), mergedPlaceIds, note };
}

export async function removeBranch(guideId: string, locationId: string): Promise<void> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  const loc = await db.query.placeLocations.findFirst({ where: eq(placeLocations.id, locationId) });
  if (!loc) return;
  await getPlaceInGuide(guideId, loc.placeId);
  await db.delete(placeLocations).where(eq(placeLocations.id, locationId));
  await touch(guideId);
  revalidateGuide(guide.slug);
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
  await notifyPlacesAdded(guide, values.id!, userId);
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
      website: resolved.website,
      // Keep a handle the creator typed; only fill it from Google when empty.
      instagram: sql`coalesce(${places.instagram}, ${resolved.instagram})`,
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
  patch: {
    name?: string;
    note?: string;
    category?: string;
    noteClipMediaId?: string | null;
    photoMediaId?: string | null;
    special?: string | null;
    website?: string | null;
    instagram?: string | null;
    whatsapp?: string | null;
    reserveUrl?: string | null;
  },
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
  if (patch.website !== undefined || patch.instagram !== undefined || patch.whatsapp !== undefined || patch.reserveUrl !== undefined) {
    const current = await db.query.places.findFirst({ where: and(eq(places.id, placeId), eq(places.guideId, guideId)), columns: { country: true } });
    const take = (r: Normalised): string | null => {
      if (!r.ok) throw new Error(r.error);
      return r.value;
    };
    if (patch.website !== undefined) set.website = take(normaliseWebsite(patch.website));
    if (patch.instagram !== undefined) set.instagram = take(normaliseInstagram(patch.instagram));
    if (patch.whatsapp !== undefined) set.whatsapp = take(normaliseWhatsapp(patch.whatsapp, current?.country));
    if (patch.reserveUrl !== undefined) set.reserveUrl = take(normaliseReserve(patch.reserveUrl));
  }
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
    const newIds = sourcePlaces.map(() => newId());
    await db.insert(places).values(
      sourcePlaces.map((p, i) => ({
        ...p,
        id: newIds[i],
        guideId: id,
        position: i,
        // Carry the original creator's note (and voice clip) with attribution.
        noteAuthorId: p.noteAuthorId ?? source.ownerId,
        createdAt: now,
      })),
    );
    await copyBranches(sourcePlaces.map((p, i) => [p.id, newIds[i]]));
  }
  await notifyGuideUsed(source, user.id, sourcePlaces.length);
  revalidatePath("/me");
  return slug;
}

/** Share a guide with a specific person: creates the share and a notification. */
export async function shareGuideWithUser(guideId: string, username: string): Promise<{ ok: true; user: { username: string; displayName: string } } | { ok: false; error: string }> {
  const { guide, userId } = await requireTrueOwner(guideId);
  const db = await getDb();
  const target = await db.query.users.findFirst({ where: eq(users.username, username.toLowerCase().replace(/^@/, "")) });
  if (!target) return { ok: false, error: "No one with that username yet." };
  if (target.id === userId) return { ok: false, error: "That's you." };
  const existing = await db.query.guideShares.findFirst({ where: and(eq(guideShares.guideId, guideId), eq(guideShares.sharedWithId, target.id)) });
  const now = new Date();
  if (!existing) {
    await db.insert(guideShares).values({ id: newId(), guideId, sharedById: userId, sharedWithId: target.id, createdAt: now });
  }
  await addNotifications([{ id: newId(), userId: target.id, type: "guide_shared", actorId: userId, guideId, createdAt: now }]);
  revalidateGuide(guide.slug);
  revalidatePath("/notifications");
  return { ok: true, user: { username: target.username, displayName: target.displayName } };
}

export async function unshareGuideWithUser(guideId: string, targetUserId: string): Promise<void> {
  const { guide } = await requireTrueOwner(guideId);
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



/** Owner invites someone (by username) to edit the guide with them. */
export async function addCollaborator(guideId: string, username: string): Promise<{ ok: true; user: { id: string; username: string; displayName: string; avatarMediaId: string | null } } | { ok: false; error: string }> {
  const { guide, userId } = await requireTrueOwner(guideId);
  const db = await getDb();
  const target = await db.query.users.findFirst({ where: eq(users.username, username.replace(/^@/, "").toLowerCase()) });
  if (!target) return { ok: false, error: "No one with that username." };
  if (target.id === userId) return { ok: false, error: "You already own this guide." };
  await db.insert(guideCollaborators).values({ guideId, userId: target.id, createdAt: new Date() }).onConflictDoNothing();
  await addNotifications([{ id: newId(), userId: target.id, type: "collab_invite", actorId: userId, guideId, createdAt: new Date() }]);
  revalidateGuide(guide.slug);
  return { ok: true, user: { id: target.id, username: target.username, displayName: target.displayName, avatarMediaId: target.avatarMediaId } };
}

export async function removeCollaborator(guideId: string, collaboratorId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in.");
  const guide = await getGuideById(guideId);
  if (!guide) return;
  // The owner can remove anyone; a co-editor can remove themselves ("Leave").
  if (guide.ownerId !== user.id && collaboratorId !== user.id) throw new Error("Only the guide's creator can do that.");
  const db = await getDb();
  await db.delete(guideCollaborators).where(and(eq(guideCollaborators.guideId, guideId), eq(guideCollaborators.userId, collaboratorId)));
  revalidateGuide(guide.slug);
}


/** "Checked today": the creator (or a co-editor) confirms the guide is still accurate. */
export async function markGuideVerified(guideId: string): Promise<Date> {
  const { guide } = await requireOwner(guideId);
  const db = await getDb();
  const now = new Date();
  await db.update(guides).set({ verifiedAt: now }).where(eq(guides.id, guideId));
  revalidateGuide(guide.slug);
  return now;
}
