"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { follows, guides, placeReactions, places, savedGuides, savedPlaces, users } from "../db/schema";

/** "You've saved 3 of Sami's spots. Follow Sami?" — after a save, when you don't follow them yet. */
export interface FollowNudge {
  userId: string;
  name: string;
  count: number;
}

/** Save or unsave a place for the signed-in reader. Returns the new state (and a follow nudge). */
export async function toggleSavedPlace(placeId: string): Promise<{ saved: boolean; signedIn: boolean; nudge?: FollowNudge }> {
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
  if (existing) return { saved: false, signedIn: true };
  // Second save from the same person you don't follow → suggest following them (15 Oct 2026).
  const owner = await db
    .select({ id: users.id, name: users.displayName })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .innerJoin(users, eq(users.id, guides.ownerId))
    .where(eq(places.id, placeId))
    .limit(1);
  const o = owner[0];
  if (!o || o.id === user.id) return { saved: true, signedIn: true };
  const already = await db.query.follows.findFirst({ where: and(eq(follows.followerId, user.id), eq(follows.followingId, o.id)) });
  if (already) return { saved: true, signedIn: true };
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(savedPlaces)
    .innerJoin(places, eq(places.id, savedPlaces.placeId))
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(and(eq(savedPlaces.userId, user.id), eq(guides.ownerId, o.id)));
  const count = Number(n);
  return { saved: true, signedIn: true, ...(count >= 2 ? { nudge: { userId: o.id, name: o.name.split(" ")[0], count } } : {}) };
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
