"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { placeReactions, savedGuides, savedPlaces } from "../db/schema";

/** Save or unsave a place for the signed-in reader. Returns the new state. */
export async function toggleSavedPlace(placeId: string): Promise<{ saved: boolean; signedIn: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { saved: false, signedIn: false };
  const db = await getDb();
  const where = and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId));
  const existing = await db.query.savedPlaces.findFirst({ where });
  if (existing) {
    await db.delete(savedPlaces).where(where);
  } else {
    await db.insert(savedPlaces).values({ userId: user.id, placeId, createdAt: new Date() }).onConflictDoNothing();
  }
  revalidatePath("/saved");
  return { saved: !existing, signedIn: true };
}

/** Toggle "Been here" or "Loved it" on a place. */
export async function toggleReaction(placeId: string, kind: "been" | "loved"): Promise<{ on: boolean; signedIn: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { on: false, signedIn: false };
  if (kind !== "been" && kind !== "loved") return { on: false, signedIn: true };
  const db = await getDb();
  const where = and(eq(placeReactions.userId, user.id), eq(placeReactions.placeId, placeId), eq(placeReactions.kind, kind));
  const existing = await db.query.placeReactions.findFirst({ where });
  if (existing) await db.delete(placeReactions).where(where);
  else await db.insert(placeReactions).values({ userId: user.id, placeId, kind, createdAt: new Date() }).onConflictDoNothing();
  return { on: !existing, signedIn: true };
}


/** Save or unsave a whole guide. */
export async function toggleSavedGuide(guideId: string): Promise<{ saved: boolean; signedIn: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { saved: false, signedIn: false };
  const db = await getDb();
  const where = and(eq(savedGuides.userId, user.id), eq(savedGuides.guideId, guideId));
  const existing = await db.query.savedGuides.findFirst({ where });
  if (existing) await db.delete(savedGuides).where(where);
  else await db.insert(savedGuides).values({ userId: user.id, guideId, createdAt: new Date() }).onConflictDoNothing();
  revalidatePath("/saved");
  return { saved: !existing, signedIn: true };
}
