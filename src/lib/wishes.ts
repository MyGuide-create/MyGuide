import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guideShares, guideWishes, guides, users, wishGrants, type Guide, type GuideWish } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import { hiddenUserIds } from "./blocks";
import { addNotifications } from "./notifications";
import { newId } from "./utils";

export const MAX_WISHES = 30;

export interface WishGuideLink {
  slug: string;
  title: string;
  owner: PublicUser;
}

export interface WishView {
  wish: GuideWish;
  /** Published guides made or sent for this wish that the viewer can open. */
  granted: WishGuideLink[];
  /** The viewer's own published guides to this city (for "Send my guide"). Empty for their own wishes. */
  viewerGuides: Array<{ id: string; slug: string; title: string }>;
  /** Viewer's guides already sent for this wish. */
  viewerSent: string[];
}

const sameCity = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Can `viewerId` see `owner`'s wish list? Same rule as their guides: blocks hide it, private accounts need an approved follow. */
async function canSeeWishesOf(owner: { id: string; profileVisibility: string }, viewerId: string | null | undefined): Promise<boolean> {
  if (viewerId === owner.id) return true;
  if ((await hiddenUserIds(viewerId)).has(owner.id)) return false;
  if (owner.profileVisibility !== "private") return true;
  if (!viewerId) return false;
  const db = await getDb();
  const f = await db.query.follows.findFirst({ where: and(eq(follows.followerId, viewerId), eq(follows.followingId, owner.id), eq(follows.status, "accepted")) });
  return !!f;
}

/** Published guides made for these wishes, keyed by wish id, limited to ones the viewer may open. */
async function grantedFor(wishList: GuideWish[], viewerId: string | null | undefined): Promise<Map<string, WishGuideLink[]>> {
  const out = new Map<string, WishGuideLink[]>();
  if (!wishList.length) return out;
  const db = await getDb();
  const rows = await db
    .select({ wishId: wishGrants.wishId, g: guides, u: users })
    .from(wishGrants)
    .innerJoin(guides, eq(guides.id, wishGrants.guideId))
    .innerJoin(users, eq(users.id, guides.ownerId))
    .where(and(inArray(wishGrants.wishId, wishList.map((w) => w.id)), isNotNull(wishGrants.sentAt), isNotNull(guides.publishedAt)))
    .orderBy(desc(wishGrants.sentAt));
  const hidden = await hiddenUserIds(viewerId);
  const wisher = new Map(wishList.map((w) => [w.id, w.userId]));
  for (const r of rows) {
    if (hidden.has(r.u.id)) continue;
    // Public guides for everyone; a private one only for its owner and the person it was made for.
    const visible = (r.g.visibility === "public" && r.u.profileVisibility !== "private") || viewerId === r.u.id || viewerId === wisher.get(r.wishId);
    if (!visible) continue;
    const list = out.get(r.wishId) ?? [];
    list.push({ slug: r.g.slug, title: r.g.title, owner: toPublicUser(r.u) });
    out.set(r.wishId, list);
  }
  return out;
}

async function viewerCityGuides(viewerId: string | null | undefined): Promise<Guide[]> {
  if (!viewerId) return [];
  const db = await getDb();
  return db.select().from(guides).where(and(eq(guides.ownerId, viewerId), isNotNull(guides.publishedAt))).orderBy(desc(guides.updatedAt));
}

async function viewerSentFor(wishIds: string[], viewerId: string | null | undefined): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!viewerId || !wishIds.length) return out;
  const db = await getDb();
  const rows = await db.select().from(wishGrants).where(and(inArray(wishGrants.wishId, wishIds), eq(wishGrants.grantedById, viewerId), isNotNull(wishGrants.sentAt)));
  for (const r of rows) out.set(r.wishId, [...(out.get(r.wishId) ?? []), r.guideId]);
  return out;
}

/** A person's wish list as `viewerId` sees it, newest first. Null when it's hidden from them. */
export async function listWishesFor(owner: { id: string; profileVisibility: string }, viewerId: string | null | undefined): Promise<WishView[] | null> {
  if (!(await canSeeWishesOf(owner, viewerId))) return null;
  const db = await getDb();
  const wishList = await db.select().from(guideWishes).where(eq(guideWishes.userId, owner.id)).orderBy(desc(guideWishes.createdAt));
  const [granted, mine, sent] = await Promise.all([grantedFor(wishList, viewerId), owner.id === viewerId ? Promise.resolve([]) : viewerCityGuides(viewerId), viewerSentFor(wishList.map((w) => w.id), viewerId)]);
  return wishList.map((w) => ({
    wish: w,
    granted: granted.get(w.id) ?? [],
    viewerGuides: mine.filter((g) => sameCity(g.city, w.city)).map((g) => ({ id: g.id, slug: g.slug, title: g.title })),
    viewerSent: sent.get(w.id) ?? [],
  }));
}

export interface CityWishes {
  city: string;
  country: string;
  people: Array<WishView & { user: PublicUser; isViewer: boolean }>;
  latest: Date;
}

/** Every visible wish, grouped by city: most-wanted first, then most recent. */
export async function listAllWishes(viewerId: string | null | undefined, opts: { city?: string } = {}): Promise<CityWishes[]> {
  const db = await getDb();
  const rows = await db
    .select({ w: guideWishes, u: users })
    .from(guideWishes)
    .innerJoin(users, eq(users.id, guideWishes.userId))
    .where(opts.city ? sql`lower(${guideWishes.city}) = ${opts.city.trim().toLowerCase()}` : undefined)
    .orderBy(desc(guideWishes.createdAt))
    .limit(500);
  const hidden = await hiddenUserIds(viewerId);
  const privateOwners = [...new Set(rows.filter((r) => r.u.profileVisibility === "private" && r.u.id !== viewerId).map((r) => r.u.id))];
  let approved = new Set<string>();
  if (viewerId && privateOwners.length) {
    const f = await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, privateOwners), eq(follows.status, "accepted")));
    approved = new Set(f.map((r) => r.id));
  }
  const visible = rows.filter((r) => !hidden.has(r.u.id) && (r.u.profileVisibility !== "private" || r.u.id === viewerId || approved.has(r.u.id)));
  const wishList = visible.map((r) => r.w);
  const [granted, mine, sent] = await Promise.all([grantedFor(wishList, viewerId), viewerCityGuides(viewerId), viewerSentFor(wishList.map((w) => w.id), viewerId)]);
  const byCity = new Map<string, CityWishes>();
  for (const r of visible) {
    const key = r.w.city.trim().toLowerCase();
    const group = byCity.get(key) ?? { city: r.w.city, country: r.w.country, people: [], latest: r.w.createdAt };
    const isViewer = r.u.id === viewerId;
    group.people.push({
      wish: r.w,
      user: toPublicUser(r.u),
      isViewer,
      granted: granted.get(r.w.id) ?? [],
      viewerGuides: isViewer ? [] : mine.filter((g) => sameCity(g.city, r.w.city)).map((g) => ({ id: g.id, slug: g.slug, title: g.title })),
      viewerSent: sent.get(r.w.id) ?? [],
    });
    if (!group.country && r.w.country) group.country = r.w.country;
    if (r.w.createdAt > group.latest) group.latest = r.w.createdAt;
    byCity.set(key, group);
  }
  return [...byCity.values()].sort((a, b) => b.people.length - a.people.length || b.latest.getTime() - a.latest.getTime());
}

/** The wishes a "Make this guide" link points at, checked: they exist, aren't the maker's own, aren't blocked. */
export async function wishesForMaking(ids: string[], makerId: string): Promise<Array<{ wish: GuideWish; user: PublicUser }>> {
  const clean = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (!clean.length) return [];
  const db = await getDb();
  const rows = await db.select({ w: guideWishes, u: users }).from(guideWishes).innerJoin(users, eq(users.id, guideWishes.userId)).where(inArray(guideWishes.id, clean));
  const hidden = await hiddenUserIds(makerId);
  return rows.filter((r) => r.u.id !== makerId && !hidden.has(r.u.id)).map((r) => ({ wish: r.w, user: toPublicUser(r.u) }));
}

/** People a guide is being made for (shown in the editor until it's published). */
export async function pendingWishPeople(guideId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db
    .select({ u: users })
    .from(wishGrants)
    .innerJoin(guideWishes, eq(guideWishes.id, wishGrants.wishId))
    .innerJoin(users, eq(users.id, guideWishes.userId))
    .where(and(eq(wishGrants.guideId, guideId), isNull(wishGrants.sentAt)));
  return rows.map((r) => toPublicUser(r.u));
}

/**
 * Send a published guide to everyone whose wish it was made for and who hasn't had it yet:
 * shares it with them (so a private guide opens too) and tells them.
 */
export async function sendWishGrants(guide: Guide): Promise<number> {
  if (!guide.publishedAt) return 0;
  const db = await getDb();
  const pending = await db
    .select({ wishId: wishGrants.wishId, wisherId: guideWishes.userId })
    .from(wishGrants)
    .innerJoin(guideWishes, eq(guideWishes.id, wishGrants.wishId))
    .where(and(eq(wishGrants.guideId, guide.id), isNull(wishGrants.sentAt)));
  if (!pending.length) return 0;
  const hidden = await hiddenUserIds(guide.ownerId);
  const now = new Date();
  const recipients = [...new Set(pending.map((p) => p.wisherId))].filter((id) => id !== guide.ownerId && !hidden.has(id));
  if (recipients.length) {
    const shared = await db.select({ id: guideShares.sharedWithId }).from(guideShares).where(and(eq(guideShares.guideId, guide.id), inArray(guideShares.sharedWithId, recipients)));
    const already = new Set(shared.map((s) => s.id));
    const fresh = recipients.filter((id) => !already.has(id));
    if (fresh.length) await db.insert(guideShares).values(fresh.map((id) => ({ id: newId(), guideId: guide.id, sharedById: guide.ownerId, sharedWithId: id, createdAt: now })));
  }
  await db.update(wishGrants).set({ sentAt: now }).where(and(eq(wishGrants.guideId, guide.id), isNull(wishGrants.sentAt)));
  if (recipients.length) {
    await addNotifications(recipients.map((userId) => ({ id: newId(), userId, type: "wish_granted", actorId: guide.ownerId, guideId: guide.id, createdAt: now })));
  }
  return recipients.length;
}
