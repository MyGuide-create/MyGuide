"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { savedPlaces } from "../db/schema";

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
