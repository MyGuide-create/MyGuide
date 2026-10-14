"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guides, placeReactions, placeTips, places, savedPlaces } from "../db/schema";
import { canViewGuide } from "../guides";
import { canViewSharedPlace, spotKey } from "../citySpots";
import { addToStash } from "../myPlaces";
import { addNotifications } from "../notifications";
import { canonicalCity } from "../places/cities";
import { UserError } from "../userError";
import { newId } from "../utils";

/** Someone else's place the viewer can see, with its guide. */
async function visiblePlace(placeId: string, userId: string) {
  const db = await getDb();
  const place = await db.query.places.findFirst({ where: eq(places.id, placeId) });
  if (!place) throw new UserError("That place is gone.", "gone");
  const guide = await db.query.guides.findFirst({ where: eq(guides.id, place.guideId) });
  if (!guide) throw new UserError("That place is gone.", "gone");
  if (guide.ownerId === userId) throw new UserError("That's already your spot.", "invalid");
  const ok = (await canViewGuide(guide, userId)) || (!!place.sharedAt && (await canViewSharedPlace(guide.ownerId, userId)));
  if (!ok) throw new UserError("You can't see that place.", "forbidden");
  return { db, place, guide };
}

/**
 * "Been here" → "Would you recommend it?" → Yes (14 Oct 2026): the spot becomes yours too — a
 * recommended copy in My places with your own words (theirs stay theirs), so the city page shows
 * both of you. The friend hears you went, and it comes off your Want to go list.
 */
export async function vouchForPlace(placeId: string, input: { note?: string; tip?: string }): Promise<{ placeId: string; slug: string; city: string }> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Log in to recommend places.", "auth");
  const { db, place, guide } = await visiblePlace(placeId, user.id);
  const now = new Date();
  const note = (input.note ?? "").trim().slice(0, 5000);
  const tip = (input.tip ?? "").trim().slice(0, 1000);

  await db.insert(placeReactions).values({ userId: user.id, placeId, kind: "been", createdAt: now }).onConflictDoNothing();

  // The place itself (Google's facts), never their words, photos or links.
  const row: typeof places.$inferInsert = {
    id: place.id,
    guideId: "",
    position: 0,
    name: place.name,
    address: place.address,
    area: place.area,
    city: place.city,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    photoUrl: place.photoUrl,
    hoursJson: place.hoursJson,
    googlePlaceId: place.googlePlaceId,
    businessStatus: place.businessStatus,
    phone: place.phone,
    website: place.website,
    sourceCity: place.sourceCity,
    note: "",
    createdAt: now,
  };
  const { stash, pairs } = await addToStash(user.id, [row], { share: true });
  // Added now, or already in My places (then recommend that one).
  let mineId = pairs[0]?.[1];
  if (!mineId) {
    const k = spotKey(place);
    const existing = (await db.select().from(places).where(eq(places.guideId, stash.id))).find((p) => spotKey(p) === k);
    if (!existing) throw new UserError("Couldn't add it. Try again.");
    mineId = existing.id;
    await db.update(places).set({ sharedAt: now }).where(and(eq(places.id, mineId), isNull(places.sharedAt)));
  }
  if (note) await db.update(places).set({ note, noteAuthorId: user.id }).where(eq(places.id, mineId));
  if (tip) await db.insert(placeTips).values({ id: newId(), placeId: mineId, body: tip, position: 0, createdAt: now });

  // Off the Want to go list (this copy of the spot).
  await db.delete(savedPlaces).where(and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId)));

  await addNotifications([{ id: newId(), userId: guide.ownerId, type: "vouched", actorId: user.id, guideId: guide.id, placeId: place.id, note: note || tip || null, createdAt: now }]);

  revalidatePath("/my-places");
  revalidatePath("/saved");
  return { placeId: mineId, slug: stash.slug, city: place.city ? canonicalCity(place.city) : "" };
}

/** "Been here" but not one you'd recommend: just takes it off your Want to go list. */
export async function beenNotForMe(placeId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const db = await getDb();
  await db.delete(savedPlaces).where(and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId)));
  revalidatePath("/saved");
}
