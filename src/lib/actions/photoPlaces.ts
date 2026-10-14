"use server";

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getCurrentUser } from "../auth";
import { isAdmin } from "../admin";
import { getDb } from "../db";
import { guides, places } from "../db/schema";
import { nearbyVenues } from "../places/google";
import { canonicalCity } from "../places/cities";
import type { PhotoSpot } from "../photoSpots";
import { UserError } from "../userError";

/** Most spots looked up per run (each is one Google Nearby request). */
const MAX_SPOTS = 80;
const CONCURRENCY = 6;

export interface PhotoPlaceAlt {
  providerId: string;
  name: string;
  category: string;
}

export interface PhotoPlaceSuggestion extends PhotoPlaceAlt {
  area: string;
  city: string;
  country: string;
  photoUrl: string | null;
  photos: number;
  days: number;
  first: number;
  last: number;
  /** Already in one of your guides or My places. */
  have: boolean;
  /** Other places right there, in case the first guess is wrong. */
  alts: PhotoPlaceAlt[];
}

/**
 * Photo places (admin-only test, 14 Oct 2026): what's at each spot where you took photos. Gets spot
 * centres only (grouped on the phone), never photos.
 */
export async function lookupPhotoSpots(input: PhotoSpot[]): Promise<{ suggestions: PhotoPlaceSuggestion[]; looked: number; empty: number }> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new UserError("This test is only open to the MyGuide team for now.", "forbidden");
  const spots = (Array.isArray(input) ? input : [])
    .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180)
    .slice(0, MAX_SPOTS);

  const found: Array<{ spot: PhotoSpot; venues: Awaited<ReturnType<typeof nearbyVenues>> }> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < spots.length) {
        const spot = spots[next++];
        const venues = await nearbyVenues(spot.lat, spot.lng).catch(() => []);
        found.push({ spot, venues });
      }
    }),
  );

  const byId = new Map<string, PhotoPlaceSuggestion>();
  let empty = 0;
  for (const { spot, venues } of found) {
    const top = venues[0];
    if (!top) {
      empty++;
      continue;
    }
    const alts = venues.slice(1).map((v) => ({ providerId: v.providerId, name: v.name, category: v.category }));
    const e = byId.get(top.providerId);
    if (e) {
      e.photos += spot.photos;
      e.days += spot.days;
      e.first = Math.min(e.first, spot.first);
      e.last = Math.max(e.last, spot.last);
      for (const a of alts) if (!e.alts.some((x) => x.providerId === a.providerId)) e.alts.push(a);
    } else {
      byId.set(top.providerId, {
        providerId: top.providerId,
        name: top.name,
        category: top.category,
        area: top.area ?? "",
        city: top.city ? canonicalCity(top.city) : "",
        country: top.country,
        photoUrl: top.photoUrl,
        photos: spot.photos,
        days: spot.days,
        first: spot.first,
        last: spot.last,
        have: false,
        alts,
      });
    }
  }

  // Mark the ones you already have.
  const ids = [...byId.keys()];
  if (ids.length) {
    const db = await getDb();
    const mine = await db
      .select({ id: places.googlePlaceId })
      .from(places)
      .innerJoin(guides, eq(places.guideId, guides.id))
      .where(and(eq(guides.ownerId, user.id), isNotNull(places.googlePlaceId), inArray(places.googlePlaceId, ids)));
    for (const r of mine) if (r.id) byId.get(r.id)!.have = true;
  }

  const suggestions = [...byId.values()].sort((a, b) => b.days - a.days || b.photos - a.photos);
  return { suggestions, looked: spots.length, empty };
}
