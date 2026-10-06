import { and, desc, eq, inArray, isNotNull, like, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guideCollaborators, guideShares, guides, placeComments, placeLocations, placePhotos, placeReactions, placeTips, places, savedGuides, savedPlaces, users, type Guide, type Place, type PlaceComment, type PlacePhoto, type PlaceLocation, type PlaceTip, type User } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import type { SearchIntent } from "./ai";
import { hiddenUserIds } from "./blocks";
import { coverCityLabel } from "./coverCity";
import { DESCRIBED_MIN_CHARS, feedScore, rankFeed, type GuideStats } from "./feedRank";

export interface PlaceCommentView {
  comment: PlaceComment;
  author: PublicUser;
}

export interface GuideCard {
  guide: Guide;
  owner: PublicUser;
  placeCount: number;
  categories: string[];
  forkedFrom?: PublicUser | null;
  /** Set for signed-in viewers: whether they've saved this guide. */
  viewerSaved?: boolean;
  /** City pill on the cover: the guide's city, or derived from its places ("Bali + 2 more"). */
  coverCity: string | null;
}

export interface GuideDetail extends GuideCard {
  places: Place[];
  noteAuthors: Record<string, PublicUser>;
  placeComments: Record<string, PlaceCommentView[]>;
  /** Creator-uploaded photos for each place, most recent last, keyed by placeId. */
  placePhotos: Record<string, PlacePhoto[]>;
  /** Creator-authored expert tips for each place, in order, keyed by placeId. */
  placeTips: Record<string, PlaceTip[]>;
  /** Other branches of each place (the place row is the main one), keyed by placeId. */
  placeLocations: Record<string, PlaceLocation[]>;
  viewerCanEdit: boolean;
  /** Only the owner can publish, delete, share and manage co-editors. */
  viewerIsOwner: boolean;
  /** People invited to edit this guide with the owner. */
  collaborators: PublicUser[];
  viewerCanFork: boolean;
  /** Places in this guide the viewer has saved. */
  savedPlaceIds: string[];
  /** Whether the viewer saved the whole guide, and how many people have. */
  viewerSavedGuide: boolean;
  guideSaves: number;
  /** Per place: how many readers have been / loved it, and how many favourited it. */
  placeSocial: Record<string, { been: number; loved: number; favourites: number }>;
  /** Per place: the viewer's own reactions. */
  viewerReactions: Record<string, { been: boolean; loved: boolean }>;
  /** Per place: people the viewer follows who favourited or loved it (up to 3). */
  friendsWhoLike: Record<string, PublicUser[]>;
  /** "none" | "pending" | "accepted" */
  viewerFollowStatus: "none" | "pending" | "accepted";
  sharedWith: PublicUser[];
}


const publicPublished = () => and(eq(guides.visibility, "public"), isNotNull(guides.publishedAt));

/** Drop cards owned by a private account, unless the viewer is the owner or an approved follower. */
async function filterVisibleCards(cards: GuideCard[], viewerId?: string | null): Promise<GuideCard[]> {
  if (viewerId && cards.length) {
    const hidden = await hiddenUserIds(viewerId);
    if (hidden.size) cards = cards.filter((c) => !hidden.has(c.owner.id));
    const db = await getDb();
    const saved = new Set(
      (await db.select({ id: savedGuides.guideId }).from(savedGuides).where(and(eq(savedGuides.userId, viewerId), inArray(savedGuides.guideId, cards.map((c) => c.guide.id))))).map((r) => r.id),
    );
    cards = cards.map((c) => (c.owner.id === viewerId ? c : { ...c, viewerSaved: saved.has(c.guide.id) }));
  }
  const lockedOwnerIds = [...new Set(cards.filter((c) => c.owner.profileVisibility === "private" && c.owner.id !== viewerId).map((c) => c.owner.id))];
  if (!lockedOwnerIds.length) return cards;
  let approved = new Set<string>();
  if (viewerId) {
    const db = await getDb();
    const rows = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, lockedOwnerIds), eq(follows.status, "accepted")));
    approved = new Set(rows.map((r) => r.id));
  }
  return cards.filter((c) => c.owner.id === viewerId || c.owner.profileVisibility !== "private" || approved.has(c.owner.id));
}

async function hydrateCards(rows: Guide[]): Promise<GuideCard[]> {
  if (!rows.length) return [];
  const db = await getDb();
  const ownerIds = [...new Set([...rows.map((g) => g.ownerId), ...rows.map((g) => g.forkedFromUserId).filter((x): x is string => !!x)])];
  const owners = await db.select().from(users).where(inArray(users.id, ownerIds));
  const ownerMap = new Map(owners.map((u) => [u.id, toPublicUser(u)]));
  const guideIds = rows.map((g) => g.id);
  const placeRows = await db
    .select({ guideId: places.guideId, category: places.category, city: places.city })
    .from(places)
    .where(inArray(places.guideId, guideIds))
    .orderBy(places.position, places.createdAt);
  const counts = new Map<string, { n: number; cats: Set<string>; cities: string[] }>();
  for (const p of placeRows) {
    const e = counts.get(p.guideId) ?? { n: 0, cats: new Set<string>(), cities: [] };
    e.n++;
    e.cats.add(p.category);
    e.cities.push(p.city);
    counts.set(p.guideId, e);
  }
  return rows.map((g) => ({
    guide: g,
    owner: ownerMap.get(g.ownerId) ?? { id: g.ownerId, username: "unknown", displayName: "Unknown", bio: null, avatarMediaId: null, accountType: "personal", profileVisibility: "public" },
    placeCount: counts.get(g.id)?.n ?? 0,
    categories: [...(counts.get(g.id)?.cats ?? [])],
    forkedFrom: g.forkedFromUserId ? ownerMap.get(g.forkedFromUserId) ?? null : null,
    coverCity: coverCityLabel(g.city, counts.get(g.id)?.cities ?? []),
  }));
}

/** How many recent guides the feed ranks from. Plenty for the pilot; move to a stored score if it grows. */
const FEED_POOL = 300;

/** Per-guide numbers the feed ranking needs (see feedRank.ts). */
async function feedStats(rows: Guide[]): Promise<Map<string, GuideStats>> {
  const db = await getDb();
  const ids = rows.map((g) => g.id);
  const out = new Map<string, GuideStats>();
  for (const g of rows) {
    out.set(g.id, {
      places: 0, described: 0, withTips: 0, withOwnPhoto: 0,
      hasIntro: g.description.trim().length >= DESCRIBED_MIN_CHARS,
      saves: 0, forks: 0,
      publishedAt: g.publishedAt, updatedAt: g.updatedAt,
    });
  }
  if (!ids.length) return out;
  const [placeRows, tipRows, photoRows, saveRows, forkRows] = await Promise.all([
    db
      .select({
        guideId: places.guideId,
        n: sql<number>`count(*)`,
        described: sql<number>`sum(case when length(trim(${places.note})) >= ${DESCRIBED_MIN_CHARS} then 1 else 0 end)`,
        ownPhoto: sql<number>`sum(case when ${places.photoMediaId} is not null then 1 else 0 end)`,
      })
      .from(places)
      .where(inArray(places.guideId, ids))
      .groupBy(places.guideId),
    db
      .select({ guideId: places.guideId, n: sql<number>`count(distinct ${placeTips.placeId})` })
      .from(placeTips)
      .innerJoin(places, eq(placeTips.placeId, places.id))
      .where(inArray(places.guideId, ids))
      .groupBy(places.guideId),
    // Places with an uploaded gallery photo but no main photo of their own (avoids double counting).
    db
      .select({ guideId: places.guideId, n: sql<number>`count(distinct ${placePhotos.placeId})` })
      .from(placePhotos)
      .innerJoin(places, eq(placePhotos.placeId, places.id))
      .where(and(inArray(places.guideId, ids), sql`${places.photoMediaId} is null`))
      .groupBy(places.guideId),
    db
      .select({ guideId: savedGuides.guideId, n: sql<number>`count(*)` })
      .from(savedGuides)
      .where(inArray(savedGuides.guideId, ids))
      .groupBy(savedGuides.guideId),
    db
      .select({ guideId: guides.forkedFromGuideId, n: sql<number>`count(*)` })
      .from(guides)
      .where(inArray(guides.forkedFromGuideId, ids))
      .groupBy(guides.forkedFromGuideId),
  ]);
  for (const r of placeRows) {
    const s = out.get(r.guideId)!;
    s.places = Number(r.n);
    s.described = Number(r.described ?? 0);
    s.withOwnPhoto += Number(r.ownPhoto ?? 0);
  }
  for (const r of tipRows) out.get(r.guideId)!.withTips = Number(r.n);
  for (const r of photoRows) out.get(r.guideId)!.withOwnPhoto += Number(r.n);
  for (const r of saveRows) out.get(r.guideId)!.saves = Number(r.n);
  for (const r of forkRows) if (r.guideId && out.has(r.guideId)) out.get(r.guideId)!.forks = Number(r.n);
  return out;
}

/**
 * Public feed, best first: guides with lots of places, descriptions and tips rank higher, with a
 * slow freshness fade so new guides still get seen (feedRank.ts). `scope: following` limits to
 * creators the viewer follows.
 */
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
  const pool = await db
    .select()
    .from(guides)
    .where(and(...conds))
    .orderBy(desc(guides.updatedAt))
    .limit(FEED_POOL);
  const stats = await feedStats(pool);
  const now = Date.now();
  const rows = rankFeed(pool, (g) => feedScore(stats.get(g.id)!, now), (g) => g.ownerId).slice(0, opts.limit ?? 40);
  return filterVisibleCards(await hydrateCards(rows), opts.viewerId);
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
  const cards = await hydrateCards(rows);
  return own ? cards : filterVisibleCards(cards, viewerId);
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

/** Can this viewer see this guide? Owner, public+published (and not locked behind a private account), explicitly shared, or valid share link. */
export async function isCollaborator(guideId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const db = await getDb();
  const row = await db.query.guideCollaborators.findFirst({ where: and(eq(guideCollaborators.guideId, guideId), eq(guideCollaborators.userId, userId)) });
  return !!row;
}

export async function listCollaborators(guideId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db
    .select({ u: users })
    .from(guideCollaborators)
    .innerJoin(users, eq(users.id, guideCollaborators.userId))
    .where(eq(guideCollaborators.guideId, guideId))
    .orderBy(guideCollaborators.createdAt);
  return rows.map((r) => toPublicUser(r.u));
}

export async function canViewGuide(guide: Guide, viewerId: string | null | undefined, shareKey?: string | null): Promise<boolean> {
  if (viewerId && guide.ownerId === viewerId) return true;
  if (viewerId && (await isCollaborator(guide.id, viewerId))) return true;
  if (shareKey && shareKey === guide.shareToken) return true;
  if (viewerId) {
    const db = await getDb();
    const share = await db.query.guideShares.findFirst({
      where: and(eq(guideShares.guideId, guide.id), eq(guideShares.sharedWithId, viewerId)),
    });
    if (share) return true;
  }
  if (guide.visibility === "public" && guide.publishedAt) {
    const db = await getDb();
    const owner = await db.query.users.findFirst({ where: eq(users.id, guide.ownerId) });
    if (!owner || owner.profileVisibility !== "private") return true;
    if (viewerId) {
      const f = await db.query.follows.findFirst({
        where: and(eq(follows.followerId, viewerId), eq(follows.followingId, guide.ownerId), eq(follows.status, "accepted")),
      });
      if (f) return true;
    }
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

  const placeIds = placeRows.map((p) => p.id);
  const commentRows = placeIds.length
    ? await db.select().from(placeComments).where(inArray(placeComments.placeId, placeIds)).orderBy(placeComments.createdAt)
    : [];
  const photoRows = placeIds.length
    ? await db.select().from(placePhotos).where(inArray(placePhotos.placeId, placeIds)).orderBy(placePhotos.position)
    : [];
  const placePhotosByPlace: Record<string, PlacePhoto[]> = {};
  for (const ph of photoRows) (placePhotosByPlace[ph.placeId] ??= []).push(ph);
  const tipRows = placeIds.length
    ? await db.select().from(placeTips).where(inArray(placeTips.placeId, placeIds)).orderBy(placeTips.position, placeTips.createdAt)
    : [];
  const placeTipsByPlace: Record<string, PlaceTip[]> = {};
  for (const t of tipRows) (placeTipsByPlace[t.placeId] ??= []).push(t);
  const locationRows = placeIds.length
    ? await db.select().from(placeLocations).where(inArray(placeLocations.placeId, placeIds)).orderBy(placeLocations.position, placeLocations.createdAt)
    : [];
  const placeLocationsByPlace: Record<string, PlaceLocation[]> = {};
  for (const l of locationRows) (placeLocationsByPlace[l.placeId] ??= []).push(l);
  const commentAuthorIds = [...new Set(commentRows.map((c) => c.authorId))];
  const commentAuthors = commentAuthorIds.length ? await db.select().from(users).where(inArray(users.id, commentAuthorIds)) : [];
  const commentAuthorMap = new Map(commentAuthors.map((u) => [u.id, toPublicUser(u)]));
  const placeCommentsByPlace: Record<string, PlaceCommentView[]> = {};
  const hiddenAuthors = await hiddenUserIds(viewer?.id);
  for (const c of commentRows) {
    const author = commentAuthorMap.get(c.authorId);
    if (!author || hiddenAuthors.has(author.id)) continue;
    (placeCommentsByPlace[c.placeId] ??= []).push({ comment: c, author });
  }

  const savedRows = viewer && placeIds.length
    ? await db.select({ id: savedPlaces.placeId }).from(savedPlaces).where(and(eq(savedPlaces.userId, viewer.id), inArray(savedPlaces.placeId, placeIds)))
    : [];

  const social = await placeSocialFor(placeIds, viewer?.id ?? null);

  const viewerIsOwner = !!viewer && viewer.id === guide.ownerId;
  const collaborators = await listCollaborators(guide.id);
  const viewerIsCollaborator = !!viewer && collaborators.some((c) => c.id === viewer.id);
  let viewerFollowStatus: "none" | "pending" | "accepted" = "none";
  if (viewer && !viewerIsOwner) {
    const f = await db.query.follows.findFirst({ where: and(eq(follows.followerId, viewer.id), eq(follows.followingId, guide.ownerId)) });
    if (f) viewerFollowStatus = f.status === "accepted" ? "accepted" : "pending";
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
    placeComments: placeCommentsByPlace,
    placePhotos: placePhotosByPlace,
    placeTips: placeTipsByPlace,
    placeLocations: placeLocationsByPlace,
    viewerCanEdit: viewerIsOwner || viewerIsCollaborator,
    viewerIsOwner,
    collaborators,
    viewerCanFork: !!viewer && !viewerIsOwner && !viewerIsCollaborator && guide.allowFork,
    savedPlaceIds: savedRows.map((r) => r.id),
    viewerSavedGuide: !!viewer && !!(await db.query.savedGuides.findFirst({ where: and(eq(savedGuides.userId, viewer.id), eq(savedGuides.guideId, guide.id)) })),
    guideSaves: Number((await db.select({ n: sql<number>`count(*)` }).from(savedGuides).where(eq(savedGuides.guideId, guide.id)))[0]?.n ?? 0),
    placeSocial: social.counts,
    viewerReactions: social.mine,
    friendsWhoLike: social.friends,
    viewerFollowStatus,
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
  const query = (extra: (SQL | undefined)[]) =>
    db.select().from(guides).where(and(...conds, ...extra)).orderBy(desc(guides.publishedAt)).limit(40);
  const catCond = intent.category
    ? inArray(guides.id, db.select({ id: places.guideId }).from(places).where(eq(places.category, intent.category)))
    : undefined;
  let rows: Guide[];
  if (intent.keywords.length) {
    // The words people typed always count. A category guessed from them ("gelato" → Food & Drinks)
    // only decides what comes after the guides that actually match.
    const kwCond = or(
      ...intent.keywords.map((k) =>
        or(
          like(guides.title, `%${k}%`),
          like(guides.description, `%${k}%`),
          like(guides.city, `%${k}%`),
          like(guides.country, `%${k}%`),
          inArray(guides.id, db.select({ id: places.guideId }).from(places).where(or(like(places.name, `%${k}%`), like(places.note, `%${k}%`)))),
          inArray(
            guides.id,
            db.select({ id: places.guideId }).from(placeTips).innerJoin(places, eq(placeTips.placeId, places.id)).where(like(placeTips.body, `%${k}%`)),
          ),
        ),
      ),
    );
    const strict = await query([kwCond]);
    const hardNarrowed = !!(intent.city || intent.country || intent.byUsername);
    if (hardNarrowed) {
      // e.g. "coffee in dubai": Dubai guides that mention coffee first, then other Dubai guides (food ones if a category was guessed).
      const seen = new Set(strict.map((g) => g.id));
      let more = await query([catCond]);
      if (!more.length && catCond) more = await query([]);
      rows = [...strict, ...more.filter((g) => !seen.has(g.id))].slice(0, 40);
    } else {
      rows = strict.length ? strict : catCond ? await query([catCond]) : [];
    }
  } else {
    rows = await query([catCond]);
  }
  return filterVisibleCards(await hydrateCards(rows), viewerId);
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

export interface PersonHit {
  user: PublicUser;
  /** Published public guides. */
  guideCount: number;
  /** The viewer's follow status towards them ("none" when signed out). */
  viewerStatus: "none" | "pending" | "accepted";
  /** They follow the viewer (so the button can say "Follow back"). */
  followsViewer: boolean;
}

/**
 * People for the Search page: names and @usernames containing the query.
 * Exact username first, then names/usernames that start with it, then by guides published.
 * Skips the viewer and anyone blocked either way.
 */
/**
 * "People to follow": creators with published guides the viewer doesn't follow yet (or hasn't
 * requested), people who already follow the viewer first, then most guides. Also returns how many
 * people the viewer follows, so Home can decide whether to show the nudge.
 */
export async function peopleToFollow(viewerId?: string | null, limit = 5): Promise<{ hits: PersonHit[]; followingCount: number }> {
  const db = await getDb();
  const rows = await db
    .select({ u: users, n: sql<number>`count(${guides.id})` })
    .from(users)
    .innerJoin(guides, and(eq(guides.ownerId, users.id), publicPublished()))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${guides.id})`))
    .limit(100);
  const hidden = await hiddenUserIds(viewerId);
  let followed = new Set<string>();
  let followers = new Set<string>();
  if (viewerId) {
    const [out, back] = await Promise.all([
      db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, viewerId)),
      db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followingId, viewerId), eq(follows.status, "accepted"))),
    ]);
    followed = new Set(out.map((f) => f.id));
    followers = new Set(back.map((f) => f.id));
  }
  const hits = rows
    .filter((r) => r.u.id !== viewerId && !hidden.has(r.u.id) && !followed.has(r.u.id))
    .sort((a, b) => Number(followers.has(b.u.id)) - Number(followers.has(a.u.id)) || Number(b.n) - Number(a.n))
    .slice(0, limit)
    .map<PersonHit>((r) => ({ user: toPublicUser(r.u), guideCount: Number(r.n), viewerStatus: "none", followsViewer: followers.has(r.u.id) }));
  return { hits, followingCount: followed.size };
}

export async function searchPeople(q: string, viewerId?: string | null, limit = 3): Promise<{ hits: PersonHit[]; total: number }> {
  const clean = q.replace(/^@/, "").trim().toLowerCase();
  if (clean.length < 2) return { hits: [], total: 0 };
  const db = await getDb();
  const term = `%${clean.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db
    .select({ u: users, n: sql<number>`count(${guides.id})` })
    .from(users)
    .leftJoin(guides, and(eq(guides.ownerId, users.id), publicPublished()))
    .where(or(sql`lower(${users.username}) like ${term} escape '\\'`, sql`lower(${users.displayName}) like ${term} escape '\\'`))
    .groupBy(users.id)
    .limit(200);
  const hidden = await hiddenUserIds(viewerId);
  const rank = (u: User) => {
    const un = u.username.toLowerCase();
    const dn = u.displayName.toLowerCase();
    if (un === clean) return 0;
    if (dn === clean) return 1;
    if (un.startsWith(clean) || dn.startsWith(clean) || dn.split(/\s+/).some((w) => w.startsWith(clean))) return 2;
    return 3;
  };
  const all = rows
    .filter((r) => r.u.id !== viewerId && !hidden.has(r.u.id))
    .sort((a, b) => rank(a.u) - rank(b.u) || Number(b.n) - Number(a.n) || a.u.displayName.localeCompare(b.u.displayName));
  const page = all.slice(0, limit);
  const mine = new Map<string, "pending" | "accepted">();
  const theirs = new Set<string>();
  if (viewerId && page.length) {
    const ids = page.map((r) => r.u.id);
    const [out, back] = await Promise.all([
      db.select({ id: follows.followingId, status: follows.status }).from(follows).where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, ids))),
      db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followingId, viewerId), inArray(follows.followerId, ids), eq(follows.status, "accepted"))),
    ]);
    for (const f of out) mine.set(f.id, f.status === "pending" ? "pending" : "accepted");
    for (const f of back) theirs.add(f.id);
  }
  return {
    total: all.length,
    hits: page.map((r) => ({ user: toPublicUser(r.u), guideCount: Number(r.n), viewerStatus: mine.get(r.u.id) ?? "none", followsViewer: theirs.has(r.u.id) })),
  };
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const db = await getDb();
  return (await db.query.users.findFirst({ where: eq(users.username, username.toLowerCase()) })) ?? null;
}

export async function getFollowStats(userId: string, viewerId?: string | null) {
  const db = await getDb();
  const [[followers], [following]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(follows).where(and(eq(follows.followingId, userId), eq(follows.status, "accepted"))),
    db.select({ n: sql<number>`count(*)` }).from(follows).where(and(eq(follows.followerId, userId), eq(follows.status, "accepted"))),
  ]);
  let viewerFollows = false;
  let viewerRequested = false;
  /** This profile follows the viewer (so the button can say "Follow back"). */
  let followsViewer = false;
  if (viewerId && viewerId !== userId) {
    const [f, back] = await Promise.all([
      db.query.follows.findFirst({ where: and(eq(follows.followerId, viewerId), eq(follows.followingId, userId)) }),
      db.query.follows.findFirst({ where: and(eq(follows.followerId, userId), eq(follows.followingId, viewerId), eq(follows.status, "accepted")) }),
    ]);
    viewerFollows = f?.status === "accepted";
    viewerRequested = f?.status === "pending";
    followsViewer = !!back;
  }
  return { followers: Number(followers?.n ?? 0), following: Number(following?.n ?? 0), viewerFollows, viewerRequested, followsViewer };
}

export async function listFollowing(userId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db.select({ u: users }).from(follows).innerJoin(users, eq(users.id, follows.followingId)).where(and(eq(follows.followerId, userId), eq(follows.status, "accepted")));
  return rows.map((r) => toPublicUser(r.u));
}

export async function listFollowers(userId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db.select({ u: users }).from(follows).innerJoin(users, eq(users.id, follows.followerId)).where(and(eq(follows.followingId, userId), eq(follows.status, "accepted")));
  return rows.map((r) => toPublicUser(r.u));
}

/** Pending follow requests awaiting this user's approval (private accounts only). */
export async function listFollowRequests(userId: string): Promise<PublicUser[]> {
  const db = await getDb();
  const rows = await db.select({ u: users }).from(follows).innerJoin(users, eq(users.id, follows.followerId)).where(and(eq(follows.followingId, userId), eq(follows.status, "pending")));
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
  const hidden = await hiddenUserIds(viewerId);
  return rows
    .filter((r) => r.u.id !== viewerId && !hidden.has(r.u.id))
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

export interface ConnectionRow {
  user: PublicUser;
  /** The viewer's own follow status towards this user ("self" when it's the viewer). */
  viewerStatus: "self" | "none" | "pending" | "accepted";
}

/** Followers or following of a profile, newest first, with the viewer's follow status for each person. */
export async function listConnections(userId: string, kind: "followers" | "following", viewerId?: string | null): Promise<ConnectionRow[]> {
  const db = await getDb();
  const other = kind === "followers" ? follows.followerId : follows.followingId;
  const self = kind === "followers" ? follows.followingId : follows.followerId;
  const rows = await db
    .select({ u: users })
    .from(follows)
    .innerJoin(users, eq(users.id, other))
    .where(and(eq(self, userId), eq(follows.status, "accepted")))
    .orderBy(desc(follows.createdAt));
  const people = rows.map((r) => toPublicUser(r.u));
  const status = new Map<string, "pending" | "accepted">();
  if (viewerId && people.length) {
    const mine = await db
      .select({ id: follows.followingId, status: follows.status })
      .from(follows)
      .where(and(eq(follows.followerId, viewerId), inArray(follows.followingId, people.map((p) => p.id))));
    for (const m of mine) status.set(m.id, m.status === "pending" ? "pending" : "accepted");
  }
  return people.map((u) => ({ user: u, viewerStatus: u.id === viewerId ? "self" : status.get(u.id) ?? "none" }));
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  return (await db.query.users.findFirst({ where: eq(users.id, id) })) ?? null;
}

export async function countGuidePlaces(guideId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(places).where(eq(places.guideId, guideId));
  return Number(row?.n ?? 0);
}

/** Most common place categories across public guides, optionally within one city. */
export async function topPlaceCategories(city?: string, limit = 3): Promise<string[]> {
  const db = await getDb();
  const conds: SQL[] = [publicPublished()!];
  if (city) conds.push(eq(guides.city, city));
  const rows = await db
    .select({ c: places.category, n: sql<number>`count(*)` })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(and(...conds))
    .groupBy(places.category)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => r.c).filter((c): c is NonNullable<typeof c> => !!c);
}


export interface SavedPlaceView {
  place: Place;
  guide: Pick<Guide, "id" | "slug" | "title" | "shareToken" | "visibility" | "ownerId">;
  savedAt: Date;
}

/** A reader's saved places, newest first, limited to guides they can still open. */
export async function listSavedPlaces(userId: string): Promise<SavedPlaceView[]> {
  const db = await getDb();
  const rows = await db
    .select({ place: places, guide: guides, savedAt: savedPlaces.createdAt })
    .from(savedPlaces)
    .innerJoin(places, eq(places.id, savedPlaces.placeId))
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(eq(savedPlaces.userId, userId))
    .orderBy(desc(savedPlaces.createdAt));
  const visible = new Map<string, boolean>();
  const out: SavedPlaceView[] = [];
  for (const r of rows) {
    if (!visible.has(r.guide.id)) visible.set(r.guide.id, await canViewGuide(r.guide, userId));
    if (!visible.get(r.guide.id)) continue;
    const { id, slug, title, shareToken, visibility, ownerId } = r.guide;
    out.push({ place: r.place, guide: { id, slug, title, shareToken, visibility, ownerId }, savedAt: r.savedAt });
  }
  return out;
}

export interface PlaceSearchHit {
  place: Place;
  guide: { slug: string; title: string };
  owner: PublicUser;
}

/** Individual places from public guides matching a search (by name, note, "what makes it special" or tips). */
export async function searchPlaces(intent: SearchIntent, viewerId?: string | null, limit = 12): Promise<PlaceSearchHit[]> {
  if (!intent.keywords.length && !intent.category) return [];
  const db = await getDb();
  const conds: SQL[] = [publicPublished()!];
  if (intent.scope === "following") {
    if (!viewerId) return [];
    const followed = await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted")));
    if (!followed.length) return [];
    conds.push(inArray(guides.ownerId, followed.map((f) => f.id)));
  }
  if (intent.byUsername) {
    const u = await db.query.users.findFirst({ where: like(users.username, intent.byUsername) });
    if (!u) return [];
    conds.push(eq(guides.ownerId, u.id));
  }
  if (intent.city) conds.push(or(like(places.city, `%${intent.city}%`), like(guides.city, `%${intent.city}%`), like(places.address, `%${intent.city}%`))!);
  else if (intent.country) conds.push(or(like(places.country, `%${intent.country}%`), like(guides.country, `%${intent.country}%`))!);
  // A guessed category only filters when there are no words to match on (see searchGuides).
  if (intent.category && !intent.keywords.length) conds.push(eq(places.category, intent.category));
  if (intent.keywords.length) {
    const tipMatch = (k: string) => inArray(places.id, db.select({ id: placeTips.placeId }).from(placeTips).where(like(placeTips.body, `%${k}%`)));
    conds.push(
      or(
        ...intent.keywords.map((k) => or(like(places.name, `%${k}%`), like(places.note, `%${k}%`), like(places.special, `%${k}%`), tipMatch(k))!),
      )!,
    );
  }
  const rows = await db
    .select({ place: places, guide: guides, owner: users })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .innerJoin(users, eq(users.id, guides.ownerId))
    .where(and(...conds))
    .orderBy(desc(guides.publishedAt), places.position)
    .limit(limit * 2);
  const hidden = await hiddenUserIds(viewerId);
  return rows
    .filter((r) => !hidden.has(r.owner.id))
    .filter((r) => r.owner.profileVisibility !== "private" || r.owner.id === viewerId)
    .slice(0, limit)
    .map((r) => ({ place: r.place, guide: { slug: r.guide.slug, title: r.guide.title }, owner: toPublicUser(r.owner) }));
}

export interface TripPlan {
  savedGuides: GuideCard[];
  favourites: SavedPlaceView[];
  fromFollowing: GuideCard[];
  more: GuideCard[];
  topPlaces: Array<{ place: Place; guide: { slug: string; title: string }; favourites: number; loved: number }>;
}

/** Everything MyGuide knows about a city for someone planning a trip there. */
export async function planTrip(userId: string, city: string): Promise<TripPlan> {
  const db = await getDb();
  const cityLower = city.toLowerCase();
  const inCity = (p: Place) => p.city.toLowerCase() === cityLower || p.address.toLowerCase().includes(cityLower);

  const saved = (await listSavedPlaces(userId)).filter((s) => inCity(s.place));

  const cityGuides = await db
    .select()
    .from(guides)
    .where(and(publicPublished(), or(like(guides.city, city), like(guides.title, `%${city}%`))!))
    .orderBy(desc(guides.publishedAt))
    .limit(40);
  const cards = await filterVisibleCards(await hydrateCards(cityGuides.filter((g) => g.ownerId !== userId)), userId);
  const followed = new Set(
    (await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, userId), eq(follows.status, "accepted")))).map((r) => r.id),
  );
  const savedHere = (await listSavedGuides(userId)).filter(
    (c) => c.guide.city.toLowerCase() === cityLower || c.guide.title.toLowerCase().includes(cityLower),
  );
  const savedIds = new Set(savedHere.map((c) => c.guide.id));
  const fromFollowing = cards.filter((c) => followed.has(c.owner.id) && !savedIds.has(c.guide.id));
  const more = cards.filter((c) => !followed.has(c.owner.id) && !savedIds.has(c.guide.id));

  // Most-loved places in this city across public guides: favourites + "loved it" reactions.
  const visibleGuideIds = new Set(cards.map((c) => c.guide.id));
  const ownGuides = cityGuides.filter((g) => g.ownerId === userId).map((g) => g.id);
  const candidateIds = [...visibleGuideIds, ...ownGuides];
  let topPlaces: TripPlan["topPlaces"] = [];
  if (candidateIds.length) {
    const ps = await db.select().from(places).where(inArray(places.guideId, candidateIds));
    const ids = ps.map((p) => p.id);
    if (ids.length) {
      const [favs, loves] = await Promise.all([
        db.select({ id: savedPlaces.placeId, n: sql<number>`count(*)` }).from(savedPlaces).where(inArray(savedPlaces.placeId, ids)).groupBy(savedPlaces.placeId),
        db
          .select({ id: placeReactions.placeId, n: sql<number>`count(*)` })
          .from(placeReactions)
          .where(and(inArray(placeReactions.placeId, ids), eq(placeReactions.kind, "loved")))
          .groupBy(placeReactions.placeId),
      ]);
      const fav = new Map(favs.map((f) => [f.id, Number(f.n)]));
      const love = new Map(loves.map((f) => [f.id, Number(f.n)]));
      const gmap = new Map(cityGuides.map((g) => [g.id, g]));
      topPlaces = ps
        .map((p) => ({ place: p, guide: { slug: gmap.get(p.guideId)!.slug, title: gmap.get(p.guideId)!.title }, favourites: fav.get(p.id) ?? 0, loved: love.get(p.id) ?? 0 }))
        .filter((x) => x.favourites + x.loved > 0)
        .sort((a, b) => b.favourites + b.loved - (a.favourites + a.loved))
        .slice(0, 8);
    }
  }
  return { savedGuides: savedHere, favourites: saved, fromFollowing, more, topPlaces };
}


/** Reaction and favourite counts for places, plus what the viewer and the people they follow did. */
export async function placeSocialFor(placeIds: string[], viewerId: string | null) {
  const counts: Record<string, { been: number; loved: number; favourites: number }> = {};
  const mine: Record<string, { been: boolean; loved: boolean }> = {};
  const friends: Record<string, PublicUser[]> = {};
  if (!placeIds.length) return { counts, mine, friends };
  const db = await getDb();
  const [reacts, favs] = await Promise.all([
    db.select().from(placeReactions).where(inArray(placeReactions.placeId, placeIds)),
    db.select({ placeId: savedPlaces.placeId, userId: savedPlaces.userId }).from(savedPlaces).where(inArray(savedPlaces.placeId, placeIds)),
  ]);
  for (const id of placeIds) counts[id] = { been: 0, loved: 0, favourites: 0 };
  for (const r of reacts) {
    if (r.kind === "been") counts[r.placeId].been++;
    if (r.kind === "loved") counts[r.placeId].loved++;
    if (viewerId && r.userId === viewerId) {
      mine[r.placeId] ??= { been: false, loved: false };
      if (r.kind === "been") mine[r.placeId].been = true;
      if (r.kind === "loved") mine[r.placeId].loved = true;
    }
  }
  for (const f of favs) counts[f.placeId].favourites++;
  if (viewerId) {
    const followed = new Set(
      (await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, viewerId), eq(follows.status, "accepted")))).map((r) => r.id),
    );
    if (followed.size) {
      const byPlace = new Map<string, Set<string>>();
      for (const f of favs) if (followed.has(f.userId)) (byPlace.get(f.placeId) ?? byPlace.set(f.placeId, new Set()).get(f.placeId)!).add(f.userId);
      for (const r of reacts) if (r.kind === "loved" && followed.has(r.userId)) (byPlace.get(r.placeId) ?? byPlace.set(r.placeId, new Set()).get(r.placeId)!).add(r.userId);
      const ids = [...new Set([...byPlace.values()].flatMap((s) => [...s]))];
      if (ids.length) {
        const us = new Map((await db.select().from(users).where(inArray(users.id, ids))).map((u) => [u.id, toPublicUser(u)]));
        for (const [pid, set] of byPlace) friends[pid] = [...set].map((id) => us.get(id)).filter((u): u is PublicUser => !!u);
      }
    }
  }
  return { counts, mine, friends };
}


/** Guides a reader has saved, newest first (only ones they can still open). */
export async function listSavedGuides(userId: string): Promise<GuideCard[]> {
  const db = await getDb();
  const rows = await db
    .select({ g: guides })
    .from(savedGuides)
    .innerJoin(guides, eq(guides.id, savedGuides.guideId))
    .where(eq(savedGuides.userId, userId))
    .orderBy(desc(savedGuides.createdAt));
  const visible: Guide[] = [];
  for (const r of rows) if (await canViewGuide(r.g, userId)) visible.push(r.g);
  return filterVisibleCards(await hydrateCards(visible), userId);
}
