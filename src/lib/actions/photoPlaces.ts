"use server";

import { eq } from "drizzle-orm";
import { getCurrentUser } from "../auth";
import { isAdmin } from "../admin";
import { getDb } from "../db";
import { guides, places } from "../db/schema";
import { nearbyVenues, placesAround, searchTextNear } from "../places/google";
import { canonicalCity } from "../places/cities";
import type { PlaceResult } from "../places/types";
import { distanceM, type PhotoSpot } from "../photoSpots";
import { isStash } from "../stash";
import { UserError } from "../userError";

/** Most spots looked up per run (each is one Google Nearby request). */
const MAX_SPOTS = 80;
const CONCURRENCY = 6;

/** One place a spot might be. */
export interface PhotoPlaceOption {
  providerId: string;
  name: string;
  category: string;
  area: string;
  city: string;
  photoUrl: string | null;
  /** Metres from the middle of where the photos were taken. */
  distance: number;
  /** "My places" or the guide it's already in; null when it's new to you. */
  haveIn: string | null;
  /** Where the place is. */
  lat: number;
  lng: number;
}

export interface PhotoPlaceSuggestion extends PhotoPlaceOption {
  country: string;
  photos: number;
  days: number;
  first: number;
  last: number;
  /** The photo spots (ids from the phone) this place came from, to show those photos. */
  spotIds: string[];
  /** Middle of the biggest of those spots (where the photos were taken). */
  spotLat: number;
  spotLng: number;
  /** Other places right there, in case the first guess is wrong. */
  alts: PhotoPlaceOption[];
  /** Nothing obvious there: shown as "Not sure what's here" so you can find it yourself (providerId "spot:<id>"). */
  unknown?: boolean;
}

export type PhotoSpotIn = PhotoSpot & { id: string };

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) throw new UserError("This test is only open to the MyGuide team for now.", "forbidden");
  return user;
}

type Mine = { googlePlaceId: string | null; name: string; lat: number | null; lng: number | null; where: string };

/** Every place you already have (My places and your guides), to mark suggestions you have. */
async function loadMine(userId: string): Promise<Mine[]> {
  const db = await getDb();
  const rows = await db
    .select({ googlePlaceId: places.googlePlaceId, name: places.name, lat: places.lat, lng: places.lng, title: guides.title, publishedAt: guides.publishedAt })
    .from(places)
    .innerJoin(guides, eq(places.guideId, guides.id))
    .where(eq(guides.ownerId, userId))
    .limit(5000);
  return rows.map((r) => ({ googlePlaceId: r.googlePlaceId, name: r.name, lat: r.lat, lng: r.lng, where: isStash(r) ? "My places" : r.title }));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Where you already have this place (same Google id, or the same name within 150 m), else null. */
function haveIn(mine: Mine[], r: Pick<PlaceResult, "providerId" | "name" | "lat" | "lng">): string | null {
  const n = norm(r.name);
  const hits = mine.filter((m) => {
    if (m.googlePlaceId && m.googlePlaceId === r.providerId) return true;
    if (m.lat == null || m.lng == null) return false;
    const mn = norm(m.name);
    const sameName = !!n && !!mn && (mn === n || mn.startsWith(n) || n.startsWith(mn));
    return sameName && distanceM({ lat: m.lat, lng: m.lng }, r) < 150;
  });
  if (!hits.length) return null;
  // A guide says more than "My places".
  return (hits.find((h) => h.where !== "My places") ?? hits[0]).where;
}

function option(r: PlaceResult & { distanceMeters: number }, mine: Mine[]): PhotoPlaceOption {
  return {
    providerId: r.providerId,
    name: r.name,
    category: r.category,
    area: r.area ?? "",
    city: r.city ? canonicalCity(r.city) : "",
    photoUrl: r.photoUrl,
    distance: Math.round(r.distanceMeters),
    haveIn: haveIn(mine, r),
    lat: r.lat,
    lng: r.lng,
  };
}

/**
 * Photo places (admin-only test, 14 Oct 2026): what's at each spot where you took photos. Gets spot
 * centres only (grouped on the phone), never photos.
 */
export async function lookupPhotoSpots(input: PhotoSpotIn[]): Promise<{ suggestions: PhotoPlaceSuggestion[]; looked: number; empty: number }> {
  const user = await requireAdminUser();
  const spots = (Array.isArray(input) ? input : [])
    .filter((s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lng) && Math.abs(s.lat) <= 90 && Math.abs(s.lng) <= 180)
    .slice(0, MAX_SPOTS);

  const [mine, found] = await Promise.all([
    loadMine(user.id),
    (async () => {
      const out: Array<{ spot: PhotoSpotIn; venues: Awaited<ReturnType<typeof nearbyVenues>> }> = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (next < spots.length) {
            const spot = spots[next++];
            // Right where the photos were; if nothing, look a bit wider (hotels, beaches and parks are big).
            let venues = await nearbyVenues(spot.lat, spot.lng).catch(() => []);
            if (!venues.length) venues = await nearbyVenues(spot.lat, spot.lng, 200).catch(() => []);
            out.push({ spot, venues });
          }
        }),
      );
      return out;
    })(),
  ]);

  const byId = new Map<string, PhotoPlaceSuggestion & { biggest: number }>();
  let empty = 0;
  for (const { spot, venues } of found) {
    const top = venues[0];
    if (!top) {
      empty++;
      byId.set(`spot:${spot.id}`, {
        providerId: `spot:${spot.id}`,
        name: "",
        category: "",
        area: "",
        city: "",
        photoUrl: null,
        distance: 0,
        haveIn: null,
        lat: spot.lat,
        lng: spot.lng,
        country: "",
        photos: spot.photos,
        days: spot.days,
        first: spot.first,
        last: spot.last,
        spotIds: [spot.id],
        spotLat: spot.lat,
        spotLng: spot.lng,
        biggest: spot.photos,
        alts: [],
        unknown: true,
      });
      continue;
    }
    const alts = venues.slice(1).map((v) => option(v, mine));
    const e = byId.get(top.providerId);
    if (e) {
      e.photos += spot.photos;
      e.days += spot.days;
      e.first = Math.min(e.first, spot.first);
      e.last = Math.max(e.last, spot.last);
      e.spotIds.push(spot.id);
      if (spot.photos > e.biggest) Object.assign(e, { biggest: spot.photos, spotLat: spot.lat, spotLng: spot.lng });
      for (const a of alts) if (!e.alts.some((x) => x.providerId === a.providerId)) e.alts.push(a);
    } else {
      byId.set(top.providerId, {
        ...option(top, mine),
        country: top.country,
        photos: spot.photos,
        days: spot.days,
        first: spot.first,
        last: spot.last,
        spotIds: [spot.id],
        spotLat: spot.lat,
        spotLng: spot.lng,
        biggest: spot.photos,
        alts,
      });
    }
  }
  const suggestions = [...byId.values()]
    .map((x) => {
      const { biggest, ...rest } = x;
      void biggest;
      return rest;
    })
    .sort((a, b) => b.days - a.days || b.photos - a.photos);
  return { suggestions, looked: spots.length, empty };
}

/** Everything around a photo spot (any kind of place), nearest first — for "Find the right place". */
export async function placesNearSpot(lat: number, lng: number, radius: number): Promise<PhotoPlaceOption[]> {
  const user = await requireAdminUser();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const r = Math.min(Math.max(Number(radius) || 120, 30), 500);
  const [mine, found] = await Promise.all([loadMine(user.id), placesAround(lat, lng, r)]);
  return found.map((f) => option(f, mine));
}

/** A typed name, looked up around a photo spot. */
export async function searchNearSpot(query: string, lat: number, lng: number): Promise<PhotoPlaceOption[]> {
  const user = await requireAdminUser();
  const q = String(query ?? "").trim().slice(0, 120);
  if (!q || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const [mine, found] = await Promise.all([loadMine(user.id), searchTextNear(q, { lat, lng }, 1500, 8)]);
  return found
    .map((f) => ({ ...f, distanceMeters: distanceM({ lat, lng }, f) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .map((f) => option(f, mine));
}
