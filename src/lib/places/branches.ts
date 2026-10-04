/** Helpers for places with several branches (one guide entry, several locations). */

export interface BranchCandidate {
  providerId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** "Ravi Restaurant - Satwa" → "ravirestaurant". Cuts branch suffixes, accents and punctuation. */
export function brandKey(name: string): string {
  return name
    .split(/\s+[-–|@(]\s*|\s*\(/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Words that don't identify a brand on their own ("Cafe Nero" vs "Cafe Bateel"). */
const GENERIC = new Set(["the", "al", "el", "la", "le", "les", "il", "de", "cafe", "coffee", "restaurant", "bar", "hotel", "bistro", "kitchen", "bakery", "grill", "house", "club", "beach", "pizzeria", "trattoria", "shop", "store", "spa", "gym"]);

function firstBrandWord(name: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
  return words.find((w) => !GENERIC.has(w)) ?? "";
}

/**
 * Whether two listings look like the same brand, so one could be a branch of the other:
 * "Ravi Restaurant" / "Ravi Restaurant - Satwa", "Fuglen Tokyo" / "Fuglen Asakusa".
 * Loose on purpose — the creator ticks which suggestions really are branches.
 */
export function sameBrand(a: string, b: string): boolean {
  const x = brandKey(a);
  const y = brandKey(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 5 && long.startsWith(short)) return true;
  const w = firstBrandWord(a);
  return w.length >= 4 && w === firstBrandWord(b);
}
