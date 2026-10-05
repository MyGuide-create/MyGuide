"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { follows, users } from "../db/schema";
import { addNotifications } from "../notifications";
import { normaliseInstagram, normaliseWebsite } from "../placeLinks";
import { startFollowing, type FollowStatus } from "../follow";
import { newId } from "../utils";

export type { FollowStatus } from "../follow";

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
  const status = await startFollowing(user.id, targetUserId);
  revalidatePath("/");
  if (next) revalidatePath(next);
  return { status };
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
    await addNotifications([{ id: newId(), userId: requesterId, type: "follow_accepted", actorId: user.id, createdAt: new Date() }]);
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

/** Change your @username (new Google/Apple accounts get one made for them). */
export async function changeUsername(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const username = String(formData.get("username") ?? "").trim().toLowerCase().replace(/^@/, "");
  if (username === user.username) return { ok: true };
  if (!/^[a-z0-9_.]{3,24}$/.test(username)) return { error: "Usernames are 3\u201324 characters: letters, numbers, dots or underscores." };
  const db = await getDb();
  const taken = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (taken) return { error: "That username is taken." };
  await db.update(users).set({ username }).where(eq(users.id, user.id));
  revalidatePath("/me");
  revalidatePath(`/u/${username}`);
  return { ok: true };
}

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 240);
  const avatarMediaId = String(formData.get("avatarMediaId") ?? "").trim() || null;
  if (!displayName) return { error: "Please add a display name." };
  const ig = normaliseInstagram(String(formData.get("instagram") ?? ""));
  if (!ig.ok) return { error: ig.error };
  const site = normaliseWebsite(String(formData.get("website") ?? ""));
  if (!site.ok) return { error: site.error };
  const db = await getDb();
  await db
    .update(users)
    .set({ displayName, bio, avatarMediaId: avatarMediaId ?? user.avatarMediaId, instagram: ig.value, website: site.value })
    .where(eq(users.id, user.id));
  revalidatePath("/me");
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}
