import { getPlacesProvider } from ".";
import { findCityExact } from "./cities";
import { looksLikeMisspelling } from "./spelling";
import type { CityInfo, CitySuggestion } from "./types";

/**
 * Is typed city text a misspelling of a real one? "Brussles" → Brussels, Belgium.
 * Null when it looks fine: a known city, an exact Google match, or nothing close.
 */
export async function citySpellingSuggestion(text: string): Promise<CitySuggestion | null> {
  const q = text.trim().slice(0, 80);
  if (q.length < 3 || findCityExact(q)) return null;
  try {
    const provider = getPlacesProvider();
    const list = await provider.cities(q);
    if (list.some((s) => s.mainText.trim().toLowerCase() === q.toLowerCase())) return null;
    const close = list.find((s) => looksLikeMisspelling(q, s.mainText));
    if (close) return close;
    const found = await provider.cityByText(q);
    return found && looksLikeMisspelling(q, found.mainText) ? found : null;
  } catch (e) {
    console.warn("[citySpellingSuggestion]", e);
    return null;
  }
}

/**
 * Server-side safety net for every city typed by hand (guides, wish lists): a clear misspelling
 * is saved as the real city, with its country and centre. Null when the text should stay as typed.
 */
export async function correctTypedCity(text: string): Promise<CityInfo | null> {
  const s = await citySpellingSuggestion(text);
  if (!s) return null;
  try {
    return (await getPlacesProvider().city(s.id)) ?? { city: s.mainText, country: s.secondaryText.split(",").pop()?.trim() ?? "", lat: NaN, lng: NaN };
  } catch {
    return { city: s.mainText, country: s.secondaryText.split(",").pop()?.trim() ?? "", lat: NaN, lng: NaN };
  }
}
