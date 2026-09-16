import { CATEGORIES, type Category } from "../places/categories";
import { detectCityInText, findCity } from "../places/cities";

export interface ParsedPlaceList {
  title: string;
  city: string;
  country: string;
  places: Array<{ name: string; cityHint?: string }>;
}

export interface SearchIntent {
  /** Free-text terms to match against titles/descriptions. */
  keywords: string[];
  city?: string;
  country?: string;
  /** "public" (everyone) or "following" (people I follow). */
  scope: "public" | "following";
  category?: Category;
  /** Restrict to guides by this username (e.g. "guides by yara"). */
  byUsername?: string;
}

const FILLER = /\b(um+|uh+|erm|like|you know|let's see|lets see|so|okay|ok|and then|then|also|plus|as well|too|please|first|second|third|next|finally|lastly)\b/gi;
const LEAD_IN = /^(?:(?:i (?:want|would like|wanna|'d like) (?:to )?(?:add|include|put)|add|include|put|make (?:me )?(?:a )?guide (?:with|of|for)|(?:a )?guide (?:with|of|for)|places?(?: are)?|here(?:'s| is| are)|my (?:favou?rites?|list) (?:is|are)?)\s*:?\s*)+/i;

/** Split a spoken/typed list into individual place names. */
export function heuristicParsePlaces(transcript: string, cityHint?: string): ParsedPlaceList {
  let text = transcript.replace(/\s+/g, " ").trim();
  text = text.replace(LEAD_IN, "");
  const detectedCity = findCity(cityHint) ?? detectCityInText(text);

  const rawParts = text
    .split(/\s*(?:,|;|\n|\.\s|\band\b|\bthen\b|\balso\b)\s*/i)
    .map((p) => p.replace(FILLER, " ").replace(/\s+/g, " ").trim())
    .map((p) => p.replace(/^(?:the )?/i, "").replace(/[.!?]+$/, "").trim())
    .filter((p) => p.length > 1 && !/^(?:in|at|near|to)\s/i.test(p));

  const seen = new Set<string>();
  const places: ParsedPlaceList["places"] = [];
  for (const part of rawParts) {
    // Keep "Ichiran in Shinjuku" intact but note a per-place hint when a known city/area is named.
    const m = part.match(/^(.*?)\s+(?:in|at|near)\s+(.+)$/i);
    const name = m ? m[1].trim() : part;
    const hint = m ? m[2].trim() : undefined;
    const k = name.toLowerCase();
    if (!name || seen.has(k)) continue;
    seen.add(k);
    // Capitalise words for a tidy display name.
    const pretty = name.replace(/(^|\s)([a-z])/g, (_m, sp: string, c: string) => sp + c.toUpperCase());
    places.push({ name: pretty, cityHint: hint ?? detectedCity?.city ?? cityHint });
  }

  const city = detectedCity?.city ?? "";
  const country = detectedCity?.country ?? "";
  const title = city ? `My ${city} Guide` : places.length ? `${places[0].name} & more` : "My Guide";
  return { title, city, country, places };
}

/** Turn a natural-language search request into a structured intent. */
export function heuristicSearchIntent(query: string): SearchIntent {
  const q = query.trim();
  const lower = q.toLowerCase();
  const intent: SearchIntent = { keywords: [], scope: "public" };

  if (/\b(people|creators|users|folks|friends)\s+i(?:'m| am)?\s*follow(?:ing)?\b|\bmy (?:follows|following|friends|network)\b|\bfollowing\b/.test(lower)) {
    intent.scope = "following";
  }
  const by = lower.match(/\bby\s+@?([a-z0-9_.-]{2,})\b/);
  if (by && !/\b(people|folks|friends|users|creators)\b/.test(by[1])) intent.byUsername = by[1];

  const city = detectCityInText(q);
  if (city) {
    intent.city = city.city;
    intent.country = city.country;
  }
  for (const c of CATEGORIES) {
    const words = c.toLowerCase().split(/\s*&\s*|\s+/);
    if (words.some((w) => w.length > 3 && lower.includes(w))) intent.category = c;
  }
  const catSynonyms: Array<[RegExp, Category]> = [
    [/\b(food|eat|eating|restaurants?|dinner|lunch|brunch|coffee|cafes?|ramen|tacos?|drinks?)\b/, "Food & Drinks"],
    [/\b(bars?|clubs?|party|nightlife|night out|cocktails?)\b/, "Nightlife"],
    [/\b(wellness|spa|gym|yoga|onsen|hammam|surf|hike|hiking|run|running)\b/, "Sports & Wellness"],
    [/\b(shopping|shops?|markets?|boutiques?|vintage)\b/, "Shopping"],
    [/\b(nature|parks?|beach|beaches|gardens?|outdoors?)\b/, "Nature"],
    [/\b(hotels?|stay|sleep|where to stay|riads?|hostels?)\b/, "Stay"],
    [/\b(temples?|mosques?|churches?|shrines?|spiritual)\b/, "Spiritual"],
    [/\b(museums?|galleries|gallery|theatre|theater|entertainment|cinema|concerts?)\b/, "Entertainment"],
    [/\b(views?|viewpoints?|scenic|landmarks?|sights?|sightseeing)\b/, "Scenic Spots"],
  ];
  if (!intent.category) for (const [re, c] of catSynonyms) if (re.test(lower)) { intent.category = c; break; }

  const stop = new Set(["show", "me", "find", "search", "for", "guides", "guide", "to", "in", "of", "the", "a", "an", "by", "people", "i", "am", "im", "following", "follow", "my", "friends", "public", "any", "all", "some", "what", "are", "there", "good", "best", "please", "with", "and", "from", "about", "on", "around", "near", "want", "looking", "list", "lists"]);
  intent.keywords = lower
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
    .filter((w) => !(intent.city && intent.city.toLowerCase().split(" ").includes(w)))
    .filter((w) => !(intent.byUsername && w === intent.byUsername))
    .slice(0, 6);
  return intent;
}

/** Light clean-up of a dictated note when no LLM is available. */
export function heuristicPolishNote(note: string): string {
  let s = note.replace(/\s+/g, " ").trim();
  s = s.replace(/\b(um+|uh+|erm|you know|like,)\b\s*/gi, "");
  s = s.replace(/\s+([,.!?])/g, "$1");
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
