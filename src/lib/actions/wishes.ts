"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { hiddenUserIds } from "../blocks";
import { getDb } from "../db";
import { guideWishes, guides, wishGrants } from "../db/schema";
import { findCity } from "../places/cities";
import { newId } from "../utils";
import { MAX_WISHES, sendWishGrants } from "../wishes";

export type WishResult = { ok: true; id: string; city: string } | { ok: false; error: string };

function refresh(username?: string) {
  revalidatePath("/wishes");
  if (username) revalidatePath(`/u/${username}`);
}

/** Add a city to your guide wish list (or update the note if it's already there). */
export async function addWish(cityInput: string, noteInput = ""): Promise<WishResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/wishes");
  const raw = cityInput.trim().replace(/\s+/g, " ").slice(0, 60);
  if (raw.length < 2) return { ok: false, error: "Type a city." };
  const known = findCity(raw);
  const city = known?.city ?? raw;
  const note = noteInput.trim().replace(/\s+/g, " ").slice(0, 80);
  const db = await getDb();
  const existing = await db.query.guideWishes.findFirst({ where: and(eq(guideWishes.userId, user.id), sql`lower(${guideWishes.city}) = ${city.toLowerCase()}`) });
  if (existing) {
    if (note && note !== existing.note) await db.update(guideWishes).set({ note }).where(eq(guideWishes.id, existing.id));
    refresh(user.username);
    return { ok: true, id: existing.id, city: existing.city };
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(guideWishes).where(eq(guideWishes.userId, user.id));
  if (Number(n) >= MAX_WISHES) return { ok: false, error: `Your wish list is full (${MAX_WISHES} cities). Remove one first.` };
  const id = newId();
  await db.insert(guideWishes).values({ id, userId: user.id, city, country: known?.country ?? "", note, createdAt: new Date() });
  refresh(user.username);
  return { ok: true, id, city };
}

export async function removeWish(wishId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const db = await getDb();
  await db.delete(guideWishes).where(and(eq(guideWishes.id, wishId), eq(guideWishes.userId, user.id)));
  refresh(user.username);
}

/** "Send my guide": grant someone's wish with a guide you've already published. */
export async function sendGuideForWish(wishId: string, guideId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const [wish, guide] = await Promise.all([
    db.query.guideWishes.findFirst({ where: eq(guideWishes.id, wishId) }),
    db.query.guides.findFirst({ where: eq(guides.id, guideId) }),
  ]);
  if (!wish) return { ok: false, error: "That wish was removed." };
  if (!guide || guide.ownerId !== user.id) return { ok: false, error: "You can only send your own guides." };
  if (!guide.publishedAt) return { ok: false, error: "Publish the guide first." };
  if (wish.userId === user.id) return { ok: false, error: "That's your own wish." };
  if ((await hiddenUserIds(user.id)).has(wish.userId)) return { ok: false, error: "You can't send guides to this person." };
  await db.insert(wishGrants).values({ wishId, guideId, grantedById: user.id, createdAt: new Date() }).onConflictDoNothing();
  await sendWishGrants(guide);
  refresh();
  revalidatePath("/notifications");
  return { ok: true };
}
