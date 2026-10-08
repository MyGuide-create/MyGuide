import { categoryFromGoogleTypes } from "./categories";
import { tidyCity } from "./cityName";
import { sameBrand } from "./branches";
import { findCity } from "./cities";
import { haversineMeters } from "./geo";
import type { CityInfo, CitySuggestion, PlaceResult, PlaceSuggestion, PlacesProvider } from "./types";
import { splitGoogleWebsite } from "../placeLinks";
import { areaFromComponents, tidyArea, tidyPlaceName } from "./tidy";

const BASE = "https://places.googleapis.com/v1";
/** Always ask for English: otherwise Google answers in the local language (Arabic street names in Dubai). */
const LANG = "en";
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
  "internationalPhoneNumber",
  "websiteUri",
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
  internationalPhoneNumber?: string;
  websiteUri?: string;
}

function key(): string {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function toResult(p: GooglePlace): PlaceResult {
  const comp = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? "";
  const city = tidyCity(comp("locality") || comp("postal_town") || comp("administrative_area_level_2") || comp("administrative_area_level_1"));
  const country = comp("country");
  const photoUrls = (p.photos ?? []).slice(0, 8).map((ph) => `/api/places/photo?ref=${encodeURIComponent(ph.name)}`);
  const status = p.businessStatus;
  return {
    providerId: p.id,
    name: tidyPlaceName(p.displayName?.text ?? "Unnamed place"),
    address: p.formattedAddress ?? "",
    area: areaFromComponents(p.addressComponents, city),
    city,
    country,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    category: categoryFromGoogleTypes(p.primaryType, p.types, p.displayName?.text),
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    ...splitGoogleWebsite(p.websiteUri),
    hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    businessStatus:
      status === "OPERATIONAL" || status === "CLOSED_TEMPORARILY" || status === "CLOSED_PERMANENTLY" ? status : null,
    source: "google",
  };
}

async function gfetch<T>(path: string, init: RequestInit & { fieldMask?: string }): Promise<T | null> {
  // English everywhere: GET requests take it in the query string, POST ones in the body.
  let url = `${BASE}${path}`;
  let body = init.body;
  if ((init.method ?? "GET") === "GET") url += `${url.includes("?") ? "&" : "?"}languageCode=${LANG}`;
  else if (typeof body === "string") {
    try {
      body = JSON.stringify({ languageCode: LANG, ...JSON.parse(body) });
    } catch {}
  }
  const res = await fetch(url, {
    ...init,
    body,
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

function locationBias(cityHint?: string, near?: { lat: number; lng: number } | null) {
  const c = near ?? findCity(cityHint);
  if (!c) return undefined;
  return { circle: { center: { latitude: c.lat, longitude: c.lng }, radius: 30000 } };
}

export const googleProvider: PlacesProvider = {
  name: "google",

  async autocomplete(input, cityHint, near) {
    const data = await gfetch<{ suggestions?: Array<{ placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }> }>(
      "/places:autocomplete",
      { method: "POST", body: JSON.stringify({ input, locationBias: locationBias(cityHint, near) }) },
    );
    const suggestions = (data?.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map<PlaceSuggestion>((p) => ({
        providerId: p.placeId,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        source: "google",
      }));
    if (suggestions.length || input.trim().split(/\s+/).length < 2) return suggestions;
    // Autocomplete gives up on "name + area" ("Nightjar Coffee Alserkal"); a text search handles it.
    const found = await gfetch<{ places?: Array<{ id: string; displayName?: { text: string }; formattedAddress?: string }> }>("/places:searchText", {
      method: "POST",
      fieldMask: "places.id,places.displayName,places.formattedAddress",
      body: JSON.stringify({ textQuery: input, pageSize: 5, locationBias: locationBias(cityHint, near) }),
    });
    return (found?.places ?? []).map<PlaceSuggestion>((p) => ({
      providerId: p.id,
      mainText: p.displayName?.text ?? input,
      secondaryText: p.formattedAddress ?? "",
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

  async cities(input) {
    // "(regions)" covers cities, towns and regions like Bali; "(cities)" alone would miss those.
    const data = await gfetch<{ suggestions?: Array<{ placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; types?: string[] } }> }>(
      "/places:autocomplete",
      { method: "POST", body: JSON.stringify({ input, includedPrimaryTypes: ["(regions)"] }) },
    );
    return (data?.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p && !(p.types ?? []).some((t) => t === "postal_code" || t === "street_address"))
      .slice(0, 6)
      .map<CitySuggestion>((p) => ({
        id: p.placeId,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
      }));
  },

  async city(id) {
    const p = await gfetch<{ displayName?: { text: string }; addressComponents?: Array<{ longText: string; types?: string[] }>; location?: { latitude: number; longitude: number } }>(
      `/places/${encodeURIComponent(id)}`,
      { method: "GET", fieldMask: "id,displayName,addressComponents,location" },
    );
    if (!p?.location) return null;
    const comp = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? "";
    const info: CityInfo = {
      city: tidyCity(p.displayName?.text || comp("locality") || comp("administrative_area_level_1")),
      country: comp("country"),
      lat: p.location.latitude,
      lng: p.location.longitude,
    };
    return info;
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

  async branches(name, near) {
    // Light field mask on purpose: this is a list to tick from; full details are fetched for the ones picked.
    const data = await gfetch<{ places?: Array<{ id: string; displayName?: { text: string }; formattedAddress?: string; shortFormattedAddress?: string; location?: { latitude: number; longitude: number } }> }>(
      "/places:searchText",
      {
        method: "POST",
        fieldMask: "places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location",
        body: JSON.stringify({ textQuery: name, pageSize: 20, locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000 } } }),
      },
    );
    return (data?.places ?? [])
      .filter((p) => p.location && p.displayName?.text && sameBrand(p.displayName.text, name))
      .map((p) => ({
        providerId: p.id,
        name: p.displayName!.text,
        address: p.shortFormattedAddress || p.formattedAddress || "",
        lat: p.location!.latitude,
        lng: p.location!.longitude,
      }));
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
/**
 * Google's best matches for a name right around a known point (e.g. a place from a saved
 * Google Maps list). A tight bias keeps "Starbucks" from matching the wrong branch.
 */
export async function searchTextNear(query: string, near: { lat: number; lng: number }, radiusMeters = 200, pageSize = 3): Promise<PlaceResult[]> {
  if (!key()) return [];
  const data = await gfetch<{ places?: GooglePlace[] }>("/places:searchText", {
    method: "POST",
    fieldMask: FIELDS.map((f) => `places.${f}`).join(","),
    body: JSON.stringify({ textQuery: query, pageSize, locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: radiusMeters } } }),
  });
  return (data?.places ?? []).map(toResult);
}

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

/**
 * Rough "where is this" for a dropped pin (city, country and a short area line).
 * Uses the Geocoding API; returns null if it isn't enabled for the key or finds nothing.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<{ area: string; hood: string; city: string; country: string } | null> {
  if (!key()) return null;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=${LANG}&key=${key()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; results?: { address_components: { long_name: string; types: string[] }[] }[] };
    if (data.status !== "OK" || !data.results?.length) {
      if (data.status !== "ZERO_RESULTS") console.warn("[places/google] geocode", data.status);
      return null;
    }
    const comps = data.results.flatMap((r) => r.address_components);
    const find = (...types: string[]) => comps.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? "";
    const near = tidyArea(find("neighborhood", "sublocality", "sublocality_level_1"));
    const city = tidyCity(find("locality", "postal_town") || find("administrative_area_level_2") || find("administrative_area_level_1"));
    const country = find("country");
    const area = [near && near !== city ? near : "", city, country].filter(Boolean).join(", ");
    return { area, hood: near && near !== city ? near : "", city, country };
  } catch (e) {
    console.warn("[places/google] geocode failed", e);
    return null;
  }
}
