import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { follows, notifications, type Guide } from "./db/schema";
import { newId } from "./utils";

const BATCH_WINDOW_MS = 24 * 60 * 60 * 1000;

const isLive = (g: Pick<Guide, "visibility" | "publishedAt">) => g.visibility === "public" && !!g.publishedAt;

async function followerIds(ownerId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followingId, ownerId), eq(follows.status, "accepted")));
  return rows.map((r) => r.id);
}

/** "Hisham published a new guide" — once per follower per guide. */
export async function notifyGuidePublished(guide: Guide): Promise<void> {
  if (!isLive(guide)) return;
  try {
    const ids = await followerIds(guide.ownerId);
    if (!ids.length) return;
    const db = await getDb();
    const already = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.guideId, guide.id), eq(notifications.type, "guide_published"), inArray(notifications.userId, ids)));
    const done = new Set(already.map((r) => r.userId));
    const now = new Date();
    const rows = ids
      .filter((id) => !done.has(id))
      .map((userId) => ({ id: newId(), userId, type: "guide_published", actorId: guide.ownerId, guideId: guide.id, createdAt: now }));
    if (rows.length) await db.insert(notifications).values(rows);
  } catch (e) {
    console.warn("[notifyGuidePublished]", e);
  }
}

/**
 * "Hisham added 3 places to Bali" — batched: while a follower hasn't read it,
 * further additions within a day bump the same notification instead of adding new ones.
 * Skipped for followers who still have an unread "new guide" notification for it.
 */
export async function notifyPlacesAdded(guide: Guide, placeId: string, n = 1): Promise<void> {
  if (!isLive(guide)) return;
  try {
    const ids = await followerIds(guide.ownerId);
    if (!ids.length) return;
    const db = await getDb();
    const since = new Date(Date.now() - BATCH_WINDOW_MS);
    const open = await db
      .select({ id: notifications.id, userId: notifications.userId, type: notifications.type, count: notifications.count })
      .from(notifications)
      .where(
        and(
          eq(notifications.guideId, guide.id),
          inArray(notifications.type, ["places_added", "guide_published"]),
          inArray(notifications.userId, ids),
          isNull(notifications.readAt),
          gt(notifications.createdAt, since),
        ),
      );
    const now = new Date();
    const fresh: (typeof notifications.$inferInsert)[] = [];
    for (const userId of ids) {
      const mine = open.filter((o) => o.userId === userId);
      if (mine.some((o) => o.type === "guide_published")) continue;
      const batch = mine.find((o) => o.type === "places_added");
      if (batch) {
        await db.update(notifications).set({ count: batch.count + n, placeId, createdAt: now }).where(eq(notifications.id, batch.id));
      } else {
        fresh.push({ id: newId(), userId, type: "places_added", actorId: guide.ownerId, guideId: guide.id, placeId, count: n, createdAt: now });
      }
    }
    if (fresh.length) await db.insert(notifications).values(fresh);
  } catch (e) {
    console.warn("[notifyPlacesAdded]", e);
  }
}
