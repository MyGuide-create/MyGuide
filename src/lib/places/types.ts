import type { BranchCandidate } from "./branches";
import type { Category } from "./categories";

export interface PlaceResult {
  /** Google place id, or "mock:<slug>" in mock mode. */
  providerId: string;
  name: string;
  address: string;
  /** Neighbourhood ("Umm Suqeim"), "" when Google doesn't say. */
  area?: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  category: Category;
  photoUrl: string | null;
  /** Additional photo URLs (Google Places proxy or mock), including photoUrl as the first entry when present. */
  photoUrls: string[];
  phone: string | null;
  /** Venue website, when Google has one. */
  website: string | null;
  /** Instagram handle, when Google lists an Instagram page as the website. */
  instagram: string | null;
  /** Weekday descriptions, e.g. "Monday: 11:00 AM – 9:00 PM". */
  hours: string[] | null;
  businessStatus: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
  /** "pin" = a dropped pin with no listing (no provider id). */
  source: "google" | "mock" | "pin";
}

export interface NearbyPlaceResult extends PlaceResult {
  distanceMeters: number;
}

export interface PlaceSuggestion {
  providerId: string;
  mainText: string;
  secondaryText: string;
  source: "google" | "mock";
}

/** A city or region from the city picker ("Tashkent" · "Uzbekistan"). */
export interface CitySuggestion {
  id: string;
  mainText: string;
  secondaryText: string;
}

export interface CityInfo {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

export interface PlacesProvider {
  readonly name: "google" | "mock";
  autocomplete(input: string, cityHint?: string, near?: { lat: number; lng: number } | null): Promise<PlaceSuggestion[]>;
  /** Cities and regions only, for "Going somewhere?" and a guide's city. */
  cities(input: string): Promise<CitySuggestion[]>;
  city(id: string): Promise<CityInfo | null>;
  /** The closest real city/region to some free text, typos and all ("Brussles" → Brussels). */
  cityByText(text: string): Promise<CitySuggestion | null>;
  searchText(query: string, cityHint?: string): Promise<PlaceResult | null>;
  details(providerId: string): Promise<PlaceResult | null>;
  businessStatus(providerId: string): Promise<PlaceResult["businessStatus"]>;
  /** Real places near a coordinate, closest first. Used by the "record a place" flow to confirm where the user is standing. */
  nearby(lat: number, lng: number, radiusMeters?: number): Promise<NearbyPlaceResult[]>;
  /** Other listings with the same name near a point — candidate branches of a place. */
  branches(name: string, near: { lat: number; lng: number }): Promise<BranchCandidate[]>;
}
