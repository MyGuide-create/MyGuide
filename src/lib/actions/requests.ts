"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getCurrentUser } from "../auth";
import { hiddenUserIds } from "../blocks";
import { getDb } from "../db";
import { guideRequests, guides, users, wishGrants } from "../db/schema";
import { addNotifications } from "../notifications";
import { tidyCity } from "../places/cityName";
import { validPin } from "../places/pins";
import { askMessage, ensureWish, getRequestById } from "../requests";
import { UserError } from "../userError";
import { appUrl, newId, newToken } from "../utils";
import { sendWishGrants } from "../wishes";

export interface AskInput {
  city: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  note?: string;
}

async function requireUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Please log in.", "auth");
  return user;
}

function cleanAsk(input: AskInput) {
  const city = tidyCity(input.city ?? "").slice(0, 80);
  if (city.length < 2) throw new UserError("Pick the city you want a guide to.", "invalid");
  const ok = validPin(input.lat ?? NaN, input.lng ?? NaN);
  return {
    city,
    country: (input.country ?? "").trim().slice(0, 80),
    lat: ok ? input.lat! : null,
    lng: ok ? input.lng! : null,
    note: (input.note ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
  };
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
  const hidden = await hiddenUserIds(user.id);
  const ids = [...new Set(input.userIds)].filter((id) => id && id !== user.id && !hidden.has(id)).slice(0, 20);
  if (!ids.length) throw new UserError("Pick at least one person to ask.", "invalid");
  const db = await getDb();
  const real = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
  if (!real.length) throw new UserError("Those people aren’t on MyGuide any more.", "gone");
  const wishId = await ensureWish(user.id, a.city, a.country);
  const now = new Date();
  const rows = real.map((r) => ({ id: newId(), token: newToken(), requesterId: user.id, recipientId: r.id, wishId, ...a, channel: "app", status: "sent", createdAt: now }));
  await db.insert(guideRequests).values(rows);
  await addNotifications(rows.map((r) => ({ id: newId(), userId: r.recipientId, type: "guide_request", actorId: user.id, requestId: r.id, createdAt: now })));
  refresh(user.username);
  return { sent: rows.length };
}

/** An ask to send on WhatsApp (or any app): a personal link plus the message to go with it. */
export async function createAskLink(input: AskInput): Promise<{ url: string; message: string }> {
  const user = await requireUserOrThrow();
  const a = cleanAsk(input);
  const wishId = await ensureWish(user.id, a.city, a.country);
  const db = await getDb();
  const token = newToken();
  await db.insert(guideRequests).values({ id: newId(), token, requesterId: user.id, recipientId: null, wishId, ...a, channel: "link", status: "sent", createdAt: new Date() });
  const h = await headers();
  const origin = appUrl() || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const url = `${origin}/ask/${token}`;
  refresh(user.username);
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
  await addNotifications([{ id: newId(), userId: req.requesterId, type: "request_declined", actorId: user.id, requestId: req.id, createdAt: new Date() }]);
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
