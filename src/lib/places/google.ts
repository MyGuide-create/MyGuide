import { categoryFromGoogleTypes } from "./categories";
import { findCity } from "./cities";
import { haversineMeters } from "./geo";
import type { PlaceResult, PlaceSuggestion, PlacesProvider } from "./types";

const BASE = "https://places.googleapis.com/v1";
const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "primaryType",
  "types",
  "photos",
  "regularOpeningHours",
  "businessStatus",
  "nationalPhoneNumber",
];
const FIELD_MASK = FIELDS.join(",");

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: Array<{ longText: string; types?: string[] }>;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  photos?: Array<{ name: string }>;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: string;
  nationalPhoneNumber?: string;
}

function key(): string {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function toResult(p: GooglePlace): PlaceResult {
  const comp = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? "";
  const city = comp("locality") || comp("postal_town") || comp("administrative_area_level_2") || comp("administrative_area_level_1");
  const country = comp("country");
  const photoUrls = (p.photos ?? []).slice(0, 8).map((ph) => `/api/places/photo?ref=${encodeURIComponent(ph.name)}`);
  const status = p.businessStatus;
  return {
    providerId: p.id,
    name: p.displayName?.text ?? "Unnamed place",
    address: p.formattedAddress ?? "",
    city,
    country,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    category: categoryFromGoogleTypes(p.primaryType, p.types),
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    phone: p.nationalPhoneNumber ?? null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    businessStatus:
      status === "OPERATIONAL" || status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY" ? status : null,
    source: "google",
  };
}

async function gfetch<T>(path: string, init: RequestInit & { fieldMask?: string }): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[places/google] ${path} -> ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }
  return (await res.json()) as T;
}

function locationBias(cityHint?: string) {
  const c = findCity(cityHint);
  if (!c) return undefined;
  return { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 30000 } };
}

export const googleProvider: PlacesProvider = {
  name: "google",

  async autocomplete(input, cityHint) {
    const data = await gfetch<{ suggestions?: Array<{ placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }> }>(
      "/places:autocomplete",
      { method: "POST", body: JSON.stringify({ input, locationBias: locationBias(cityHint) }) },
    );
    return (data?.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map<PlaceSuggestion>((p) => ({
        providerId: p.placeId,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        source: "google",
      }));
  },

  async searchText(query, cityHint) {
    const textQuery = cityHint && !query.toLowerCase().includes(cityHint.toLowerCase()) ? `${query}, ${cityHint}` : query;
    const data = await gfetch<{ places?: GooglePlace[] }>("/places:searchText", {
      method: "POST",
      fieldMask: FIELDS.map((f) => `places.${f}`).join(","),
      body: JSON.stringify({ textQuery, pageSize: 1, locationBias: locationBias(cityHint) }),
    });
    const p = data?.places?.[0];
    return p ? toResult(p) : null;
  },

  async details(providerId) {
    const p = await gfetch<GooglePlace>(`/places/${encodeURIComponent(providerId)}`, { method: "GET", fieldMask: FIELD_MASK });
    return p ? toResult(p) : null;
  },

  async businessStatus(providerId) {
    const p = await gfetch<GooglePlace>(`/places/${encodeURIComponent(providerId)}`, { method: "GET", fieldMask: "id,businessStatus" });
    const s = p?.businessStatus;
    return s === "OPERATIONAL" || s === "CLOSED_TEMPORARILY" || s === "CLOSED_PERMANENTLY" ? s : null;
  },

  async nearby(lat, lng, radiusMeters = 600) {
    const data = await gfetch<{ places?: GooglePlace[] }>("/places:searchNearby", {
      method: "POST",
      fieldMask: FIELDS.map((f) => `places.${f}`).join(","),
      body: JSON.stringify({
        maxResultCount: 8,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
      }),
    });
    return (data?.places ?? [])
      .map((p) => {
        const r = toResult(p);
        return { ...r, distanceMeters: haversineMeters(lat, lng, r.lat, r.lng) };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  },
};

/** Resolve a Google photo resource name to a CDN URL (no API key in the URL). */
export async function resolvePhotoUri(photoName: string, maxWidthPx = 900): Promise<string | null> {
  const res = await fetch(
    `${BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(key())}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { photoUri?: string };
  return data.photoUri ?? null;
}

export interface GooglePhotoOption {
  ref: string;
  author: string;
  authorUrl: string | null;
}

/** Photos (with the photographer attribution Google requires) for one place. */
export async function getPlacePhotos(googlePlaceId: string, limit = 4): Promise<GooglePhotoOption[]> {
  if (!key() || !googlePlaceId) return [];
  const data = await gfetch<{ photos?: Array<{ name: string; authorAttributions?: Array<{ displayName?: string; uri?: string }> }> }>(
    `/places/${encodeURIComponent(googlePlaceId)}`,
    { method: "GET", fieldMask: "photos" },
  );
  return (data?.photos ?? []).slice(0, limit).map((ph) => ({
    ref: ph.name,
    author: ph.authorAttributions?.[0]?.displayName ?? "Google Maps contributor",
    authorUrl: ph.authorAttributions?.[0]?.uri ?? null,
  }));
}
