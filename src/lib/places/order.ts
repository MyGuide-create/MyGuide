import { CATEGORIES } from "./categories";

const rank = (c: string) => {
  const i = (CATEGORIES as readonly string[]).indexOf(c);
  return i === -1 ? CATEGORIES.length : i;
};

/** Categories present in a guide, in the fixed display order. */
export function orderedCategories<T extends { category: string }>(places: T[]): string[] {
  return [...new Set(places.map((p) => p.category))].sort((a, b) => rank(a) - rank(b));
}

/**
 * The order a guide's places are shown in (grouped by category, guide order within).
 * List numbers, map pins and next/previous all follow this.
 */
export function orderPlaces<T extends { category: string }>(places: T[]): T[] {
  return orderedCategories(places).flatMap((c) => places.filter((p) => p.category === c));
}
