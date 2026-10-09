/**
 * "Brussles" vs "Brussels": is one a likely misspelling of the other?
 * Optimal-string-alignment distance (a swap of two letters counts as one edit),
 * ignoring case and accents. Allowed edits grow with length: 1 up to 5 letters, 2 up to 9, then 3.
 */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** True when `typed` looks like a misspelling of `real` (and isn't simply the same name). */
export function looksLikeMisspelling(typed: string, real: string): boolean {
  const a = norm(typed);
  const b = norm(real);
  if (!a || !b || a === b) return false;
  const allowed = b.length <= 5 ? 1 : b.length <= 9 ? 2 : 3;
  return editDistance(a, b) <= allowed;
}
