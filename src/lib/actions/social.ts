"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { follows, notifications, users } from "../db/schema";
import { newId } from "../utils";

export type FollowStatus = "none" | "pending" | "accepted";

/** Follow, request-to-follow (private accounts), cancel a pending request, or unfollow — toggled from current state. */
export async function toggleFollow(targetUserId: string, next?: string): Promise<{ status: FollowStatus }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/signup?next=${encodeURIComponent(next ?? "/")}&why=follow`);
  if (user.id === targetUserId) return { status: "none" };
  const db = await getDb();
  const existing = await db.query.follows.findFirst({ where: and(eq(follows.followerId, user.id), eq(follows.followingId, targetUserId)) });
  if (existing) {
    // Already following, or a pending request — either way, tapping again backs out of it.
    await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, targetUserId)));
    revalidatePath("/");
    if (next) revalidatePath(next);
    return { status: "none" };
  }
  const target = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  const needsApproval = target?.profileVisibility === "private";
  await db.insert(follows).values({ followerId: user.id, followingId: targetUserId, status: needsApproval ? "pending" : "accepted", createdAt: new Date() });
  await db.insert(notifications).values({
    id: newId(),
    userId: targetUserId,
    type: needsApproval ? "follow_request" : "new_follower",
    actorId: user.id,
    createdAt: new Date(),
  });
  revalidatePath("/");
  if (next) revalidatePath(next);
  return { status: needsApproval ? "pending" : "accepted" };
}

/** Accept or decline a pending follow request (only the target can respond). */
export async function respondToFollowRequest(requesterId: string, accept: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const req = await db.query.follows.findFirst({ where: and(eq(follows.followerId, requesterId), eq(follows.followingId, user.id), eq(follows.status, "pending")) });
  if (!req) return;
  if (accept) {
    await db.update(follows).set({ status: "accepted" }).where(and(eq(follows.followerId, requesterId), eq(follows.followingId, user.id)));
    await db.insert(notifications).values({ id: newId(), userId: requesterId, type: "follow_accepted", actorId: user.id, createdAt: new Date() });
  } else {
    await db.delete(follows).where(and(eq(follows.followerId, requesterId), eq(follows.followingId, user.id)));
  }
  revalidatePath("/notifications");
  revalidatePath("/me");
}

/** Toggle between a public and a private (approval-required) account. */
export async function setProfileVisibility(visibility: "public" | "private"): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  await db.update(users).set({ profileVisibility: visibility }).where(eq(users.id, user.id));
  revalidatePath("/me");
  revalidatePath(`/u/${user.username}`);
}

export interface ProfileState {
  error?: string;
  ok?: boolean;
}

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 240);
  const avatarMediaId = String(formData.get("avatarMediaId") ?? "").trim() || null;
  if (!displayName) return { error: "Please add a display name." };
  const db = await getDb();
  await db.update(users).set({ displayName, bio, avatarMediaId: avatarMediaId ?? user.avatarMediaId }).where(eq(users.id, user.id));
  revalidatePath("/me");
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}
