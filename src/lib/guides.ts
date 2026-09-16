import { and, desc, eq, inArray, isNotNull, like, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guideShares, guides, places, users, type Guide, type Place, type User } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import type { SearchIntent } from "./ai";

export interface GuideCard {
  guide: Guide;
  owner: PublicUser;
  placeCount: number;
  categories: string[];
  forkedFrom?: PublicUser | null;
}

export interface GuideDetail extends GuideCard {
  places: Place[];
  noteAuthors: Record<string, PublicUser>;
  viewerCanEdit: boolean;
  viewerCanFork: boolean;
  viewerIsFollowing: boolean;
  sharedWith: PublicUser[];
}

const publicPublished = () => and(eq(guides.visibility, "public"), isNotNull(guides.publishedAt));

async function hydrateCards(rows: Guide[]): Promise<GuideCard[]> {
  if (!rows.length) return [];
  const db = await getDb();
  const ownerIds = [...new Set([...rows.map((g) => g.ownerId), ...rows.map((g) => g.forkedFromUserId).filter((x): x is string => !!x)])];
  const owners = await db.select().from(users).where(inArray(users.id, ownerIds));
  const ownerMap = new Map(owners.map((u) => [u.id, toPublicUser(u)]));
  const guideIds = rows.map((g) => g.id);
  const placeRows = await db
    .select({ guideId: places.guideId, category: places.category })
    .from(places)
    .where(inArray(places.guideId, guideIds));
  const counts = new Map<string, { n: number; cats: Set<string> }>();
  for (const p of placeRows) {
    const e = counts.get(p.guideId) ?? { n: 0, cats: new Set<string>() };
    e.n++;
    e.cats.add(p.category);
    counts.set(p.guideId, e);
  }
  return rows.map((g) => ({
    guide: g,
    owner: ownerMap.get(g.ownerId) ?? { id: g.ownerId, username: "unknown", displayName: "Unknown", bio: null, avatarMediaId: null, accountType: "personal" },
    placeCount: counts.get(g.id)?.n ?? 0,
    categories: [...(counts.get(g.id)?.cats ?? [])],
    forkedFrom: g.forkedFromUserId ? ownerMap.get(g.forkedFromUserId) ?? null : null,
  }));
}

/** Public feed, newest first. `scope: following` limits to creators the viewer follows. */
export async function listFeed(opts: { viewerId?: string | null; scope?: "public" | "following"; city?: string; limit?: number }) {
  const db = await getDb();
  const conds: SQL[] = [publicPublished()!];
  if (opts.city) conds.push(eq(guides.city, opts.city));
  if (opts.scope === "following") {
    if (!opts.viewerId) return [];
    const followed = await db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, opts.viewerId));
    const ids = followed.map((f) => f.id);
    if (!ids.length) return [];
    conds.push(inArray(guides.ownerId, ids));
  }
  const rows = await db
    .select()
    .from(guides)
    .where(and(...conds))
    .orderBy(desc(guides.publishedAt))
    .limit(opts.limit ?? 40);
  return hydrateCards(rows);
}

export async function listFeedCities(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ city: guides.city, n: sql<number>`count(*)` })
    .from(guides)
    .where(and(publicPublished(), sql`${guides.city} != ''`))
    .groupBy(guides.city)
    .orderBy(desc(sql`count(*)`))
    .limit(12);
  return rows.map((r) => r.city);
}

export async function listGuidesByOwner(ownerId: string, viewerId?: string | null): Promise<GuideCard[]> {
  const db = await getDb();
  const own = viewerId === ownerId;
  const rows = await db
    .select()
    .from(guides)
    .where(own ? eq(guides.ownerId, ownerId) : and(eq(guides.ownerId, ownerId), publicPublished()))
    .orderBy(desc(guides.updatedAt));
  return hydrateCards(rows);
}

export async function listSharedWithUser(userId: string): Promise<GuideCard[]> {
  const db = await getDb();
  const shares = await db.select({ guideId: guideShares.guideId }).from(guideShares).where(eq(guideShares.sharedWithId, userId));
  if (!shares.length) return [];
  const rows = await db
    .select()
    .from(guides)
    .where(inArray(guides.id, shares.map((s) => s.guideId)))
    .orderBy(desc(guides.updatedAt));
  return hydrateCards(rows);
}

/** Can this viewer see this guide? Owner, public+published, explicitly shared, or valid share link. */
export async function canViewGuide(guide: Guide, viewerId: string | null | undefined, shareKey?: string | null): Promise<boolean> {
  if (viewerId && guide.ownerId === viewerId) return true;
  if (guide.visibility === "public" && guide.publishedAt) return true;
  if (shareKey && shareKey === guide.shareToken) return true;
  if (viewerId) {
    const db = await getDb();
    const share = await db.query.guideShares.findFirst({
      where: and(eq(guideShares.guideId, guide.id), eq(guideShares.sharedWithId, viewerId)),
    });
    if (share) return true;
  }
  return false;
}

export async function getGuideBySlug(slug: string): Promise<Guide | null> {
  const db = await getDb();
  return (await db.query.guides.findFirst({ where: eq(guides.slug, slug) })) ?? null;
}

export async function getGuideById(id: string): Promise<Guide | null> {
  const db = await getDb();
  return (await db.query.guides.findFirst({ where: eq(guides.id, id) })) ?? null;
}

export async function getGuideDetail(guide: Guide, viewer: User | null): Promise<GuideDetail> {
  const db = await getDb();
  const [card] = await hydrateCards([guide]);
  const placeRows = await db.select().from(places).where(eq(places.guideId, guide.id)).orderBy(places.position, places.createdAt);
  const authorIds = [...new Set(placeRows.map((p) => p.noteAuthorId).filter((x): x is string => !!x))];
  const authors = authorIds.length ? await db.select().from(users).where(inArray(users.id, authorIds)) : [];
  const noteAuthors = Object.fromEntries(authors.map((u) => [u.id, toPublicUser(u)]));

  const viewerIsOwner = !!viewer && viewer.id === guide.ownerId;
  let viewerIsFollowing = false;
  if (viewer && !viewerIsOwner) {
    const f = await db.query.follows.findFirst({ where: and(eq(follows.followerId, viewer.id), eq(follows.followingId, guide.ownerId)) });
    viewerIsFollowing = !!f;
  }
  let sharedWith: PublicUser[] = [];
  if (viewerIsOwner) {
    const shares = await db
      .select({ u: users })
      .from(guideShares)
      .innerJoin(users, eq(users.id, guideShares.sharedWithId))
      .where(eq(guideShares.guideId, guide.id));
    sharedWith = shares.map((s) => toPublicUser(s.u));
  }
  return {
    ...card,
    places: placeRows,
    noteAuthors,
    viewerCanEdit: viewerIsOwner,
    viewerCanFork: !!viewer && !viewerIsOwner && guide.allowFork,
    viewerIsFollowing,
    sharedWith,
  };
}

/** Search public (or followed) guides using a structured intent. */
export async function searchGuides(intent: SearchIntent, viewerId?: string | null): Promise<GuideCard[]> {
  const db = await getDb();
  const conds: SQL[] = [publicPublished()!];

  if (intent.scope === "following") {
    if (!viewerId) return [];
    const followed = await db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, viewerId));
    const ids = followed.map((f) => f.id);
    if (!ids.length) return [];
    conds.push(inArray(guides.ownerId, ids));
  }
  if (intent.byUsername) {
    const u = await db.query.users.findFirst({ where: like(users.username, intent.byUsername) });
    if (!u) return [];
    conds.push(eq(guides.ownerId, u.id));
  }
  if (intent.city) {
    conds.push(or(like(guides.city, `%${intent.city}%`), like(guides.title, `%${intent.city}%`))!);
  } else if (intent.country) {
    conds.push(like(guides.country, `%${intent.country}%`));
  }
  if (intent.category) {
    const withCat = db.select({ id: places.guideId }).from(places).where(eq(places.category, intent.category));
    conds.push(inArray(guides.id, withCat));
  }
  if (intent.keywords.length) {
    const kw = intent.keywords.map((k) =>
      or(
        like(guides.title, `%${k}%`),
        like(guides.description, `%${k}%`),
        like(guides.city, `%${k}%`),
        like(guides.country, `%${k}%`),
        inArray(guides.id, db.select({ id: places.guideId }).from(places).where(or(like(places.name, `%${k}%`), like(places.note, `%${k}%`)))),
      ),
    );
    // Keyword match is a soft filter: only required when nothing else narrowed the search.
    const narrowed = !!(intent.city || intent.country || intent.category || intent.byUsername);
    if (!narrowed) conds.push(or(...kw)!);
  }
  const rows = await db.select().from(guides).where(and(...conds)).orderBy(desc(guides.publishedAt)).limit(40);
  return hydrateCards(rows);
}

export async function searchUsers(q: string, excludeId?: string, limit = 8): Promise<PublicUser[]> {
  const db = await getDb();
  const term = `%${q.replace(/^@/, "").trim()}%`;
  if (term === "%%") return [];
  const rows = await db
    .select()
    .from(users)
    .where(or(like(users.username, term), like(users.displayName, term)))
    .limit(limit + 1);
  return rows.filter((u) => u.id !== excludeId).slice(0, limit).map(toPublicUser);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const db = await getDb();
  return (await db.query.users.findFirst({ where: eq(users.username, username.toLowerCase()) })) ?? null;
}

export async function getFollowStats(userId: string, viewerId?: string | null) {
  const db = await getDb();
  const [[followers], [following]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(follows).where(eq(follows.followingId, userId)),
    db.select({ n: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId)),
  ]);
  let viewerFollows = false;
  if (viewerId && viewerId !== userId) {
    viewerFollows = !!(await db.query.follows.findFirst({ where: and(eq(follows.followerId, viewerId), eq(follows.followingId, userId)) }));
  }
  return { followers: Number(followers?.n ?? 0), following: Number(following?.n ?? 0), viewerFollows };
}

export async function listFollowing(userId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db.select({ u: users }).from(follows).innerJoin(users, eq(users.id, follows.followingId)).where(eq(follows.followerId, userId));
  return rows.map((r) => toPublicUser(r.u));
}

export async function listFollowers(userId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db.select({ u: users }).from(follows).innerJoin(users, eq(users.id, follows.followerId)).where(eq(follows.followingId, userId));
  return rows.map((r) => toPublicUser(r.u));
}

export async function suggestedCreators(viewerId?: string | null, limit = 6): Promise<Array<PublicUser & { guideCount: number }>> {
  const db = await getDb();
  const rows = await db
    .select({ u: users, n: sql<number>`count(${guides.id})` })
    .from(users)
    .leftJoin(guides, and(eq(guides.ownerId, users.id), publicPublished()))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${guides.id})`))
    .limit(limit + 1);
  return rows
    .filter((r) => r.u.id !== viewerId)
    .slice(0, limit)
    .map((r) => ({ ...toPublicUser(r.u), guideCount: Number(r.n) }));
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const db = await getDb();
  const { notifications } = await import("./db/schema");
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`));
  return Number(row?.n ?? 0);
}
