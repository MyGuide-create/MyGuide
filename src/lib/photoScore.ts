/**
 * Photo places (15 Oct 2026): which of the places around a photo spot you were most likely at.
 * Pure scoring, no I/O, so it's easy to tune from the corrections people make.
 *
 * Score (0–1) = distance 40% + how well known 20% + kind of place 15% + time of day 15% + on MyGuide 10%.
 */

export interface SpotSignals {
  photos: number;
  days: number;
  /** Photos per local hour (24 numbers). */
  hours?: number[];
  /** Longest single visit in minutes. */
  dwell?: number;
  /** Median metres of photos from the centre. */
  spread?: number;
  /** Typical GPS error in metres, when known. */
  acc?: number;
}

export interface ScoreInput {
  distanceMeters: number;
  primaryType: string;
  types: string[];
  ratingCount: number;
  /** How many other people on MyGuide recommend it. */
  onMyGuide: number;
}

export type Confidence = "sure" | "guess";

const FOOD = ["restaurant", "food", "meal_takeaway", "steak_house", "seafood_restaurant", "pizza_restaurant", "sushi_restaurant"];
const COFFEE = ["cafe", "coffee_shop", "bakery", "breakfast_restaurant", "brunch_restaurant", "tea_house"];
const DRINKS = ["bar", "pub", "wine_bar", "night_club", "cocktail_bar", "lounge_bar"];
const SWEET = ["ice_cream_shop", "dessert_shop"];
const STAY = ["lodging", "hotel", "resort_hotel", "bed_and_breakfast", "guest_house", "hostel", "inn", "motel"];
const FIT = ["gym", "fitness_center", "yoga_studio", "sports_club", "swimming_pool", "golf_course"];
const BEAUTY = ["spa", "beauty_salon", "hair_salon", "nail_salon", "barber_shop"];
const SEE = ["museum", "art_gallery", "zoo", "aquarium", "amusement_park", "movie_theater", "bowling_alley"];

const isAny = (c: ScoreInput, list: string[]) => list.includes(c.primaryType) || c.types.some((t) => list.includes(t));
const isFood = (c: ScoreInput) => isAny(c, FOOD) || c.primaryType.endsWith("_restaurant");

/** The kind of place it is, for scoring and for the corrections log. */
export function kindOf(c: Pick<ScoreInput, "primaryType" | "types">): string {
  const x = { ...c, distanceMeters: 0, ratingCount: 0, onMyGuide: 0 };
  if (isAny(x, STAY)) return "stay";
  if (isAny(x, DRINKS)) return "drinks";
  if (isAny(x, COFFEE)) return "coffee";
  if (isFood(x)) return "food";
  if (isAny(x, SWEET)) return "sweet";
  if (isAny(x, FIT)) return "fitness";
  if (isAny(x, BEAUTY)) return "beauty";
  if (isAny(x, SEE)) return "see";
  if (isAny(x, ["beach"])) return "beach";
  if (isAny(x, ["park"])) return "park";
  if (isAny(x, ["tourist_attraction"])) return "attraction";
  return "other";
}

/** How likely a kind of place is to be what someone recommends (vague listings score low). */
const KIND_PRIOR: Record<string, number> = {
  food: 1,
  coffee: 1,
  drinks: 0.95,
  stay: 0.9,
  sweet: 0.85,
  fitness: 0.8,
  beauty: 0.75,
  see: 0.8,
  beach: 0.6,
  park: 0.45,
  attraction: 0.35,
  other: 0.5,
};

/** Share of a spot's photos taken in these local hours. */
function share(hours: number[] | undefined, from: number, to: number): number {
  if (!hours?.length) return 0;
  const total = hours.reduce((a, b) => a + b, 0) || 1;
  let n = 0;
  for (let h = from; h !== to; h = (h + 1) % 24) n += hours[h] ?? 0;
  return n / total;
}

/** How well the time of the photos fits this kind of place (0–1; 0.5 = no idea). */
function timeFit(kind: string, s: SpotSignals): number {
  const morning = share(s.hours, 6, 11);
  const lunch = share(s.hours, 11, 16);
  const evening = share(s.hours, 18, 23);
  const late = share(s.hours, 23, 5);
  const overnight = s.days >= 2;
  switch (kind) {
    case "stay":
      return Math.min(1, 0.3 + (overnight ? 0.5 : 0) + late * 0.4 + morning * 0.2);
    case "coffee":
      return 0.3 + morning * 0.7 + lunch * 0.3;
    case "food":
      return 0.3 + lunch * 0.5 + evening * 0.6;
    case "drinks":
      return 0.2 + evening * 0.5 + late * 0.8;
    case "fitness":
      return 0.4 + morning * 0.5 + evening * 0.2;
    case "see":
    case "beach":
    case "park":
    case "attraction":
      return 0.3 + (morning + lunch) * 0.5 - late * 0.3;
    default:
      return 0.5;
  }
}

/** How far a place can be and still count, for this spot (GPS error, spread of the photos). */
export function reachOf(s: SpotSignals): number {
  return Math.max(40, s.acc ?? 0, (s.spread ?? 0) * 1.5);
}

export function scoreCandidate(c: ScoreInput, s: SpotSignals): number {
  const kind = kindOf(c);
  // Hotels and resorts are big: their pin is often far from the pool or the beach.
  const reach = reachOf(s) * (kind === "stay" ? 4 : 1);
  const dist = Math.exp(-c.distanceMeters / reach);
  const known = Math.min(1, Math.log10(1 + c.ratingCount) / 3.5);
  const kindScore = KIND_PRIOR[kind] ?? 0.5;
  const time = Math.max(0, Math.min(1, timeFit(kind, s)));
  const mg = Math.min(1, c.onMyGuide / 2);
  return 0.4 * dist + 0.2 * known + 0.15 * kindScore + 0.15 * time + 0.1 * mg;
}

/** Just walking past: one quick photo or a handful in a few minutes, on one day. */
export function isPassingBy(s: SpotSignals): boolean {
  if (s.days >= 2) return false;
  if (s.photos <= 1) return true;
  return (s.dwell ?? 0) < 10 && s.photos < 4;
}

/** "sure" when the best is clearly ahead and it was a real visit; otherwise a best guess. */
export function confidenceOf(scores: number[], s: SpotSignals): Confidence {
  const [a = 0, b = 0] = [...scores].sort((x, y) => y - x);
  if (isPassingBy(s)) return "guess";
  return a >= 0.55 && a - b >= 0.05 ? "sure" : "guess";
}

/** A few words on why it was picked (shown under the guess). */
export function reasonOf(c: ScoreInput, s: SpotSignals): string {
  const bits: string[] = [];
  const kind = kindOf(c);
  if (kind === "stay" && s.days >= 2) bits.push(`photos over ${s.days} days`);
  else if ((kind === "food" || kind === "drinks") && share(s.hours, 18, 5) >= 0.5) bits.push("evening photos");
  else if (kind === "coffee" && share(s.hours, 6, 11) >= 0.5) bits.push("morning photos");
  if (c.onMyGuide) bits.push(`${c.onMyGuide} on MyGuide vouch for it`);
  if (c.ratingCount >= 500) bits.push(`${c.ratingCount >= 1000 ? `${(c.ratingCount / 1000).toFixed(1).replace(/\.0$/, "")}k` : c.ratingCount} Google reviews`);
  return bits.join(" · ");
}
