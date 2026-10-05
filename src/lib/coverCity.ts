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
    const name = (raw ?? "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    const e = counts.get(key);
    if (e) e.n++;
    else counts.set(key, { name, n: 1, first: i });
  });
  const own = (guideCity ?? "").trim();
  if (own) {
    if (!counts.has(own.toLowerCase())) return own;
    const others = counts.size - 1;
    return others > 0 ? `${own} + ${others} more` : own;
  }
  if (!counts.size) return null;
  // Most common; ties go to the one that appears first in the guide.
  const top = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0];
  const others = counts.size - 1;
  return others > 0 ? `${top.name} + ${others} more` : top.name;
}
