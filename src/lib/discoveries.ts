import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { getDb } from "./db";
import { claps, placeComments, users } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import { hiddenUserIds } from "./blocks";
import { acceptedFollowingIds, loadRecommendations, spotKey, type Recommendation } from "./citySpots";
import { discoveryGuides, type GuideCard } from "./guides";
import { capRuns } from "./fill";
import type { ClapFace, ClapSummary } from "./clapTargets";

/**
 * Discoveries (20 Oct 2026): Home's one feed. Newest first, one card per spot or guide:
 * 1. places, guides and vouches you publish; 2. the same from people you follow; 3. spots and guides
 * people you follow hearted or commented on; 4. all of that from featured accounts (users.is_featured).
 * Several people on the same spot = one card with a reason line. Saves never show.
 */

export type DiscoveryVerb = "vouched" | "published" | "liked" | "commented";

export interface DiscoveryEvent {
  verb: DiscoveryVerb;
  actor: PublicUser;
  at: Date;
}

interface Base {
  key: string;
  /** Newest event. */
  at: Date;
  /** Newest first, one per person and verb. */
  events: DiscoveryEvent[];
  claps: ClapSummary;
  /** Old one-day post hearts ("spots" targets) that point at this card, cleared when you take your heart back. */
  legacyTargets: string[];
}

export type Discovery =
  | (Base & {
      kind: "place";
      /** The copy the card opens, hearts and comments on: yours, else the newest from someone you follow or a featured account. */
      lead: Recommendation;
      /** You, people you follow and featured accounts who vouch for this spot (you first). */
      vouchers: PublicUser[];
      city: string;
    })
  | (Base & { kind: "guide"; card: GuideCard });

export interface DiscoveriesResult {
  items: Discovery[];
  following: Set<string>;
  featured: Set<string>;
  /** The viewer has never given a heart: show "Your friends see what you like." the first time. */
  firstHeart: boolean;
}

const DAY = 86_400_000;

/** A place counts as a new vouch once shared from My spots, or added to a guide after it was published. */
function isNewVouch(r: Recommendation, since: Date): boolean {
  if (r.at < since) return false;
  if (r.place.sharedAt) return true;
  const pub = r.guide.publishedAt?.getTime();
  return !!pub && r.place.createdAt.getTime() > pub + 10 * 60_000;
}

export async function loadDiscoveries(viewerId: string | null | undefined, opts: { days?: number; limit?: number } = {}): Promise<DiscoveriesResult> {
  const since = new Date(Date.now() - (opts.days ?? 45) * DAY);
  const db = await getDb();
  const [followingIds, featuredRows, hidden] = await Promise.all([
    viewerId ? acceptedFollowingIds(viewerId) : Promise.resolve([] as string[]),
    db.select({ id: users.id }).from(users).where(eq(users.isFeatured, true)),
    hiddenUserIds(viewerId),
  ]);
  const following = new Set(followingIds.filter((id) => !hidden.has(id)));
  const featured = new Set(featuredRows.map((r) => r.id).filter((id) => !hidden.has(id)));
  const sources = [...new Set([...(viewerId ? [viewerId] : []), ...following, ...featured])];
  // Hearts and comments count from people you follow and featured accounts (not your own).
  const others = sources.filter((id) => id !== viewerId);

  const [sourceRecs, clapRows, commentRows, actorRows, firstHeart] = await Promise.all([
    loadRecommendations({ viewerId, ownerIds: sources }),
    others.length
      ? db.select({ userId: claps.userId, kind: claps.kind, target: claps.target, createdAt: claps.createdAt }).from(claps).where(and(inArray(claps.userId, others), gte(claps.createdAt, since))).orderBy(desc(claps.createdAt)).limit(600)
      : Promise.resolve([]),
    others.length
      ? db.select({ authorId: placeComments.authorId, placeId: placeComments.placeId, createdAt: placeComments.createdAt }).from(placeComments).where(and(inArray(placeComments.authorId, others), gte(placeComments.createdAt, since))).orderBy(desc(placeComments.createdAt)).limit(600)
      : Promise.resolve([]),
    others.length ? db.select().from(users).where(inArray(users.id, others)) : Promise.resolve([]),
    viewerId ? db.select({ id: claps.id }).from(claps).where(eq(claps.userId, viewerId)).limit(1).then((r) => r.length === 0) : Promise.resolve(false),
  ]);
  const actors = new Map(actorRows.map((u) => [u.id, toPublicUser(u)]));

  // Places people hearted or commented on, and old one-day post hearts ("owner|city|day"), resolved to spots.
  const known = new Map(sourceRecs.map((r) => [r.place.id, r]));
  const wantIds = new Set<string>();
  const legacyOwners = new Set<string>();
  for (const c of clapRows) {
    if (c.kind === "place" && !known.has(c.target)) wantIds.add(c.target);
    if (c.kind === "spots") {
      const owner = c.target.split("|")[0];
      if (owner && !sources.includes(owner)) legacyOwners.add(owner);
    }
  }
  for (const c of commentRows) if (!known.has(c.placeId)) wantIds.add(c.placeId);
  const [byIdRecs, legacyRecs] = await Promise.all([
    wantIds.size ? loadRecommendations({ viewerId, placeIds: [...wantIds] }) : Promise.resolve([] as Recommendation[]),
    legacyOwners.size ? loadRecommendations({ viewerId, ownerIds: [...legacyOwners] }) : Promise.resolve([] as Recommendation[]),
  ]);
  const allRecs = [...new Map([...sourceRecs, ...byIdRecs, ...legacyRecs].map((r) => [r.place.id, r])).values()];
  const byId = new Map(allRecs.map((r) => [r.place.id, r]));
  const byKey = new Map<string, Recommendation[]>();
  for (const r of allRecs) {
    const k = spotKey(r.place);
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const legacyTargetRecs = (target: string): Recommendation[] => {
    const [owner, city, day] = target.split("|");
    return allRecs.filter((r) => r.owner.id === owner && r.city.trim().toLowerCase() === city && r.at.toISOString().slice(0, 10) === day);
  };

  // Spot cards, keyed by the spot (every copy of the same place is one card).
  const spotCards = new Map<string, { events: DiscoveryEvent[]; legacy: Set<string> }>();
  const spotCard = (r: Recommendation) => {
    const k = spotKey(r.place);
    let c = spotCards.get(k);
    if (!c) spotCards.set(k, (c = { events: [], legacy: new Set() }));
    return c;
  };
  for (const r of sourceRecs) if (isNewVouch(r, since)) spotCard(r).events.push({ verb: "vouched", actor: r.owner, at: r.at });
  const guideHearts = new Map<string, DiscoveryEvent[]>();
  for (const c of clapRows) {
    const actor = actors.get(c.userId);
    if (!actor) continue;
    const ev = { verb: "liked" as const, actor, at: c.createdAt };
    if (c.kind === "guide") guideHearts.set(c.target, [...(guideHearts.get(c.target) ?? []), ev]);
    else if (c.kind === "place") {
      const r = byId.get(c.target);
      if (r) spotCard(r).events.push(ev);
    } else if (c.kind === "spots") {
      const keys = new Set<string>();
      for (const r of legacyTargetRecs(c.target)) {
        const k = spotKey(r.place);
        if (keys.has(k)) continue;
        keys.add(k);
        const card = spotCard(r);
        card.events.push(ev);
        card.legacy.add(c.target);
      }
    }
  }
  for (const c of commentRows) {
    const actor = actors.get(c.authorId);
    const r = byId.get(c.placeId);
    if (actor && r) spotCard(r).events.push({ verb: "commented", actor, at: c.createdAt });
  }

  // Guide cards: published by you / people you follow / featured, or hearted by them.
  const guideCards = await discoveryGuides({ viewerId, ownerIds: sources, ids: [...guideHearts.keys()], since });

  const sourceSet = new Set(sources);
  const tidy = (events: DiscoveryEvent[]) => {
    const seen = new Set<string>();
    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .filter((e) => {
        const k = `${e.verb}:${e.actor.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  };

  const items: Discovery[] = [];
  for (const [key, c] of spotCards) {
    const events = tidy(c.events);
    if (!events.length) continue;
    const recs = byKey.get(key) ?? [];
    if (!recs.length) continue;
    const newest = (a: Recommendation, b: Recommendation) => b.at.getTime() - a.at.getTime();
    const mine = recs.find((r) => r.owner.id === viewerId);
    const fromSources = recs.filter((r) => sourceSet.has(r.owner.id)).sort(newest);
    const lead = mine ?? fromSources[0] ?? [...recs].sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    const vouchers = [...new Map(fromSources.map((r) => [r.owner.id, r.owner])).values()].sort((a, b) => (a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0));
    items.push({
      kind: "place",
      key: `p:${key}`,
      at: events[0].at,
      events,
      lead,
      vouchers,
      city: lead.city,
      claps: { count: 0, mine: false, myNote: null, names: [], faces: [] },
      legacyTargets: [...c.legacy],
    });
  }
  for (const card of guideCards) {
    const events: DiscoveryEvent[] = [...(guideHearts.get(card.guide.id) ?? [])];
    const pub = card.guide.publishedAt;
    if (pub && pub >= since && sourceSet.has(card.owner.id)) events.push({ verb: "published", actor: card.owner, at: pub });
    const tidied = tidy(events);
    if (!tidied.length) continue;
    items.push({ kind: "guide", key: `g:${card.guide.id}`, at: tidied[0].at, events: tidied, card, claps: { count: 0, mine: false, myNote: null, names: [], faces: [] }, legacyTargets: [] });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const shown = capRuns(items, (d) => d.events[0].actor.id).slice(0, opts.limit ?? 30);
  await attachHearts(shown, viewerId, hidden, byKey);
  return { items: shown, following, featured, firstHeart };
}

/** Hearts on each card: every copy of the spot (place hearts) plus old one-day post hearts that point at it, one per person. */
async function attachHearts(items: Discovery[], viewerId: string | null | undefined, hidden: Set<string>, byKey: Map<string, Recommendation[]>) {
  if (!items.length) return;
  const placeTargets = new Map<string, Discovery>();
  const spotsTargets = new Map<string, Discovery[]>();
  const guideTargets = new Map<string, Discovery>();
  for (const d of items) {
    if (d.kind === "guide") guideTargets.set(d.card.guide.id, d);
    else {
      for (const r of byKey.get(d.key.slice(2)) ?? []) placeTargets.set(r.place.id, d);
      for (const t of d.legacyTargets) spotsTargets.set(t, [...(spotsTargets.get(t) ?? []), d]);
    }
  }
  const db = await getDb();
  const conds = [];
  if (placeTargets.size) conds.push(and(eq(claps.kind, "place"), inArray(claps.target, [...placeTargets.keys()])));
  if (spotsTargets.size) conds.push(and(eq(claps.kind, "spots"), inArray(claps.target, [...spotsTargets.keys()])));
  if (guideTargets.size) conds.push(and(eq(claps.kind, "guide"), inArray(claps.target, [...guideTargets.keys()])));
  if (!conds.length) return;
  const rows = await db
    .select({ kind: claps.kind, target: claps.target, userId: claps.userId, note: claps.note, name: users.displayName, username: users.username, avatarMediaId: users.avatarMediaId })
    .from(claps)
    .innerJoin(users, eq(users.id, claps.userId))
    .where(or(...conds))
    .orderBy(desc(claps.createdAt));
  const who = new Map<Discovery, Map<string, { face: ClapFace; note: string | null }>>();
  for (const r of rows) {
    if (hidden.has(r.userId)) continue;
    const ds = r.kind === "guide" ? [guideTargets.get(r.target)] : r.kind === "place" ? [placeTargets.get(r.target)] : spotsTargets.get(r.target) ?? [];
    for (const d of ds) {
      if (!d) continue;
      const m = who.get(d) ?? new Map();
      if (!m.has(r.userId)) m.set(r.userId, { face: { username: r.username, displayName: r.name, avatarMediaId: r.avatarMediaId }, note: r.note });
      who.set(d, m);
    }
  }
  for (const [d, m] of who) {
    const mine = viewerId ? m.get(viewerId) : undefined;
    const rest = [...m.entries()].filter(([id]) => id !== viewerId).map(([, v]) => v.face);
    d.claps = {
      count: m.size,
      mine: !!mine,
      myNote: mine?.note ?? null,
      names: [...(mine ? ["You"] : []), ...rest.map((f) => f.displayName.split(" ")[0])],
      faces: [...(mine ? [mine.face] : []), ...rest].slice(0, 3),
    };
  }
}
