/**
 * Home feed ranking: richer guides first, with a slow freshness fade so new guides still surface.
 *
 * quality (0–100)
 *   places        25  levels off around 12 places (a dump of 60 bare names doesn't win)
 *   descriptions  30  share of places with a real description (40+ characters)
 *   expert tips   20  share of places with at least one tip
 *   polish        10  guide intro (4) + share of places with the creator's own photo (6)
 *   engagement    15  hearts and "Copy guide" copies, levels off
 * Shares only count in full from 5 places up, so a 1-place guide with a great note can't top the feed.
 *
 * feed score = quality × freshness, where freshness fades from 1 towards 0.35 (half the gap gone
 * every 21 days). Editing a guide brings back up to 70% of a new guide's boost.
 */

export interface GuideStats {
  places: number;
  described: number;
  withTips: number;
  withOwnPhoto: number;
  hasIntro: boolean;
  saves: number;
  forks: number;
  publishedAt: Date | null;
  updatedAt: Date;
}

/** A place counts as described once its description is at least this long. */
export const DESCRIBED_MIN_CHARS = 40;
/** Shares (descriptions, tips, photos) count in full from this many places up. */
export const FULL_SIZE_PLACES = 5;

const DAY = 86_400_000;
const HALF_LIFE_DAYS = 21;
const FRESHNESS_FLOOR = 0.35;
const UPDATE_WEIGHT = 0.7;

export function qualityScore(s: GuideStats): number {
  const n = s.places;
  if (!n) return 0;
  const placePts = 25 * Math.min(1, Math.log(1 + n) / Math.log(1 + 12));
  const size = Math.min(1, n / FULL_SIZE_PLACES);
  const descPts = 30 * (s.described / n) * size;
  const tipPts = 20 * (s.withTips / n) * size;
  const polishPts = (s.hasIntro ? 4 : 0) + 6 * (s.withOwnPhoto / n) * size;
  const engagePts = 15 * (1 - Math.exp(-(s.saves + 2 * s.forks) / 5));
  return placePts + descPts + tipPts + polishPts + engagePts;
}

function fade(ageMs: number): number {
  const days = Math.max(0, ageMs) / DAY;
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

export function freshness(s: Pick<GuideStats, "publishedAt" | "updatedAt">, now = Date.now()): number {
  const published = s.publishedAt ? fade(now - s.publishedAt.getTime()) : 0;
  const updated = UPDATE_WEIGHT * fade(now - s.updatedAt.getTime());
  return FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * Math.max(published, updated);
}

export function feedScore(s: GuideStats, now = Date.now()): number {
  return qualityScore(s) * freshness(s, now);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What would most help a guide rank higher, as short creator-facing suggestions (best first).
 * Empty when the guide is already in good shape.
 */
export function visibilityHints(s: { places: number; described: number; withTips: number; hasIntro: boolean }): string[] {
  const n = s.places;
  const out: string[] = [];
  if (n < FULL_SIZE_PLACES) out.push(`Add ${plural(FULL_SIZE_PLACES - n, "more place")} — guides with at least ${FULL_SIZE_PLACES} places rank higher.`);
  const missing = n - s.described;
  if (missing > 0) out.push(missing === n ? "Write a description for each place — what it is and what makes it special." : `Write a description for ${plural(missing, "more place")} (a sentence or two each).`);
  if (n && s.withTips / n < 0.5) out.push(s.withTips === 0 ? "Add expert tips — what to order, when to go, where to sit." : `Add expert tips to a few more places — only ${s.withTips} of ${n} have one.`);
  if (!s.hasIntro) out.push("Write a short intro: what this guide is for and who it's for.");
  return out;
}

/** Sort by score, then avoid two guides from the same creator back to back where possible. */
export function rankFeed<T>(items: T[], score: (t: T) => number, ownerOf: (t: T) => string): T[] {
  const pool = items.map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  const out: T[] = [];
  let last: string | null = null;
  while (pool.length) {
    let i = pool.findIndex((p) => ownerOf(p.t) !== last);
    if (i < 0) i = 0;
    const [pick] = pool.splice(i, 1);
    out.push(pick.t);
    last = ownerOf(pick.t);
  }
  return out;
}
