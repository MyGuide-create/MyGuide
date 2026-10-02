import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { events, feedback, follows, guides, placeReactions, places, reports, savedPlaces, users } from "./db/schema";
import { TAP_TYPES } from "./track";

export interface GuideStats {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  views: number;
  viewers: number;
  views7d: number;
  placeViews: number;
  taps: number;
  shares: number;
  copies: number;
  favourites: number;
  loved: number;
  topPlaces: Array<{ name: string; views: number; favourites: number }>;
}

const n = (v: unknown) => Number(v ?? 0);

/** Per-guide numbers for a creator. Excludes the creator's own visits. */
export async function creatorStats(ownerId: string): Promise<GuideStats[]> {
  const db = await getDb();
  const gs = await db.select().from(guides).where(eq(guides.ownerId, ownerId)).orderBy(desc(guides.updatedAt));
  if (!gs.length) return [];
  const ids = gs.map((g) => g.id);
  const week = new Date(Date.now() - 7 * 86400000);
  const [ev, ev7, viewers, copies, ps] = await Promise.all([
    db
      .select({ guideId: events.guideId, type: events.type, c: sql<number>`count(*)` })
      .from(events)
      .where(and(inArray(events.guideId, ids), eq(events.isOwner, false)))
      .groupBy(events.guideId, events.type),
    db
      .select({ guideId: events.guideId, c: sql<number>`count(*)` })
      .from(events)
      .where(and(inArray(events.guideId, ids), eq(events.isOwner, false), eq(events.type, "guide_view"), gt(events.createdAt, week)))
      .groupBy(events.guideId),
    db
      .select({ guideId: events.guideId, c: sql<number>`count(distinct coalesce(${events.userId}, ${events.visitorId}))` })
      .from(events)
      .where(and(inArray(events.guideId, ids), eq(events.isOwner, false), eq(events.type, "guide_view")))
      .groupBy(events.guideId),
    db.select({ id: guides.forkedFromGuideId, c: sql<number>`count(*)` }).from(guides).where(inArray(guides.forkedFromGuideId, ids)).groupBy(guides.forkedFromGuideId),
    db.select({ id: places.id, guideId: places.guideId, name: places.name }).from(places).where(inArray(places.guideId, ids)),
  ]);
  const placeIds = ps.map((p) => p.id);
  const [favs, loves, pviews] = placeIds.length
    ? await Promise.all([
        db.select({ id: savedPlaces.placeId, c: sql<number>`count(*)` }).from(savedPlaces).where(inArray(savedPlaces.placeId, placeIds)).groupBy(savedPlaces.placeId),
        db.select({ id: placeReactions.placeId, c: sql<number>`count(*)` }).from(placeReactions).where(and(inArray(placeReactions.placeId, placeIds), eq(placeReactions.kind, "loved"))).groupBy(placeReactions.placeId),
        db
          .select({ id: events.placeId, c: sql<number>`count(*)` })
          .from(events)
          .where(and(inArray(events.guideId, ids), eq(events.isOwner, false), eq(events.type, "place_view")))
          .groupBy(events.placeId),
      ])
    : [[], [], []];
  const fav = new Map(favs.map((f) => [f.id, n(f.c)]));
  const love = new Map(loves.map((f) => [f.id, n(f.c)]));
  const pv = new Map(pviews.map((f) => [f.id, n(f.c)]));
  const taps = new Set<string>(TAP_TYPES);
  return gs.map((g) => {
    const mine = ev.filter((e) => e.guideId === g.id);
    const sum = (pred: (t: string) => boolean) => mine.filter((e) => pred(e.type)).reduce((a, e) => a + n(e.c), 0);
    const gp = ps.filter((p) => p.guideId === g.id);
    return {
      id: g.id,
      slug: g.slug,
      title: g.title,
      published: !!g.publishedAt,
      views: sum((t) => t === "guide_view"),
      viewers: n(viewers.find((v) => v.guideId === g.id)?.c),
      views7d: n(ev7.find((v) => v.guideId === g.id)?.c),
      placeViews: sum((t) => t === "place_view"),
      taps: sum((t) => taps.has(t)),
      shares: sum((t) => t === "share"),
      copies: n(copies.find((c) => c.id === g.id)?.c),
      favourites: gp.reduce((a, p) => a + (fav.get(p.id) ?? 0), 0),
      loved: gp.reduce((a, p) => a + (love.get(p.id) ?? 0), 0),
      topPlaces: gp
        .map((p) => ({ name: p.name, views: pv.get(p.id) ?? 0, favourites: fav.get(p.id) ?? 0 }))
        .filter((p) => p.views + p.favourites > 0)
        .sort((a, b) => b.favourites * 3 + b.views - (a.favourites * 3 + a.views))
        .slice(0, 3),
    };
  });
}

export interface PilotStats {
  users: number;
  newUsers7d: number;
  activeUsers7d: number;
  visitors7d: number;
  guides: number;
  publicGuides: number;
  places: number;
  follows: number;
  favourites: number;
  views7d: number;
  taps7d: number;
  shares7d: number;
  weekly: Array<{ week: string; views: number; visitors: number; signups: number }>;
  topGuides: Array<{ slug: string; title: string; views: number }>;
  feedback: Array<{ id: string; message: string; page: string | null; who: string | null; at: Date }>;
  reports: Array<{ id: string; targetType: string; targetId: string; reason: string; details: string | null; who: string | null; at: Date }>;
}

/** Founder dashboard: pilot traction at a glance. */
export async function pilotStats(): Promise<PilotStats> {
  const db = await getDb();
  const week = new Date(Date.now() - 7 * 86400000);
  const one = async (q: Promise<Array<{ c: number }>>) => n((await q)[0]?.c);
  const others = and(eq(events.isOwner, false), gt(events.createdAt, week));
  const [u, nu, au, vis, g, pg, p, f, fav, v7, t7, s7] = await Promise.all([
    one(db.select({ c: sql<number>`count(*)` }).from(users)),
    one(db.select({ c: sql<number>`count(*)` }).from(users).where(gt(users.createdAt, week))),
    one(db.select({ c: sql<number>`count(distinct ${events.userId})` }).from(events).where(gt(events.createdAt, week))),
    one(db.select({ c: sql<number>`count(distinct coalesce(${events.userId}, ${events.visitorId}))` }).from(events).where(gt(events.createdAt, week))),
    one(db.select({ c: sql<number>`count(*)` }).from(guides)),
    one(db.select({ c: sql<number>`count(*)` }).from(guides).where(and(eq(guides.visibility, "public"), sql`${guides.publishedAt} is not null`))),
    one(db.select({ c: sql<number>`count(*)` }).from(places)),
    one(db.select({ c: sql<number>`count(*)` }).from(follows).where(eq(follows.status, "accepted"))),
    one(db.select({ c: sql<number>`count(*)` }).from(savedPlaces)),
    one(db.select({ c: sql<number>`count(*)` }).from(events).where(and(others, eq(events.type, "guide_view")))),
    one(db.select({ c: sql<number>`count(*)` }).from(events).where(and(others, inArray(events.type, [...TAP_TYPES])))),
    one(db.select({ c: sql<number>`count(*)` }).from(events).where(and(others, eq(events.type, "share")))),
  ]);

  // Last 8 weeks, oldest first.
  const weekly: PilotStats["weekly"] = [];
  for (let i = 7; i >= 0; i--) {
    const from = new Date(Date.now() - (i + 1) * 7 * 86400000);
    const to = new Date(Date.now() - i * 7 * 86400000);
    const win = and(gt(events.createdAt, from), sql`${events.createdAt} <= ${to.getTime()}`);
    const [views, visitors, signups] = await Promise.all([
      one(db.select({ c: sql<number>`count(*)` }).from(events).where(and(win, eq(events.type, "guide_view"), eq(events.isOwner, false)))),
      one(db.select({ c: sql<number>`count(distinct coalesce(${events.userId}, ${events.visitorId}))` }).from(events).where(win)),
      one(db.select({ c: sql<number>`count(*)` }).from(users).where(and(gt(users.createdAt, from), sql`${users.createdAt} <= ${to.getTime()}`))),
    ]);
    weekly.push({ week: to.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), views, visitors, signups });
  }

  const top = await db
    .select({ id: events.guideId, c: sql<number>`count(*)` })
    .from(events)
    .where(and(others, eq(events.type, "guide_view")))
    .groupBy(events.guideId)
    .orderBy(desc(sql`count(*)`))
    .limit(5);
  const topRows = top.length ? await db.select().from(guides).where(inArray(guides.id, top.map((t) => t.id))) : [];
  const topGuides = top
    .map((t) => ({ g: topRows.find((r) => r.id === t.id), views: n(t.c) }))
    .filter((t) => t.g)
    .map((t) => ({ slug: t.g!.slug, title: t.g!.title, views: t.views }));

  const fb = await db.select({ f: feedback, u: users }).from(feedback).leftJoin(users, eq(users.id, feedback.userId)).orderBy(desc(feedback.createdAt)).limit(30);
  const rp = await db.select({ r: reports, u: users }).from(reports).leftJoin(users, eq(users.id, reports.reporterId)).orderBy(desc(reports.createdAt)).limit(30);

  return {
    users: u,
    newUsers7d: nu,
    activeUsers7d: au,
    visitors7d: vis,
    guides: g,
    publicGuides: pg,
    places: p,
    follows: f,
    favourites: fav,
    views7d: v7,
    taps7d: t7,
    shares7d: s7,
    weekly,
    topGuides,
    feedback: fb.map((x) => ({ id: x.f.id, message: x.f.message, page: x.f.page, who: x.u ? `@${x.u.username}` : null, at: x.f.createdAt })),
    reports: rp.map((x) => ({ id: x.r.id, targetType: x.r.targetType, targetId: x.r.targetId, reason: x.r.reason, details: x.r.details, who: x.u ? `@${x.u.username}` : null, at: x.r.createdAt })),
  };
}
