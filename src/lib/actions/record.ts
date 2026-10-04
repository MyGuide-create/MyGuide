"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guides, placePhotos, placeTips, places, type Guide } from "../db/schema";
import { getGuideById } from "../guides";
import { getPlacesProvider, resolvePlaceByName, type PlaceResult } from "../places";
import { findCity } from "../places/cities";
import { notifyPlacesAdded } from "../notify";
import { newId, newToken, slugify } from "../utils";

const STASH_TITLE = "Saved places";

async function uniqueSlug(title: string): Promise<string> {
  const db = await getDb();
  const base = slugify(title) || "guide";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${newId().slice(0, 6)}`;
    const exists = await db.query.guides.findFirst({ where: eq(guides.slug, slug) });
    if (!exists) return slug;
  }
  return `${base}-${newId()}`;
}

/** A private, unpublished guide that holds places recorded on the go until the user files them elsewhere. */
async function findOrCreateStash(userId: string): Promise<Guide> {
  const db = await getDb();
  const existing = await db.query.guides.findFirst({ where: and(eq(guides.ownerId, userId), eq(guides.title, STASH_TITLE)) });
  if (existing) return existing;
  const id = newId();
  const slug = await uniqueSlug(STASH_TITLE);
  const now = new Date();
  await db.insert(guides).values({
    id,
    ownerId: userId,
    slug,
    title: STASH_TITLE,
    description: "Places you've recorded on the go — add them to a guide whenever you're ready.",
    shareToken: newToken(),
    createdAt: now,
    updatedAt: now,
  });
  return (await db.query.guides.findFirst({ where: eq(guides.id, id) }))!;
}

export interface RecordPlaceInput {
  providerId?: string;
  name: string;
  cityHint?: string;
  special: string;
  /** As many expert tips as the person captured. */
  tips: string[];
  photoMediaIds: string[];
  /** Add to this existing guide (must belong to the current user). */
  guideId?: string;
  /** Or start a brand-new guide with this title. */
  newGuideTitle?: string;
  /** Neither set: the place goes into the user's private "Saved places" stash. */
}

/** Finishes the "record a place" flow: resolves the place, files it into a guide, and saves what was captured. */
export async function saveRecordedPlace(input: RecordPlaceInput): Promise<{ guideSlug: string; editing: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/record");
  const db = await getDb();

  let resolved: PlaceResult | null = null;
  try {
    if (input.providerId) resolved = await getPlacesProvider().details(input.providerId);
    if (!resolved) resolved = await resolvePlaceByName(input.name, input.cityHint);
  } catch (e) {
    console.warn("[saveRecordedPlace] resolve failed", e);
  }

  let guide: Guide;
  let editing = false;
  if (input.guideId) {
    const g = await getGuideById(input.guideId);
    if (!g || g.ownerId !== user.id) throw new Error("You can only add to your own guides.");
    guide = g;
  } else if (input.newGuideTitle?.trim()) {
    const known = findCity(resolved?.city || input.cityHint);
    const id = newId();
    const slug = await uniqueSlug(input.newGuideTitle);
    const now = new Date();
    await db.insert(guides).values({
      id,
      ownerId: user.id,
      slug,
      title: input.newGuideTitle.trim(),
      city: known?.city ?? resolved?.city ?? "",
      country: known?.country ?? resolved?.country ?? "",
      shareToken: newToken(),
      createdAt: now,
      updatedAt: now,
    });
    guide = (await db.query.guides.findFirst({ where: eq(guides.id, id) }))!;
    editing = true;
  } else {
    guide = await findOrCreateStash(user.id);
  }

  // Newest place goes to the top of the guide.
  const [{ min }] = await db.select({ min: sql<number>`coalesce(min(${places.position}), 1)` }).from(places).where(eq(places.guideId, guide.id));
  const placeId = newId();
  const now = new Date();
  const liked = input.special.trim();
  const tips = input.tips.map((t) => t.trim()).filter(Boolean);
  await db.insert(places).values({
    id: placeId,
    guideId: guide.id,
    position: Number(min) - 1,
    name: resolved?.name ?? input.name,
    address: resolved?.address ?? "",
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
    googlePlaceId: resolved?.source === "google" ? resolved.providerId : (resolved?.providerId ?? null),
    businessStatus: resolved?.businessStatus ?? null,
    note: liked,
    special: null,
    noteAuthorId: user.id,
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

  await notifyPlacesAdded(guide, placeId, user.id);
  revalidatePath(`/g/${guide.slug}`);
  revalidatePath(`/g/${guide.slug}/edit`);
  revalidatePath("/me");
  return { guideSlug: guide.slug, editing };
}
