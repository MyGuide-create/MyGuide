/**
 * Clean-ups for names and addresses that come straight from Google.
 * Used when places are saved (new places) and by scripts/refresh-places.mjs (existing ones).
 */

const SMALL = new Set(["a", "an", "and", "at", "by", "de", "del", "di", "du", "for", "in", "la", "le", "of", "on", "or", "the", "to", "y"]);

/**
 * "CAFE BATEEL" → "Cafe Bateel", "THE SURF CLUB DUBAI" → "The Surf Club Dubai".
 * Only touches names written entirely in capitals with at least one word of 4+ letters,
 * so brands like "KFC", "BBQ 21" or "PF Chang's" stay as they are.
 */
export function tidyPlaceName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return trimmed;
  if (!trimmed.split(" ").some((w) => w.replace(/[^A-Za-z]/g, "").length >= 4)) return trimmed;
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && SMALL.has(w)) return w;
      // Capitalise after hyphens/apostrophes too: "AL-SAFA" → "Al-Safa", "O'NEILL" → "O'Neill" (but "joe's" → "Joe's").
      return w.replace(/(^|[-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()).replace(/'([a-z])(?=[a-z])/g, (_, c: string) => `'${c.toUpperCase()}`);
    })
    .join(" ");
}

/** Bits of an address that are directions, not places: "opposite Umm Suqeim Park", "near Mall", "behind…". */
const DIRECTIONS = /^(opp\.?|opposite|near|nr\.?|next to|beside|behind|in front of|across from|facing|after|before|off)\b/i;
/** "Street 24", "St 24", "24th Street", "Street No. 5", "Road 2A". */
const NUMBERED_STREET = /^(street|st\.?|road|rd\.?|lane|alley)\s*(no\.?\s*)?\d+[a-z]?$|^\d+[a-z]?(st|nd|rd|th)?\s+(street|st\.?|road|rd\.?)$/i;
const HAS_LATIN = /[A-Za-z]/;

/** True for address parts that should never be shown as an area. */
export function isNoiseAddressPart(part: string): boolean {
  return DIRECTIONS.test(part) || NUMBERED_STREET.test(part) || !HAS_LATIN.test(part);
}

/** Title-cases an all-caps area ("UMM SUQEIM" → "Umm Suqeim"); leaves normal text alone. */
export function tidyArea(area: string): string {
  const a = area.trim();
  if (!a || isNoiseAddressPart(a)) return "";
  return tidyPlaceName(a);
}

/** Google address components → the neighbourhood we show under a place. */
export function areaFromComponents(components: Array<{ longText?: string; long_name?: string; types?: string[] }> | undefined, city: string): string {
  if (!components?.length) return "";
  const text = (c: { longText?: string; long_name?: string }) => c.longText ?? c.long_name ?? "";
  for (const type of ["neighborhood", "sublocality_level_1", "sublocality", "sublocality_level_2"]) {
    const hit = components.find((c) => c.types?.includes(type));
    const area = hit ? tidyArea(text(hit)) : "";
    if (area && area.toLowerCase() !== city.toLowerCase()) return area;
  }
  return "";
}
