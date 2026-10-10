import { categoryFromGoogle, categoryFromName as nameRule } from "./categoryRules.mjs";

export const CATEGORIES = [
  "Food & Drinks",
  "Nightlife",
  "Scenic Spots",
  "Entertainment",
  "Sports & Wellness",
  "Beauty",
  "Spiritual",
  "Shopping",
  "Nature",
  "Stay",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

// The Google type → category rules live in categoryRules.mjs (shared with scripts/recategorize-places.mjs).

export function categoryFromGoogleTypes(primaryType?: string, types?: string[], name?: string): Category {
  return categoryFromGoogle(primaryType, types, name) as Category;
}

/** Rough category guess from a place name, used for mock data / offline mode. */
export function guessCategoryFromName(name: string): Category {
  return categoryFromName(name) ?? "Food & Drinks";
}

/** Category when the name clearly says one ("… Nail Spa", "… Coffee"), else null. */
export function categoryFromName(name: string): Category | null {
  return nameRule(name) as Category | null;
}

export const CATEGORY_ICON: Record<Category, string> = {
  "Food & Drinks": "fork",
  Nightlife: "moon",
  "Scenic Spots": "camera",
  Entertainment: "ticket",
  "Sports & Wellness": "leaf",
  Beauty: "sparkle",
  Spiritual: "sun",
  Shopping: "bag",
  Nature: "tree",
  Stay: "bed",
};
