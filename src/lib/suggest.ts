/**
 * Who to follow (15 Oct 2026): one ranking behind the Home spotlight card, the "People to follow"
 * row and a city page's "These people know Lisbon". Signals, strongest first:
 * - you saved their spots (Want to go) — you already like their taste
 * - shared taste: you both recommend the same places
 * - followed by people you follow
 * - spots in your cities / the city you're looking at / where you're going
 * - active lately (spots added in the last 14 days)
 * - they follow you
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, places, savedPlaces, suggestionDismissals, users } from "./db/schema";
import type { PublicUser } from "./auth";
import { cityKey } from "./homeV2";
import { loadRecommendations, ownSpotKeys, spotKey, type Recommendation } from "./citySpots";

export interface PersonSuggestion {
  user: PublicUser;
  /** Distinct spots they recommend (that you can see). */
  spots: number;
  cities: number;
  /** Spots in the city asked about (city page). */
  inCity: number;
  /** Spots added in the last 14 days, and where most of them were. */
  recent: number;
  recentCity: string;
  /** A few of their recent places (for photos on the spotlight card). */
  recentPlaces: Recommendation[];
  /** First names of people you follow who follow them. */
  followedBy: string[];
  /** Places you both recommend. */
  shared: number;
  /** Their spots on your Want to go list. */
  saved: number;
  followsYou: boolean;
  score: number;
}

const DAY = 86_400_000;

export async function suggestPeople(
  viewerId: string,
  opts: { city?: string; limit?: number; extraCities?: string[]; /** Admin preview: people you already follow count too. */ includeFollowed?: boolean } = {},
): Promise<PersonSuggestion[]> {
  const db = await getDb();
  const [recs, own, myFollows, followers, dismissed, savedRows] = await Promise.all([
    loadRecommendations({ viewerId }),
    ownSpotKeys(viewerId),
    db.select({ id: follows.followingId, status: follows.status }).from(follows).where(eq(follows.followerId, viewerId)),
    db.select({ id: follows.followerId }).from(follows).where(and(eq(follows.followingId, viewerId), eq(follows.status, "accepted"))),
    db.select({ id: suggestionDismissals.targetId }).from(suggestionDismissals).where(eq(suggestionDismissals.userId, viewerId)),
    db
      .select({ ownerId: guides.ownerId })
      .from(savedPlaces)
      .innerJoin(places, eq(places.id, savedPlaces.placeId))
      .innerJoin(guides, eq(guides.id, places.guideId))
      .where(eq(savedPlaces.userId, viewerId)),
  ]);
  const following = new Set(myFollows.map((f) => f.id));
  const acceptedFollowing = myFollows.filter((f) => f.status === "accepted").map((f) => f.id);
  const followsMe = new Set(followers.map((f) => f.id));
  const hiddenIds = new Set(dismissed.map((d) => d.id));
  const myKeys = new Set([...own.values()].flatMap((k) => [...k]));
  const myCities = new Set([...own.keys(), ...(opts.extraCities ?? []).map(cityKey)]);
  const focus = opts.city ? cityKey(opts.city) : "";
  const savedFrom = new Map<string, number>();
  for (const r of savedRows) savedFrom.set(r.ownerId, (savedFrom.get(r.ownerId) ?? 0) + 1);

  // Friends of friends: who the people you follow follow.
  const fof = new Map<string, string[]>();
  if (acceptedFollowing.length) {
    const rows = await db
      .select({ by: follows.followerId, id: follows.followingId, name: users.displayName })
      .from(follows)
      .innerJoin(users, eq(users.id, follows.followerId))
      .where(and(inArray(follows.followerId, acceptedFollowing), eq(follows.status, "accepted")));
    for (const r of rows) fof.set(r.id, [...(fof.get(r.id) ?? []), r.name.split(" ")[0]]);
  }

  type Acc = { user: PublicUser; keys: Set<string>; cities: Set<string>; inCity: Set<string>; recent: Recommendation[]; shared: Set<string>; cityHits: Set<string> };
  const by = new Map<string, Acc>();
  const since = Date.now() - 14 * DAY;
  for (const r of recs) {
    const id = r.owner.id;
    if (id === viewerId || (!opts.includeFollowed && following.has(id)) || hiddenIds.has(id)) continue;
    const a = by.get(id) ?? { user: r.owner, keys: new Set(), cities: new Set(), inCity: new Set(), recent: [], shared: new Set(), cityHits: new Set() };
    const k = spotKey(r.place);
    const c = r.city ? cityKey(r.city) : "";
    if (!a.keys.has(k)) {
      a.keys.add(k);
      if (c) a.cities.add(c);
      if (focus && c === focus) a.inCity.add(k);
      if (r.at.getTime() >= since) a.recent.push(r);
      if (myKeys.has(k)) a.shared.add(k);
      if (c && myCities.has(c)) a.cityHits.add(k);
    }
    by.set(id, a);
  }

  const out: PersonSuggestion[] = [];
  for (const [id, a] of by) {
    if (!a.keys.size) continue;
    const recentCities = new Map<string, number>();
    for (const r of a.recent) if (r.city) recentCities.set(r.city, (recentCities.get(r.city) ?? 0) + 1);
    const recentCity = [...recentCities.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
    const followedBy = [...new Set(fof.get(id) ?? [])];
    const saved = savedFrom.get(id) ?? 0;
    const score =
      saved * 6 +
      a.shared.size * 5 +
      followedBy.length * 4 +
      (focus ? a.inCity.size * 3 : 0) +
      Math.min(a.cityHits.size, 10) * 1.5 +
      Math.min(a.recent.length, 15) +
      (followsMe.has(id) ? 6 : 0) +
      Math.min(a.keys.size, 30) * 0.3;
    out.push({
      user: a.user,
      spots: a.keys.size,
      cities: a.cities.size,
      inCity: a.inCity.size,
      recent: a.recent.length,
      recentCity,
      recentPlaces: [...a.recent].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 4),
      followedBy,
      shared: a.shared.size,
      saved,
      followsYou: followsMe.has(id),
      score,
    });
  }
  const sorted = out
    .filter((p) => !focus || p.inCity > 0)
    .sort((a, b) => (focus ? b.inCity - a.inCity : 0) || b.score - a.score);
  return sorted.slice(0, opts.limit ?? 12);
}

/** The one line that says why: "You saved 3 of their spots" > "4 places in common" > "Followed by Shaz" > spots. */
export function reasonLine(p: PersonSuggestion): string {
  if (p.saved >= 2) return `You saved ${p.saved} of their spots`;
  if (p.shared >= 2) return `${p.shared} places in common`;
  if (p.followedBy.length) return `Followed by ${p.followedBy.slice(0, 2).join(" and ")}${p.followedBy.length > 2 ? ` +${p.followedBy.length - 2}` : ""}`;
  if (p.followsYou) return "Follows you";
  return `${p.spots} spot${p.spots === 1 ? "" : "s"} in ${p.cities || 1} cit${(p.cities || 1) === 1 ? "y" : "ies"}`;
}

/** Spotlight on Home: someone active lately (3+ spots in 14 days), rotating every few days among the best few. */
export function pickSpotlight(list: PersonSuggestion[]): PersonSuggestion | null {
  const active = list.filter((p) => p.recent >= 3);
  if (!active.length) return null;
  const top = active.slice(0, 3);
  return top[Math.floor(Date.now() / (3 * DAY)) % top.length];
}
