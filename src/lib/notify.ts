import { and, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { adminUsernames } from "./admin";
import { getDb } from "./db";
import { blocks, follows, guideCollaborators, notifications, users, type Guide } from "./db/schema";
import { addNotifications } from "./notifications";
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

/** Owner + co-editors: they're working on the guide, so they don't get follower updates about it. */
async function teamIds(guide: Pick<Guide, "id" | "ownerId">): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select({ id: guideCollaborators.userId }).from(guideCollaborators).where(eq(guideCollaborators.guideId, guide.id));
  return new Set([guide.ownerId, ...rows.map((r) => r.id)]);
}

/** "Hisham published a new guide" — once per follower per guide. */
export async function notifyGuidePublished(guide: Guide): Promise<void> {
  if (!isLive(guide)) return;
  try {
    const team = await teamIds(guide);
    const ids = (await followerIds(guide.ownerId)).filter((id) => !team.has(id));
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
    if (rows.length) await addNotifications(rows);
  } catch (e) {
    console.warn("[notifyGuidePublished]", e);
  }
}

/**
 * "Hisham added 3 places to Bali" — batched: while a follower hasn't read it,
 * further additions within a day bump the same notification instead of adding new ones.
 * Skipped for followers who still have an unread "new guide" notification for it.
 */
export async function notifyPlacesAdded(guide: Guide, placeId: string, actorId: string, n = 1): Promise<void> {
  if (!isLive(guide)) return;
  try {
    // Credit whoever actually added it (a co-editor, not always the owner), and never tell
    // the guide's own team — including the person who just added it.
    const team = await teamIds(guide);
    const ids = (await followerIds(guide.ownerId)).filter((id) => !team.has(id) && id !== actorId);
    if (!ids.length) return;
    const db = await getDb();
    const since = new Date(Date.now() - BATCH_WINDOW_MS);
    const open = await db
      .select({ id: notifications.id, userId: notifications.userId, type: notifications.type, count: notifications.count, actorId: notifications.actorId })
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
      const batch = mine.find((o) => o.type === "places_added" && o.actorId === actorId);
      if (batch) {
        await db.update(notifications).set({ count: batch.count + n, placeId, createdAt: now }).where(eq(notifications.id, batch.id));
      } else {
        fresh.push({ id: newId(), userId, type: "places_added", actorId, guideId: guide.id, placeId, count: n, createdAt: now });
      }
    }
    if (fresh.length) await addNotifications(fresh);
  } catch (e) {
    console.warn("[notifyPlacesAdded]", e);
  }
}

/**
 * While the pilot is small, everyone hears when someone new joins. Above this many members,
 * only admins do (and, once invite links exist, the person who invited them).
 */
export function joinAlertCap(): number {
  const n = Number(process.env.JOIN_ALERTS_MAX_USERS);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

/**
 * "Lina K. just joined MyGuide" — to admins (ADMIN_USERNAMES) always, and to every existing member
 * while there are at most joinAlertCap() members. Never to anyone who has blocked the new person
 * (or whom they've blocked). Call once, right after the account is created.
 */
export async function notifyUserJoined(newUserId: string): Promise<void> {
  try {
    const db = await getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users);
    const everyone = Number(n) <= joinAlertCap();
    const admins = adminUsernames();
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          ne(users.id, newUserId),
          everyone ? undefined : admins.length ? inArray(sql`lower(${users.username})`, admins) : sql`0`,
        ),
      );
    if (!recipients.length) return;
    const blocked = await db
      .select({ a: blocks.blockerId, b: blocks.blockedId })
      .from(blocks)
      .where(or(eq(blocks.blockerId, newUserId), eq(blocks.blockedId, newUserId)));
    const hidden = new Set(blocked.map((r) => (r.a === newUserId ? r.b : r.a)));
    const now = new Date();
    const rows = recipients
      .filter((r) => !hidden.has(r.id))
      .map((r) => ({ id: newId(), userId: r.id, type: "user_joined", actorId: newUserId, createdAt: now }));
    if (rows.length) await addNotifications(rows);
  } catch (e) {
    console.warn("[notifyUserJoined]", e);
  }
}
