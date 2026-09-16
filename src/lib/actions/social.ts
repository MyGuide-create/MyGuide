"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { follows, notifications, users } from "../db/schema";
import { newId } from "../utils";

export async function toggleFollow(targetUserId: string, next?: string): Promise<{ following: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next ?? "/")}`);
  if (user.id === targetUserId) return { following: false };
  const db = await getDb();
  const existing = await db.query.follows.findFirst({ where: and(eq(follows.followerId, user.id), eq(follows.followingId, targetUserId)) });
  if (existing) {
    await db.delete(follows).where(and(eq(follows.followerId, user.id), eq(follows.followingId, targetUserId)));
  } else {
    await db.insert(follows).values({ followerId: user.id, followingId: targetUserId, createdAt: new Date() });
    await db.insert(notifications).values({ id: newId(), userId: targetUserId, type: "new_follower", actorId: user.id, createdAt: new Date() });
  }
  revalidatePath("/");
  if (next) revalidatePath(next);
  return { following: !existing };
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
