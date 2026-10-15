"use server";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getCurrentUser } from "../auth";
import { isAdmin } from "../admin";
import { getDb } from "../db";
import { guides, photoPlaceFeedback, places, users } from "../db/schema";
import { placesAround, searchTextNear, venueCandidates, type VenueCandidate } from "../places/google";
import { canonicalCity } from "../places/cities";
import type { PlaceResult } from "../places/types";
import { distanceM, type PhotoSpot } from "../photoSpots";
import { isStash } from "../stash";
import { UserError } from "../userError";
import { newId } from "../utils";
import { confidenceOf, isPassingBy, kindOf, reachOf, reasonOf, scoreCandidate, type Confidence } from "../photoScore";

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
  /** Kind of place ("food", "stay", "coffee"…), for the corrections log. */
  kind?: string;
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
  /** "sure" when one place clearly fits; "guess" otherwise (shown under "More guesses"). */
  confidence: Confidence;
  /** Looks like you were just walking past (one quick photo or a few in a couple of minutes). */
  passing: boolean;
  /** A few words on why this place ("evening photos · 2.3k Google reviews"). */
  reason: string;
  /** The first guess, kept as it was, for the corrections log. */
  guess: { id: string; name: string; kind: string };
  /** Spot details for the corrections log. */
  dwell: number;
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

function option(r: PlaceResult & { distanceMeters: number; primaryType?: string; types?: string[] }, mine: Mine[]): PhotoPlaceOption {
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
    kind: r.primaryType || r.types?.length ? kindOf({ primaryType: r.primaryType ?? "", types: r.types ?? [] }) : r.category.toLowerCase(),
  };
}

/** The places around a spot worth considering: close by first, wider if nothing, and hotels for overnight stays. */
async function candidatesFor(spot: PhotoSpotIn): Promise<VenueCandidate[]> {
  const near = Math.round(Math.min(150, Math.max(60, reachOf(spot) * 1.5)));
  let c = await venueCandidates(spot.lat, spot.lng, near).catch(() => []);
  if (!c.length) c = await venueCandidates(spot.lat, spot.lng, 250).catch(() => []);
  // Photos over several days, or nothing at all: maybe a resort or big hotel whose pin is far from where you were.
  if ((spot.days >= 2 || !c.length) && !c.some((x) => kindOf(x) === "stay")) {
    const stays = await venueCandidates(spot.lat, spot.lng, 800, ["lodging"], 5).catch(() => []);
    c = [...c, ...stays.filter((x) => !c.some((y) => y.providerId === x.providerId))];
  }
  return c;
}

/** How many other people on MyGuide have each place (by Google id). */
async function onMyGuideCounts(userId: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const db = await getDb();
  for (let k = 0; k < ids.length; k += 200) {
    const rows = await db
      .selectDistinct({ id: places.googlePlaceId, owner: guides.ownerId })
      .from(places)
      .innerJoin(guides, eq(places.guideId, guides.id))
      .where(and(inArray(places.googlePlaceId, ids.slice(k, k + 200)), ne(guides.ownerId, userId)));
    for (const r of rows) if (r.id) out.set(r.id, (out.get(r.id) ?? 0) + 1);
  }
  return out;
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
      const out: Array<{ spot: PhotoSpotIn; venues: VenueCandidate[] }> = [];
      let next = 0;
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (next < spots.length) {
            const spot = spots[next++];
            out.push({ spot, venues: await candidatesFor(spot) });
          }
        }),
      );
      return out;
    })(),
  ]);

  const counts = await onMyGuideCounts(user.id, [...new Set(found.flatMap((f) => f.venues.map((v) => v.providerId)))]).catch(() => new Map<string, number>());

  const byId = new Map<string, PhotoPlaceSuggestion & { biggest: number }>();
  let empty = 0;
  for (const { spot, venues: raw } of found) {
    // Most likely first: distance, how well known, kind of place, time of day, and who on MyGuide has it.
    const scored = raw
      .map((v) => {
        const input = { ...v, onMyGuide: counts.get(v.providerId) ?? 0 };
        return { v, input, score: scoreCandidate(input, spot) };
      })
      .sort((a, b) => b.score - a.score);
    const venues = scored.map((x) => x.v);
    const top = venues[0];
    const confidence: Confidence = scored.length ? confidenceOf(scored.map((x) => x.score), spot) : "guess";
    const passing = isPassingBy(spot);
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
        confidence: "guess",
        passing,
        reason: "",
        guess: { id: "", name: "", kind: "" },
        dwell: spot.dwell ?? 0,
      });
      continue;
    }
    const alts = venues.slice(1, 6).map((v) => option(v, mine));
    const e = byId.get(top.providerId);
    if (e) {
      e.photos += spot.photos;
      e.days += spot.days;
      e.first = Math.min(e.first, spot.first);
      e.last = Math.max(e.last, spot.last);
      e.spotIds.push(spot.id);
      if (confidence === "sure") e.confidence = "sure";
      e.passing = e.passing && passing;
      e.dwell = Math.max(e.dwell, spot.dwell ?? 0);
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
        confidence,
        passing,
        reason: reasonOf(scored[0].input, spot),
        guess: { id: top.providerId, name: top.name, kind: kindOf(top) },
        dwell: spot.dwell ?? 0,
      });
    }
  }
  const suggestions = [...byId.values()]
    .map((x) => {
      const { biggest, ...rest } = x;
      void biggest;
      return rest;
    })
    .sort((a, b) => Number(b.confidence === "sure") - Number(a.confidence === "sure") || b.days - a.days || b.photos - a.photos);
  return { suggestions, looked: spots.length, empty };
}

export interface PhotoFeedbackIn {
  /** kept = recommended the first guess; alt = a "Not it?" chip; list/search = picked in Find it; none = "None of these". */
  how: "kept" | "alt" | "list" | "search" | "none";
  confidence: Confidence;
  guessId: string;
  guessName: string;
  guessKind: string;
  chosenId?: string;
  chosenName?: string;
  chosenKind?: string;
  /** Anything else worth knowing (distance, photos, dwell…). */
  detail?: Record<string, string | number | boolean | null>;
}

const HOWS = new Set(["kept", "alt", "list", "search", "none"]);
const cut = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");

/** Records what people keep and correct, to see where the guesses go wrong. */
export async function logPhotoFeedback(entries: PhotoFeedbackIn[]): Promise<void> {
  const user = await requireAdminUser();
  const rows = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && HOWS.has(e.how))
    .slice(0, 200)
    .map((e) => ({
      id: newId(),
      userId: user.id,
      how: e.how,
      confidence: e.confidence === "sure" ? "sure" : "guess",
      guessId: cut(e.guessId),
      guessName: cut(e.guessName),
      guessKind: cut(e.guessKind, 40),
      chosenId: cut(e.chosenId) || null,
      chosenName: cut(e.chosenName) || null,
      chosenKind: cut(e.chosenKind, 40) || null,
      detail: e.detail ? JSON.stringify(e.detail).slice(0, 2000) : null,
      createdAt: new Date(),
    }));
  if (!rows.length) return;
  const db = await getDb();
  await db.insert(photoPlaceFeedback).values(rows);
}

export interface PhotoFeedbackRow {
  at: number;
  who: string;
  how: string;
  confidence: string;
  guessName: string;
  guessKind: string;
  chosenName: string | null;
  chosenKind: string | null;
  detail: Record<string, unknown> | null;
}

/** The latest corrections from the team, for /photo-places/corrections. */
export async function recentPhotoFeedback(limit = 300): Promise<PhotoFeedbackRow[]> {
  await requireAdminUser();
  const db = await getDb();
  const rows = await db
    .select({ f: photoPlaceFeedback, who: users.username })
    .from(photoPlaceFeedback)
    .innerJoin(users, eq(photoPlaceFeedback.userId, users.id))
    .orderBy(desc(photoPlaceFeedback.createdAt))
    .limit(limit);
  return rows.map(({ f, who }) => {
    let detail: Record<string, unknown> | null = null;
    try {
      detail = f.detail ? (JSON.parse(f.detail) as Record<string, unknown>) : null;
    } catch {
      detail = null;
    }
    return {
      at: f.createdAt.getTime(),
      who,
      how: f.how,
      confidence: f.confidence,
      guessName: f.guessName,
      guessKind: f.guessKind,
      chosenName: f.chosenName,
      chosenKind: f.chosenKind,
      detail,
    };
  });
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
