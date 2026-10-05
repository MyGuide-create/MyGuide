import { findCityExact } from "./places/cities";

/**
 * The city shown as a pill on a guide's cover ("Crans-Montana", "Bali + 2 more").
 *
 * - The guide's own city field wins when it's set.
 *   · If that city is also one of the places' cities and the places reach other cities too,
 *     the others are counted: "Lisbon + 1 more".
 *   · If none of the places use it (the creator typed a region, e.g. "Bali" for places in
 *     Ubud and Canggu), it's shown on its own: the creator's label covers them.
 * - Otherwise it's derived from the places: the most common city, plus how many others.
 *
 * Pure and client-safe, so the editor can preview it as the creator types.
 */
export function coverCityLabel(guideCity: string | null | undefined, placeCities: Array<string | null | undefined>): string | null {
  const counts = new Map<string, { name: string; n: number; first: number }>();
  placeCities.forEach((raw, i) => {
    const name = canonical(raw ?? "");
    if (!name) return;
    const key = name.toLowerCase();
    const e = counts.get(key);
    if (e) e.n++;
    else counts.set(key, { name, n: 1, first: i });
  });
  const total = [...counts.values()].reduce((sum, c) => sum + c.n, 0);
  // A stray place (one odd address in a Dubai guide) doesn't make it multi-city:
  // another city counts only with 2+ places or at least a quarter of the guide.
  const significant = (key: string) => [...counts.entries()].filter(([k, c]) => k !== key && (c.n >= 2 || c.n / total >= 0.25)).length;
  const own = (guideCity ?? "").trim();
  if (own) {
    const key = canonical(own).toLowerCase();
    if (!counts.has(key)) return own;
    const others = significant(key);
    return others > 0 ? `${own} + ${others} more` : own;
  }
  if (!counts.size) return null;
  // Most common; ties go to the one that appears first in the guide.
  const top = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0];
  const others = significant(top.name.toLowerCase());
  return others > 0 ? `${top.name} + ${others} more` : top.name;
}

/**
 * One spelling per city: "Dubai - United Arab Emirates", "dubai", "Jumeirah" (a known Dubai
 * neighbourhood) and "Dubai" all become "Dubai". Exact name/alias matches only.
 */
function canonical(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "";
  const head = name.split(/\s+[-–—]\s+|,/)[0].trim() || name;
  const known = findCityExact(head)?.city ?? findCityExact(name)?.city;
  return known ?? head;
}
