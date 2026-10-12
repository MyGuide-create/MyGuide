"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "../auth";
import { hiddenUserIds } from "../blocks";
import { getDb } from "../db";
import { guideRequests, guideWishes, guides, users, wishGrants, type User } from "../db/schema";
import { addNotifications } from "../notifications";
import { tidyCity } from "../places/cityName";
import { validPin } from "../places/pins";
import { askMessage, ensureWish, getRequestById, passOnMessage } from "../requests";
import { UserError } from "../userError";
import { appUrl, newId, newToken } from "../utils";
import { sendWishGrants } from "../wishes";

export interface AskInput {
  city: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  note?: string;
  /** "Pass it on": ask on behalf of the person who made this wish (someone else's wish list). */
  forWishId?: string;
}

async function requireUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Please log in.", "auth");
  return user;
}

function cleanAsk(input: AskInput) {
  const city = tidyCity(input.city ?? "").slice(0, 80);
  if (city.length < 2) throw new UserError("Pick the city you're going to.", "invalid");
  const ok = validPin(input.lat ?? NaN, input.lng ?? NaN);
  return {
    city,
    country: (input.country ?? "").trim().slice(0, 80),
    lat: ok ? input.lat! : null,
    lng: ok ? input.lng! : null,
    note: (input.note ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
  };
}

/**
 * Who the ask is for. Normally the person asking (their own wish, created if missing).
 * "Pass it on": the person who wished, with the current user recorded as passing it on.
 */
async function askFor(user: User, a: ReturnType<typeof cleanAsk>, forWishId?: string) {
  if (!forWishId) {
    return { requesterId: user.id, wishId: await ensureWish(user.id, a.city, a.country), passedById: null as string | null, city: a.city, country: a.country, wisher: null as User | null };
  }
  const db = await getDb();
  const row = await db.select({ w: guideWishes, u: users }).from(guideWishes).innerJoin(users, eq(users.id, guideWishes.userId)).where(eq(guideWishes.id, forWishId)).limit(1);
  const found = row[0];
  if (!found) throw new UserError("That wish was removed.", "gone");
  if (found.u.id === user.id) throw new UserError("That's your own wish — use Ask a friend.", "invalid");
  if ((await hiddenUserIds(user.id)).has(found.u.id)) throw new UserError("You can't pass on this wish.", "forbidden");
  return { requesterId: found.u.id, wishId: found.w.id, passedById: user.id, city: found.w.city, country: found.w.country || a.country, wisher: found.u };
}

function refresh(username: string) {
  revalidatePath("/wishes");
  revalidatePath(`/u/${username}`);
  revalidatePath("/notifications");
}

/** Ask people already on MyGuide: one request each, a notification (and push) each. */
export async function askOnMyGuide(input: AskInput & { userIds: string[] }): Promise<{ sent: number }> {
  const user = await requireUserOrThrow();
  const a = cleanAsk(input);
  const who = await askFor(user, a, input.forWishId);
  const hidden = await hiddenUserIds(user.id);
  const ids = [...new Set(input.userIds)].filter((id) => id && id !== user.id && id !== who.requesterId && !hidden.has(id)).slice(0, 20);
  if (!ids.length) throw new UserError("Pick at least one person to ask.", "invalid");
  const db = await getDb();
  const real = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
  if (!real.length) throw new UserError("Those people aren’t on MyGuide any more.", "gone");
  const now = new Date();
  const rows = real.map((r) => ({ id: newId(), token: newToken(), requesterId: who.requesterId, recipientId: r.id, wishId: who.wishId, passedById: who.passedById, ...a, city: who.city, country: who.country, channel: "app", status: "sent", createdAt: now }));
  await db.insert(guideRequests).values(rows);
  // The person asked hears it from whoever sent it (for a passed-on wish, the friend who knows them).
  await addNotifications(rows.map((r) => ({ id: newId(), userId: r.recipientId, type: "guide_request", actorId: user.id, requestId: r.id, createdAt: now })));
  if (who.passedById) {
    // "Hisham asked Omar to make you a Mexico City guide."
    await addNotifications(rows.map((r) => ({ id: newId(), userId: who.requesterId, type: "request_passed", actorId: user.id, requestId: r.id, createdAt: now })));
  }
  refresh(user.username);
  if (who.wisher) refresh(who.wisher.username);
  return { sent: rows.length };
}

/** An ask to send on WhatsApp (or any app): a personal link plus the message to go with it. */
export async function createAskLink(input: AskInput): Promise<{ url: string; message: string }> {
  const user = await requireUserOrThrow();
  const a = cleanAsk(input);
  const who = await askFor(user, a, input.forWishId);
  const db = await getDb();
  const token = newToken();
  const id = newId();
  const now = new Date();
  await db.insert(guideRequests).values({ id, token, requesterId: who.requesterId, recipientId: null, wishId: who.wishId, passedById: who.passedById, ...a, city: who.city, country: who.country, channel: "link", status: "sent", createdAt: now });
  const h = await headers();
  const origin = appUrl() || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const url = `${origin}/ask/${token}`;
  refresh(user.username);
  if (who.wisher) {
    refresh(who.wisher.username);
    await addNotifications([{ id: newId(), userId: who.requesterId, type: "request_passed", actorId: user.id, requestId: id, createdAt: now }]);
    return { url, message: passOnMessage(user.displayName.split(" ")[0], who.wisher.displayName.split(" ")[0], who.city, a.note, url) };
  }
  return { url, message: askMessage(user.displayName.split(" ")[0], a.city, a.note, url) };
}

/** The person asked can't help: the asker hears so they can ask someone else. */
export async function declineAsk(requestId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const req = await getRequestById(requestId);
  if (!req || req.recipientId !== user.id) throw new UserError("That ask isn’t there any more.", "gone");
  if (req.status === "declined" || req.status === "done") return;
  const db = await getDb();
  await db.update(guideRequests).set({ status: "declined", respondedAt: new Date() }).where(eq(guideRequests.id, req.id));
  // A passed-on ask: the friend who passed it on hears, so they can think of someone else.
  await addNotifications([{ id: newId(), userId: req.passedById ?? req.requesterId, type: "request_declined", actorId: user.id, requestId: req.id, createdAt: new Date() }]);
  revalidatePath(`/ask/${req.token}`);
  revalidatePath("/notifications");
}

/** Answer an ask with a guide you've already published: it's shared with the asker straight away. */
export async function answerAskWithGuide(requestId: string, guideId: string): Promise<void> {
  const user = await requireUserOrThrow();
  const req = await getRequestById(requestId);
  if (!req || req.recipientId !== user.id) throw new UserError("That ask isn’t there any more.", "gone");
  const db = await getDb();
  const guide = await db.query.guides.findFirst({ where: and(eq(guides.id, guideId), eq(guides.ownerId, user.id)) });
  if (!guide) throw new UserError("You can only send your own guides.", "forbidden");
  if (!guide.publishedAt) throw new UserError("Publish that guide first, then send it.", "invalid");
  if (req.wishId) await db.insert(wishGrants).values({ wishId: req.wishId, guideId: guide.id, grantedById: user.id, createdAt: new Date() }).onConflictDoNothing();
  await db.update(guideRequests).set({ guideId: guide.id, status: "making" }).where(eq(guideRequests.id, req.id));
  // Shares it, tells the asker ("Omar made you a Tashkent guide") and marks the ask done.
  await sendWishGrants(guide);
  revalidatePath(`/ask/${req.token}`);
  revalidatePath("/notifications");
}
