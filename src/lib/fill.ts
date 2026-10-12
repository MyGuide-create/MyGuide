/**
 * Friends first, then everyone (12 Oct 2026): lists put people the viewer follows first and fill
 * the rest with public content from everyone on MyGuide, never more than a couple of items in a
 * row from the same person.
 */

/**
 * Reorder so no more than `max` items in a row come from the same person, keeping the order
 * otherwise (the next item from someone else moves up). Items stay in if nobody else is left.
 */
export function capRuns<T>(items: T[], ownerOf: (t: T) => string, max = 2): T[] {
  const left = [...items];
  const out: T[] = [];
  while (left.length) {
    const last = out.slice(-max).map(ownerOf);
    const stuck = last.length === max && last.every((o) => o === last[0]);
    const i = stuck ? left.findIndex((t) => ownerOf(t) !== last[0]) : 0;
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

/** Friends' items first (up to `target`), then fill from everyone, skipping ones already shown. */
export function friendsThenEveryone<T>(friends: T[], everyone: T[], target: number, keyOf: (t: T) => string): { friends: T[]; fill: T[] } {
  const f = friends.slice(0, target);
  const seen = new Set(f.map(keyOf));
  const fill = everyone.filter((t) => !seen.has(keyOf(t))).slice(0, Math.max(0, target - f.length));
  return { friends: f, fill };
}
