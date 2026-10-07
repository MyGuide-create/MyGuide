/** Client-safe types and formatting for Google ratings (fetching lives in ratings.ts). */
export interface GoogleRating {
  /** 0 when Google has a price level but no reviews. */
  rating: number;
  count: number;
  /** 1–4 ($ to $$$$), null when Google has no price level. */
  price: number | null;
}

/** "1.2k", "860" */
export function compactCount(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function priceLabel(price: number | null): string | null {
  return price ? "$".repeat(price) : null;
}
