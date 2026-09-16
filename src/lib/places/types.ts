import type { Category } from "./categories";

export interface PlaceResult {
  /** Google place id, or "mock:<slug>" in mock mode. */
  providerId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  category: Category;
  photoUrl: string | null;
  /** Weekday descriptions, e.g. "Monday: 11:00 AM – 9:00 PM". */
  hours: string[] | null;
  businessStatus: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
  source: "google" | "mock";
}

export interface PlaceSuggestion {
  providerId: string;
  mainText: string;
  secondaryText: string;
  source: "google" | "mock";
}

export interface PlacesProvider {
  readonly name: "google" | "mock";
  autocomplete(input: string, cityHint?: string): Promise<PlaceSuggestion[]>;
  searchText(query: string, cityHint?: string): Promise<PlaceResult | null>;
  details(providerId: string): Promise<PlaceResult | null>;
  businessStatus(providerId: string): Promise<PlaceResult["businessStatus"]>;
}
