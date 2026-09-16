import { googleProvider } from "./google";
import { mockProvider } from "./mock";
import type { PlacesProvider } from "./types";

export * from "./types";
export { CATEGORIES, isCategory, type Category } from "./categories";

export function hasGoogleKey(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY?.trim();
}

/** Live Google Places when a key is configured, realistic mock data otherwise. */
export function getPlacesProvider(): PlacesProvider {
  return hasGoogleKey() ? googleProvider : mockProvider;
}

/**
 * Resolve a place by name, falling back to mock data if Google returns
 * nothing. Never throws: a missing place resolves to null so the UI can ask
 * the creator to fix it.
 */
export async function resolvePlaceByName(name: string, cityHint?: string) {
  const provider = getPlacesProvider();
  try {
    const hit = await provider.searchText(name, cityHint);
    if (hit) return hit;
  } catch (e) {
    console.warn("[places] searchText failed", e);
  }
  if (provider.name === "google") {
    try {
      return await mockProvider.searchText(name, cityHint);
    } catch {
      return null;
    }
  }
  return null;
}
