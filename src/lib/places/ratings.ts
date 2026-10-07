import { unstable_cache } from "next/cache";
import { hasGoogleKey } from "./index";
import type { GoogleRating } from "./ratingFormat";

export type { GoogleRating };

/**
 * Google's own rating for a place, shown next to the creator's note as a quiet
 * second opinion ("★ 4.6 (1.2k) · $$").
 *
 * Google's terms don't allow storing ratings in our database, so they are
 * looked up live and kept in Next's data cache for a day at most. One lookup
 * per place per day, shared by every viewer.
 */
const PRICE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function fetchRating(googlePlaceId: string): Promise<GoogleRating | null> {
  if (googlePlaceId.startsWith("mock:")) return hasGoogleKey() ? null : mockRating(googlePlaceId);
  if (!hasGoogleKey()) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "",
      "X-Goog-FieldMask": "rating,userRatingCount,priceLevel",
    },
    cache: "no-store",
  });
  // Throwing (rather than returning null) keeps a failed lookup out of the cache.
  if (!res.ok) throw new Error(`ratings ${googlePlaceId} -> ${res.status}`);
  const p = (await res.json()) as { rating?: number; userRatingCount?: number; priceLevel?: string };
  const price = p.priceLevel ? PRICE[p.priceLevel] ?? null : null;
  if (!p.rating || !p.userRatingCount) return price ? { rating: 0, count: 0, price } : null;
  return { rating: Math.round(p.rating * 10) / 10, count: p.userRatingCount, price };
}

const cachedRating = unstable_cache(
  async (googlePlaceId: string) => fetchRating(googlePlaceId),
  ["google-rating-v1"],
  { revalidate: 60 * 60 * 24, tags: ["google-ratings"] },
);

/** Ratings keyed by Google place id. Places without one (dropped pins) or failed lookups are left out. */
export async function getGoogleRatings(googlePlaceIds: Array<string | null | undefined>): Promise<Record<string, GoogleRating>> {
  const ids = [...new Set(googlePlaceIds.filter((id): id is string => !!id))].slice(0, 80);
  const out: Record<string, GoogleRating> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await cachedRating(id);
        if (r) out[id] = r;
      } catch (e) {
        console.warn("[places/ratings]", e);
      }
    }),
  );
  return out;
}

/** Mock mode (no Maps key, local dev): stable made-up ratings so the UI can be seen. */
function mockRating(id: string): GoogleRating {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { rating: Math.round((3.9 + (h % 11) / 10) * 10) / 10, count: 40 + (h % 4000), price: 1 + (h % 4) };
}
