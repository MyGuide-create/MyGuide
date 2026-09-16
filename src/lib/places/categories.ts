export const CATEGORIES = [
  "Food & Drinks",
  "Nightlife",
  "Scenic Spots",
  "Entertainment",
  "Sports & Wellness",
  "Spiritual",
  "Shopping",
  "Nature",
  "Stay",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

/** Map Google Places (New) type identifiers onto the fixed MyGuide categories. */
const GOOGLE_TYPE_MAP: Record<string, Category> = {
  // Nightlife
  bar: "Nightlife",
  night_club: "Nightlife",
  pub: "Nightlife",
  wine_bar: "Nightlife",
  karaoke: "Nightlife",
  cocktail_bar: "Nightlife",
  // Food & Drinks
  restaurant: "Food & Drinks",
  cafe: "Food & Drinks",
  coffee_shop: "Food & Drinks",
  bakery: "Food & Drinks",
  meal_takeaway: "Food & Drinks",
  meal_delivery: "Food & Drinks",
  ice_cream_shop: "Food & Drinks",
  food: "Food & Drinks",
  tea_house: "Food & Drinks",
  dessert_shop: "Food & Drinks",
  food_court: "Food & Drinks",
  // Scenic
  tourist_attraction: "Scenic Spots",
  historical_landmark: "Scenic Spots",
  monument: "Scenic Spots",
  observation_deck: "Scenic Spots",
  plaza: "Scenic Spots",
  bridge: "Scenic Spots",
  tower: "Scenic Spots",
  cultural_landmark: "Scenic Spots",
  historical_place: "Scenic Spots",
  // Entertainment
  museum: "Entertainment",
  art_gallery: "Entertainment",
  movie_theater: "Entertainment",
  amusement_park: "Entertainment",
  aquarium: "Entertainment",
  zoo: "Entertainment",
  performing_arts_theater: "Entertainment",
  concert_hall: "Entertainment",
  casino: "Entertainment",
  bowling_alley: "Entertainment",
  opera_house: "Entertainment",
  comedy_club: "Entertainment",
  // Sports & Wellness
  gym: "Sports & Wellness",
  fitness_center: "Sports & Wellness",
  spa: "Sports & Wellness",
  yoga_studio: "Sports & Wellness",
  sports_complex: "Sports & Wellness",
  swimming_pool: "Sports & Wellness",
  sauna: "Sports & Wellness",
  stadium: "Sports & Wellness",
  sports_club: "Sports & Wellness",
  golf_course: "Sports & Wellness",
  ski_resort: "Sports & Wellness",
  public_bath: "Sports & Wellness",
  massage: "Sports & Wellness",
  wellness_center: "Sports & Wellness",
  // Spiritual
  church: "Spiritual",
  mosque: "Spiritual",
  hindu_temple: "Spiritual",
  synagogue: "Spiritual",
  place_of_worship: "Spiritual",
  buddhist_temple: "Spiritual",
  shinto_shrine: "Spiritual",
  // Shopping
  shopping_mall: "Shopping",
  store: "Shopping",
  clothing_store: "Shopping",
  market: "Shopping",
  book_store: "Shopping",
  department_store: "Shopping",
  jewelry_store: "Shopping",
  gift_shop: "Shopping",
  grocery_store: "Shopping",
  home_goods_store: "Shopping",
  shoe_store: "Shopping",
  // Nature
  park: "Nature",
  national_park: "Nature",
  beach: "Nature",
  garden: "Nature",
  hiking_area: "Nature",
  botanical_garden: "Nature",
  campground: "Nature",
  lake: "Nature",
  forest: "Nature",
  waterfall: "Nature",
  marina: "Nature",
  state_park: "Nature",
  // Stay
  hotel: "Stay",
  lodging: "Stay",
  hostel: "Stay",
  resort_hotel: "Stay",
  bed_and_breakfast: "Stay",
  guest_house: "Stay",
  motel: "Stay",
  extended_stay_hotel: "Stay",
  inn: "Stay",
};

export function categoryFromGoogleTypes(primaryType?: string, types?: string[]): Category {
  if (primaryType && GOOGLE_TYPE_MAP[primaryType]) return GOOGLE_TYPE_MAP[primaryType];
  for (const t of types ?? []) {
    if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
  }
  return "Scenic Spots";
}

/** Rough category guess from a place name, used for mock data / offline mode. */
export function guessCategoryFromName(name: string): Category {
  const n = name.toLowerCase();
  const rules: Array<[RegExp, Category]> = [
    [/\b(club|lounge|bar|pub|taproom|speakeasy|karaoke|disco|izakaya|cocktail)\b/, "Nightlife"],
    [/\b(ramen|sushi|cafe|café|coffee|kissaten|bistro|taverna|trattoria|osteria|restaurant|kitchen|bakery|boulangerie|pizzeria|taco|taquer[ií]a|grill|diner|noodle|udon|soba|tempura|yakitori|gelato|pastel|pastéis|patisserie|deli|brasserie|cantina|mezcaler[ií]a|churrascaria|dumpling|curry|bbq|steak|eatery|ten|tei)\b/, "Food & Drinks"],
    [/\b(temple|shrine|mosque|church|cathedral|basilica|monastery|synagogue|chapel|wat|pagoda|gurdwara)\b/, "Spiritual"],
    [/\b(park|garden|gardens|beach|forest|lake|falls|waterfall|trail|island|mountain|hill|bay|cove|reserve)\b/, "Nature"],
    [/\b(hotel|hostel|ryokan|riad|inn|resort|lodge|guesthouse|b&b|apartments|villa)\b/, "Stay"],
    [/\b(museum|gallery|theatre|theater|cinema|aquarium|zoo|arena|opera|hall|studio)\b/, "Entertainment"],
    [/\b(market|mall|souk|souq|bazaar|store|shop|boutique|bookshop|books|records|depachika)\b/, "Shopping"],
    [/\b(gym|spa|onsen|sento|hammam|yoga|pool|baths|climbing|surf|pilates|wellness)\b/, "Sports & Wellness"],
    [/\b(tower|bridge|square|plaza|castle|palace|viewpoint|lookout|acropolis|crossing|monument|fort|citadel|arch|gate)\b/, "Scenic Spots"],
  ];
  for (const [re, cat] of rules) if (re.test(n)) return cat;
  return "Food & Drinks";
}

export const CATEGORY_ICON: Record<Category, string> = {
  "Food & Drinks": "fork",
  Nightlife: "moon",
  "Scenic Spots": "camera",
  Entertainment: "ticket",
  "Sports & Wellness": "leaf",
  Spiritual: "sun",
  Shopping: "bag",
  Nature: "tree",
  Stay: "bed",
};
