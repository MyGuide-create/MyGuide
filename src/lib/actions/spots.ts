"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guideRequests, guideWishes, notifications } from "../db/schema";
import { citySpots } from "../citySpots";
import { addNotifications } from "../notifications";
import { hiddenUserIds } from "../blocks";
import { canonicalCity } from "../places/cities";
import { newId } from "../utils";

/**
 * "Send your spots" for a wish list city: tells each person who wished for it that you've got
 * spots there, linking to your spots on the city page. No guide needed. Sent once per person and city.
 * Asks you had for that city (Ask a friend) are marked answered.
 */
export async function sendSpotsForWishes(wishIds: string[]): Promise<{ ok: true; sent: number; spots: number } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in." };
  const ids = [...new Set(wishIds)].slice(0, 50);
  if (!ids.length) return { ok: false, error: "Nothing to send." };
  const db = await getDb();
  const wishes = (await db.select().from(guideWishes).where(inArray(guideWishes.id, ids))).filter((w) => w.userId !== user.id);
  if (!wishes.length) return { ok: false, error: "That wish is gone." };
  const hidden = await hiddenUserIds(user.id);
  const city = canonicalCity(wishes[0].city);
  const mine = await citySpots({ city, viewerId: user.id, ownerIds: [user.id] });
  if (!mine.length) return { ok: false, error: `You haven't vouched for any ${city} spots yet.` };
  const already = await db
    .select({ userId: notifications.userId, city: notifications.city })
    .from(notifications)
    .where(and(eq(notifications.actorId, user.id), eq(notifications.type, "spots_sent")));
  const sentTo = new Set(already.map((n) => `${n.userId}|${canonicalCity(n.city ?? "").toLowerCase()}`));
  const now = new Date();
  const recipients = [...new Set(wishes.filter((w) => !hidden.has(w.userId) && canonicalCity(w.city).toLowerCase() === city.toLowerCase()).map((w) => w.userId))].filter(
    (id) => !sentTo.has(`${id}|${city.toLowerCase()}`),
  );
  await addNotifications(recipients.map((userId) => ({ id: newId(), userId, type: "spots_sent", actorId: user.id, city, count: mine.length, createdAt: now })));
  // Anyone who asked you for this city has had their answer.
  const answered = wishes.filter((w) => canonicalCity(w.city).toLowerCase() === city.toLowerCase()).map((w) => w.id);
  if (answered.length) {
    await db
      .update(guideRequests)
      .set({ status: "done", respondedAt: now })
      .where(and(eq(guideRequests.recipientId, user.id), inArray(guideRequests.wishId, answered), inArray(guideRequests.status, ["sent", "opened", "making"])));
  }
  revalidatePath("/");
  revalidatePath("/notifications");
  revalidatePath("/wishes");
  return { ok: true, sent: recipients.length, spots: mine.length };
}
