import { and, eq } from "drizzle-orm";
import { hiddenUserIds } from "./blocks";
import { getDb } from "./db";
import { follows, users } from "./db/schema";
import { addNotifications } from "./notifications";
import { newId } from "./utils";

export type FollowStatus = "none" | "pending" | "accepted";

/**
 * Make `followerId` follow `targetId` (or send a request if the target is private).
 * Idempotent: if they already follow / already asked, nothing changes and the current status comes back.
 * Not a server action — callers must have authenticated `followerId` themselves.
 */
export async function startFollowing(followerId: string, targetId: string): Promise<FollowStatus> {
  if (followerId === targetId) return "none";
  if ((await hiddenUserIds(followerId)).has(targetId)) return "none";
  const db = await getDb();
  const existing = await db.query.follows.findFirst({ where: and(eq(follows.followerId, followerId), eq(follows.followingId, targetId)) });
  if (existing) return existing.status === "pending" ? "pending" : "accepted";
  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (!target) return "none";
  const needsApproval = target.profileVisibility === "private";
  await db.insert(follows).values({ followerId, followingId: targetId, status: needsApproval ? "pending" : "accepted", createdAt: new Date() });
  await addNotifications([{ id: newId(), userId: targetId, type: needsApproval ? "follow_request" : "new_follower", actorId: followerId, createdAt: new Date() }]);
  return needsApproval ? "pending" : "accepted";
}
