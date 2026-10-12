import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { asksForWishes, markAsksDone, type AskView } from "./requests";
import { getDb } from "./db";
import { follows, guideShares, guideWishes, guides, notifications, users, wishGrants, type Guide, type GuideWish } from "./db/schema";
import { loadRecommendations, mergeSpots } from "./citySpots";
import { canonicalCity } from "./places/cities";
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
  /** People who sent their spots for this city (newest first). */
  spotsFrom: SpotsFrom[];
  /** How many spots the viewer recommends in this city (for "Send your N spots"). 0 for their own wishes. */
  viewerSpots: number;
  /** The viewer already sent this person their spots for this city. */
  viewerSentSpots: boolean;
  /** Your own wishes only: who you asked for this city and where each ask stands. */
  asks?: AskView[];
}

const sameCity = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const cityKey = (c: string) => canonicalCity(c).toLowerCase();

export interface SpotsFrom {
  user: PublicUser;
  count: number;
  city: string;
}

/** "Yara sent 6 spots": spots_sent alerts to each wisher for the wish's city. */
async function spotsFromFor(wishList: GuideWish[], viewerId: string | null | undefined): Promise<Map<string, SpotsFrom[]>> {
  const out = new Map<string, SpotsFrom[]>();
  if (!wishList.length) return out;
  const db = await getDb();
  const rows = await db
    .select({ n: notifications, u: users })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.actorId))
    .where(and(eq(notifications.type, "spots_sent"), inArray(notifications.userId, [...new Set(wishList.map((w) => w.userId))])))
    .orderBy(desc(notifications.createdAt));
  const hidden = await hiddenUserIds(viewerId);
  for (const w of wishList) {
    const list: SpotsFrom[] = [];
    for (const r of rows) {
      if (r.n.userId !== w.userId || hidden.has(r.u.id) || cityKey(r.n.city ?? "") !== cityKey(w.city)) continue;
      if (list.some((x) => x.user.id === r.u.id)) continue;
      list.push({ user: toPublicUser(r.u), count: r.n.count ?? 0, city: canonicalCity(w.city) });
    }
    if (list.length) out.set(w.id, list);
  }
  return out;
}

/** The viewer's recommended spots per city (lowercased canonical city → count). */
async function viewerSpotCounts(viewerId: string | null | undefined): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!viewerId) return out;
  const recs = await loadRecommendations({ viewerId, ownerIds: [viewerId] });
  const byCity = new Map<string, typeof recs>();
  for (const r of recs) if (r.city) byCity.set(r.city.toLowerCase(), [...(byCity.get(r.city.toLowerCase()) ?? []), r]);
  for (const [k, list] of byCity) out.set(k, mergeSpots(list).length);
  return out;
}

/** "<wisher id>|<city>" for every wisher the viewer already sent spots to. */
async function viewerSpotsSent(viewerId: string | null | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const db = await getDb();
  const rows = await db.select({ userId: notifications.userId, city: notifications.city }).from(notifications).where(and(eq(notifications.actorId, viewerId), eq(notifications.type, "spots_sent")));
  return new Set(rows.map((r) => `${r.userId}|${cityKey(r.city ?? "")}`));
}

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
  const own = owner.id === viewerId;
  const [granted, mine, sent, asks, spotsFrom, counts, sentSpots] = await Promise.all([
    grantedFor(wishList, viewerId),
    own ? Promise.resolve([]) : viewerCityGuides(viewerId),
    viewerSentFor(wishList.map((w) => w.id), viewerId),
    own ? asksForWishes(wishList.map((w) => w.id)) : Promise.resolve({} as Record<string, AskView[]>),
    spotsFromFor(wishList, viewerId),
    own ? Promise.resolve(new Map<string, number>()) : viewerSpotCounts(viewerId),
    own ? Promise.resolve(new Set<string>()) : viewerSpotsSent(viewerId),
  ]);
  return wishList.map((w) => ({
    asks: asks[w.id] ?? [],
    spotsFrom: spotsFrom.get(w.id) ?? [],
    viewerSpots: counts.get(cityKey(w.city)) ?? 0,
    viewerSentSpots: sentSpots.has(`${w.userId}|${cityKey(w.city)}`),
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
  const [granted, mine, sent, spotsFrom, counts, sentSpots] = await Promise.all([
    grantedFor(wishList, viewerId),
    viewerCityGuides(viewerId),
    viewerSentFor(wishList.map((w) => w.id), viewerId),
    spotsFromFor(wishList, viewerId),
    viewerSpotCounts(viewerId),
    viewerSpotsSent(viewerId),
  ]);
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
      spotsFrom: spotsFrom.get(r.w.id) ?? [],
      viewerSpots: isViewer ? 0 : counts.get(cityKey(r.w.city)) ?? 0,
      viewerSentSpots: sentSpots.has(`${r.w.userId}|${cityKey(r.w.city)}`),
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
  // Asks answered with this guide ("Ask a friend for a guide") are done once it's out.
  await markAsksDone(guide.id);
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
