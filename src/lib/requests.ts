import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { toPublicUser, type PublicUser } from "./auth";
import { getDb } from "./db";
import { follows, guideRequests, guideWishes, guides, users, type GuideRequest, type User } from "./db/schema";
import { addNotifications } from "./notifications";
import { newId } from "./utils";

/**
 * "Ask a friend for a guide" — the read side and helpers shared by the actions and pages.
 * One request = one person asked (in the app) or one link sent (WhatsApp / share sheet).
 * Status: sent → opened → making → done, or declined.
 */

import type { RequestStatus } from "./requestStatus";
export { STATUS_LABEL, type RequestStatus } from "./requestStatus";

/** The asker's wish for this city (created if missing), so the finished guide comes back through the wish list. */
export async function ensureWish(userId: string, city: string, country: string): Promise<string> {
  const db = await getDb();
  const existing = await db.query.guideWishes.findFirst({ where: and(eq(guideWishes.userId, userId), sql`lower(${guideWishes.city}) = ${city.toLowerCase()}`) });
  if (existing) {
    if (!existing.country && country) await db.update(guideWishes).set({ country }).where(eq(guideWishes.id, existing.id));
    return existing.id;
  }
  const id = newId();
  await db.insert(guideWishes).values({ id, userId, city, country, note: "", createdAt: new Date() });
  return id;
}

export async function getRequestByToken(token: string): Promise<{ req: GuideRequest; requester: PublicUser } | null> {
  if (!/^[A-Za-z0-9]{10,40}$/.test(token)) return null;
  const db = await getDb();
  const rows = await db.select({ r: guideRequests, u: users }).from(guideRequests).innerJoin(users, eq(users.id, guideRequests.requesterId)).where(eq(guideRequests.token, token)).limit(1);
  return rows[0] ? { req: rows[0].r, requester: toPublicUser(rows[0].u) } : null;
}

export async function getRequestById(id: string): Promise<GuideRequest | null> {
  const db = await getDb();
  return (await db.query.guideRequests.findFirst({ where: eq(guideRequests.id, id) })) ?? null;
}

/**
 * Someone signed in opened an ask: link-sent asks become theirs, and it's marked opened.
 * If they joined MyGuide through this link, they and the asker follow each other and the asker hears about it.
 * Returns the updated request, or null if it was meant for someone else.
 */
export async function claimRequest(req: GuideRequest, viewer: User): Promise<GuideRequest | null> {
  if (viewer.id === req.requesterId) return req;
  if (req.recipientId && req.recipientId !== viewer.id) return null;
  const db = await getDb();
  const now = new Date();
  const set: Partial<typeof guideRequests.$inferInsert> = {};
  if (!req.recipientId) set.recipientId = viewer.id;
  if (req.status === "sent") {
    set.status = "opened";
    set.openedAt = now;
  }
  if (Object.keys(set).length) await db.update(guideRequests).set(set).where(eq(guideRequests.id, req.id));

  const joinedThroughLink = !req.recipientId && req.channel === "link" && viewer.createdAt.getTime() >= req.createdAt.getTime();
  if (joinedThroughLink) {
    // Mutual follow — they came because of each other. No "started following you" noise; one clear notification instead.
    await db
      .insert(follows)
      .values([
        { followerId: viewer.id, followingId: req.requesterId, status: "accepted", createdAt: now },
        { followerId: req.requesterId, followingId: viewer.id, status: "accepted", createdAt: now },
      ])
      .onConflictDoNothing();
    await addNotifications([{ id: newId(), userId: req.requesterId, type: "request_joined", actorId: viewer.id, requestId: req.id, createdAt: now }]);
  }
  return { ...req, ...set } as GuideRequest;
}

export interface AskView {
  id: string;
  token: string;
  status: RequestStatus;
  channel: "app" | "link";
  recipient: PublicUser | null;
  guideSlug: string | null;
  createdAt: Date;
}

/** The asks made for each of these wishes (the asker's own view on their wish list). */
export async function asksForWishes(wishIds: string[]): Promise<Record<string, AskView[]>> {
  if (!wishIds.length) return {};
  const db = await getDb();
  const rows = await db
    .select({ r: guideRequests, u: users, g: guides })
    .from(guideRequests)
    .leftJoin(users, eq(users.id, guideRequests.recipientId))
    .leftJoin(guides, eq(guides.id, guideRequests.guideId))
    .where(inArray(guideRequests.wishId, wishIds))
    .orderBy(desc(guideRequests.createdAt));
  const out: Record<string, AskView[]> = {};
  for (const { r, u, g } of rows) {
    if (!r.wishId) continue;
    // A link nobody opened yet, sent again and again, would clutter the list: keep the newest unopened link only.
    if (!r.recipientId && (out[r.wishId] ?? []).some((a) => !a.recipient)) continue;
    (out[r.wishId] ??= []).push({
      id: r.id,
      token: r.token,
      status: r.status as RequestStatus,
      channel: r.channel as "app" | "link",
      recipient: u ? toPublicUser(u) : null,
      guideSlug: g?.slug ?? null,
      createdAt: r.createdAt,
    });
  }
  return out;
}

export interface IncomingAsk {
  req: GuideRequest;
  requester: PublicUser;
}

/** Asks waiting for this person (Activity's "Guide requests"). */
export async function pendingAsksFor(userId: string): Promise<IncomingAsk[]> {
  const db = await getDb();
  const rows = await db
    .select({ r: guideRequests, u: users })
    .from(guideRequests)
    .innerJoin(users, eq(users.id, guideRequests.requesterId))
    .where(and(eq(guideRequests.recipientId, userId), inArray(guideRequests.status, ["sent", "opened", "making"])))
    .orderBy(desc(guideRequests.createdAt))
    .limit(20);
  return rows.map(({ r, u }) => ({ req: r, requester: toPublicUser(u) }));
}

/** A guide made for an ask was published and sent: those asks are done. */
export async function markAsksDone(guideId: string): Promise<void> {
  const db = await getDb();
  await db.update(guideRequests).set({ status: "done", respondedAt: new Date() }).where(and(eq(guideRequests.guideId, guideId), inArray(guideRequests.status, ["opened", "making", "sent"])));
}

/** The text that goes with an ask link on WhatsApp. */
export function askMessage(requesterFirstName: string, city: string, note: string, url: string): string {
  const lines = [`Hi! I'm going to ${city} and would love your recommendations 🙏`];
  if (note.trim()) lines.push(note.trim());
  lines.push(`Could you make me a quick guide on MyGuide? You can paste a list from Google Maps or WhatsApp — takes a few minutes:`, url, `— ${requesterFirstName}`);
  return lines.join("\n\n");
}
