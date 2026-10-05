"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { destroySession, getCurrentUser, hashPassword, verifyPassword } from "../auth";
import { getDb } from "../db";
import {
  blocks,
  events,
  feedback,
  follows,
  guideCollaborators,
  guideShares,
  guides,
  media,
  notifications,
  oauthAccounts,
  placeLocations,
  placeComments,
  placePhotos,
  placeReactions,
  places,
  placeTips,
  pushSubscriptions,
  reports,
  savedGuides,
  savedPlaces,
  trips,
  users,
  guideWishes,
  wishGrants,
} from "../db/schema";
import { newId } from "../utils";

export interface DeleteAccountState {
  error?: string;
}

/**
 * Permanently delete the signed-in account and everything it owns.
 * Copies other people made of this person's guides ("Use this guide") are kept,
 * with the "based on @…" credit and any carried-over note credits removed.
 * Child rows are deleted explicitly rather than relying on SQLite cascades.
 */
export async function deleteAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const typed = String(formData.get("confirm") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (typed !== user.username.toLowerCase()) return { error: `Type your username (${user.username}) to confirm.` };

  const db = await getDb();
  const myGuides = await db.select({ id: guides.id }).from(guides).where(eq(guides.ownerId, user.id));
  const guideIds = myGuides.map((g) => g.id);
  const myPlaces = guideIds.length ? await db.select({ id: places.id }).from(places).where(inArray(places.guideId, guideIds)) : [];
  const placeIds = myPlaces.map((p) => p.id);

  if (placeIds.length) {
    await db.delete(placeComments).where(inArray(placeComments.placeId, placeIds));
    await db.delete(placePhotos).where(inArray(placePhotos.placeId, placeIds));
    await db.delete(placeTips).where(inArray(placeTips.placeId, placeIds));
    await db.delete(savedPlaces).where(inArray(savedPlaces.placeId, placeIds));
    await db.delete(placeReactions).where(inArray(placeReactions.placeId, placeIds));
    await db.delete(placeLocations).where(inArray(placeLocations.placeId, placeIds));
    await db.delete(places).where(inArray(places.id, placeIds));
  }
  if (guideIds.length) {
    await db.delete(wishGrants).where(inArray(wishGrants.guideId, guideIds));
    await db.delete(guideShares).where(inArray(guideShares.guideId, guideIds));
    await db.delete(guideCollaborators).where(inArray(guideCollaborators.guideId, guideIds));
    await db.delete(savedGuides).where(inArray(savedGuides.guideId, guideIds));
    await db.delete(notifications).where(inArray(notifications.guideId, guideIds));
    await db.delete(events).where(inArray(events.guideId, guideIds));
    await db.delete(guides).where(inArray(guides.id, guideIds));
  }
  // Copies others made stay, without credit to the deleted account.
  await db.update(guides).set({ forkedFromUserId: null, forkedFromGuideId: null }).where(eq(guides.forkedFromUserId, user.id));
  await db.update(places).set({ noteAuthorId: null }).where(eq(places.noteAuthorId, user.id));

  await db.delete(placeComments).where(eq(placeComments.authorId, user.id));
  await db.delete(savedPlaces).where(eq(savedPlaces.userId, user.id));
  await db.delete(savedGuides).where(eq(savedGuides.userId, user.id));
  await db.delete(placeReactions).where(eq(placeReactions.userId, user.id));
  await db.delete(follows).where(or(eq(follows.followerId, user.id), eq(follows.followingId, user.id)));
  await db.delete(guideShares).where(or(eq(guideShares.sharedById, user.id), eq(guideShares.sharedWithId, user.id)));
  await db.delete(guideCollaborators).where(eq(guideCollaborators.userId, user.id));
  await db.delete(notifications).where(or(eq(notifications.userId, user.id), eq(notifications.actorId, user.id)));
  await db.delete(blocks).where(or(eq(blocks.blockerId, user.id), eq(blocks.blockedId, user.id)));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
  await db.delete(trips).where(eq(trips.userId, user.id));
  await db.delete(wishGrants).where(eq(wishGrants.grantedById, user.id));
  const myWishes = await db.select({ id: guideWishes.id }).from(guideWishes).where(eq(guideWishes.userId, user.id));
  if (myWishes.length) await db.delete(wishGrants).where(inArray(wishGrants.wishId, myWishes.map((w) => w.id)));
  await db.delete(guideWishes).where(eq(guideWishes.userId, user.id));
  await db.update(feedback).set({ userId: null }).where(eq(feedback.userId, user.id));
  await db.update(reports).set({ reporterId: null }).where(eq(reports.reporterId, user.id));
  await db.update(events).set({ userId: null }).where(eq(events.userId, user.id));
  await db.delete(media).where(eq(media.ownerId, user.id));
  await db.delete(oauthAccounts).where(eq(oauthAccounts.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));

  await destroySession();
  redirect("/?deleted=1");
}

/** Block someone: hides each other's guides and comments, and removes follows both ways. */
export async function blockUser(targetId: string, next?: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.id === targetId) return;
  const db = await getDb();
  await db.insert(blocks).values({ blockerId: user.id, blockedId: targetId, createdAt: new Date() }).onConflictDoNothing();
  await db
    .delete(follows)
    .where(or(and(eq(follows.followerId, user.id), eq(follows.followingId, targetId)), and(eq(follows.followerId, targetId), eq(follows.followingId, user.id))));
  revalidatePath("/");
  if (next) revalidatePath(next);
}

export async function unblockUser(targetId: string, next?: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  await db.delete(blocks).where(and(eq(blocks.blockerId, user.id), eq(blocks.blockedId, targetId)));
  revalidatePath("/");
  if (next) revalidatePath(next);
}

const REASONS = ["spam", "offensive", "harassment", "wrong", "other"] as const;

/** Report a guide, a person or a comment for review. */
export async function reportContent(input: { targetType: "guide" | "user" | "comment"; targetId: string; reason: string; details?: string }): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  const reason = (REASONS as readonly string[]).includes(input.reason) ? input.reason : "other";
  const db = await getDb();
  await db.insert(reports).values({
    id: newId(),
    reporterId: user?.id ?? null,
    targetType: input.targetType,
    targetId: input.targetId,
    reason,
    details: input.details?.trim().slice(0, 1000) || null,
    createdAt: new Date(),
  });
  return { ok: true };
}

/** In-app feedback ("something's broken" / ideas). */
export async function sendFeedback(message: string, page?: string): Promise<{ ok: boolean; error?: string }> {
  const text = message.trim();
  if (text.length < 3) return { ok: false, error: "Tell us a little more." };
  const user = await getCurrentUser();
  const db = await getDb();
  await db.insert(feedback).values({ id: newId(), userId: user?.id ?? null, message: text.slice(0, 4000), page: page?.slice(0, 300) ?? null, createdAt: new Date() });
  return { ok: true };
}

/** Mark the new-user welcome as done. */
export async function finishOnboarding(next?: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, user.id));
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export interface ChangePasswordState {
  error?: string;
  done?: boolean;
}

/** "Change password" on the You page — e.g. after an admin sent a temporary one. */
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/me");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Your current password didn't match." };
  if (next.length < 8) return { error: "Use at least 8 characters for your new password." };
  if (next !== String(formData.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  const db = await getDb();
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  return { done: true };
}
