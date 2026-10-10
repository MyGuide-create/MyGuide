// How a place gets its MyGuide category from Google — plain JS so the app (categories.ts)
// and scripts/recategorize-places.mjs share exactly the same rules.
//
// Order: Google's primary type (exact, then by its ending: "_restaurant", "_store"…),
// then its other types the same way, then the place's name ("… Nail Spa"), then "Scenic Spots".

/** Google Places (New) type → MyGuide category. */
export const GOOGLE_TYPE_MAP = {
  // Nightlife
  bar: "Nightlife", night_club: "Nightlife", pub: "Nightlife", wine_bar: "Nightlife", karaoke: "Nightlife",
  cocktail_bar: "Nightlife", hookah_bar: "Nightlife", lounge_bar: "Nightlife", irish_pub: "Nightlife", beer_garden: "Nightlife",
  brewery: "Nightlife", brewpub: "Nightlife", winery: "Nightlife", dance_hall: "Nightlife",
  // Food & Drinks
  restaurant: "Food & Drinks", cafe: "Food & Drinks", coffee_shop: "Food & Drinks", bakery: "Food & Drinks",
  meal_takeaway: "Food & Drinks", meal_delivery: "Food & Drinks", ice_cream_shop: "Food & Drinks", food: "Food & Drinks",
  tea_house: "Food & Drinks", dessert_shop: "Food & Drinks", food_court: "Food & Drinks", sandwich_shop: "Food & Drinks",
  juice_shop: "Food & Drinks", donut_shop: "Food & Drinks", bagel_shop: "Food & Drinks", chocolate_shop: "Food & Drinks",
  confectionery: "Food & Drinks", candy_store: "Food & Drinks", acai_shop: "Food & Drinks", cafeteria: "Food & Drinks",
  diner: "Food & Drinks", deli: "Food & Drinks", steak_house: "Food & Drinks", bar_and_grill: "Food & Drinks",
  pastry_shop: "Food & Drinks", cake_shop: "Food & Drinks", cat_cafe: "Food & Drinks", dog_cafe: "Food & Drinks", bistro: "Food & Drinks",
  // Scenic
  tourist_attraction: "Scenic Spots", historical_landmark: "Scenic Spots", monument: "Scenic Spots", observation_deck: "Scenic Spots",
  plaza: "Scenic Spots", bridge: "Scenic Spots", tower: "Scenic Spots", cultural_landmark: "Scenic Spots", historical_place: "Scenic Spots",
  sculpture: "Scenic Spots", visitor_center: "Scenic Spots", fountain: "Scenic Spots",
  // Entertainment
  museum: "Entertainment", art_gallery: "Entertainment", movie_theater: "Entertainment", amusement_park: "Entertainment",
  aquarium: "Entertainment", zoo: "Entertainment", performing_arts_theater: "Entertainment", concert_hall: "Entertainment",
  casino: "Entertainment", bowling_alley: "Entertainment", opera_house: "Entertainment", comedy_club: "Entertainment",
  water_park: "Entertainment", video_arcade: "Entertainment", event_venue: "Entertainment", cultural_center: "Entertainment",
  planetarium: "Entertainment", art_studio: "Entertainment", amusement_center: "Entertainment", ferris_wheel: "Entertainment",
  roller_coaster: "Entertainment", movie_rental: "Entertainment", auditorium: "Entertainment", amphitheatre: "Entertainment",
  internet_cafe: "Entertainment",
  // Sports & Wellness (sport, fitness, spas and other wellness — not hair or nails)
  gym: "Sports & Wellness", fitness_center: "Sports & Wellness", spa: "Sports & Wellness", yoga_studio: "Sports & Wellness",
  sports_complex: "Sports & Wellness", swimming_pool: "Sports & Wellness", sauna: "Sports & Wellness", stadium: "Sports & Wellness",
  sports_club: "Sports & Wellness", golf_course: "Sports & Wellness", ski_resort: "Sports & Wellness", public_bath: "Sports & Wellness",
  massage: "Sports & Wellness", massage_spa: "Sports & Wellness", wellness_center: "Sports & Wellness",
  sports_activity_location: "Sports & Wellness", sports_coaching: "Sports & Wellness", sports_school: "Sports & Wellness",
  tennis_court: "Sports & Wellness", ice_skating_rink: "Sports & Wellness", athletic_field: "Sports & Wellness",
  adventure_sports_center: "Sports & Wellness", cycling_park: "Sports & Wellness", fishing_charter: "Sports & Wellness",
  arena: "Sports & Wellness", skateboard_park: "Sports & Wellness", race_course: "Sports & Wellness",
  // Beauty (hair, nails, lashes, brows, skin)
  beauty_salon: "Beauty", beautician: "Beauty", barber_shop: "Beauty", hair_salon: "Beauty", hair_care: "Beauty",
  nail_salon: "Beauty", makeup_artist: "Beauty", skin_care_clinic: "Beauty", tanning_studio: "Beauty", foot_care: "Beauty",
  body_art_service: "Beauty", beauty_supply_store: "Beauty", cosmetics_store: "Beauty",
  // Spiritual
  church: "Spiritual", mosque: "Spiritual", hindu_temple: "Spiritual", synagogue: "Spiritual", place_of_worship: "Spiritual",
  buddhist_temple: "Spiritual", shinto_shrine: "Spiritual",
  // Shopping
  shopping_mall: "Shopping", store: "Shopping", clothing_store: "Shopping", market: "Shopping", book_store: "Shopping",
  department_store: "Shopping", jewelry_store: "Shopping", gift_shop: "Shopping", grocery_store: "Shopping", home_goods_store: "Shopping",
  shoe_store: "Shopping", supermarket: "Shopping", convenience_store: "Shopping", florist: "Shopping", farmers_market: "Shopping",
  flea_market: "Shopping", wholesaler: "Shopping", butcher_shop: "Shopping", food_store: "Shopping", liquor_store: "Shopping",
  // Nature
  park: "Nature", national_park: "Nature", beach: "Nature", garden: "Nature", hiking_area: "Nature", botanical_garden: "Nature",
  campground: "Nature", lake: "Nature", forest: "Nature", waterfall: "Nature", marina: "Nature", state_park: "Nature",
  wildlife_park: "Nature", wildlife_refuge: "Nature", picnic_ground: "Nature", dog_park: "Nature", island: "Nature", mountain_peak: "Nature",
  // Stay
  hotel: "Stay", lodging: "Stay", hostel: "Stay", resort_hotel: "Stay", bed_and_breakfast: "Stay", guest_house: "Stay", motel: "Stay",
  extended_stay_hotel: "Stay", inn: "Stay", cottage: "Stay", farmstay: "Stay", budget_japanese_inn: "Stay", japanese_inn: "Stay",
  mobile_home_park: "Stay", private_guest_room: "Stay", rv_park: "Stay",
};

/** For Google types not listed above, the ending usually says enough ("thai_restaurant", "furniture_store"). */
const SUFFIX_RULES = [
  [/_restaurant$/, "Food & Drinks"],
  [/_cafe$/, "Food & Drinks"],
  [/_bakery$/, "Food & Drinks"],
  [/_bar$/, "Nightlife"],
  [/_pub$/, "Nightlife"],
  [/_salon$/, "Beauty"],
  [/_(store|shop|market|mall|outlet|boutique|dealer)$/, "Shopping"],
  [/_(hotel|hostel|resort|inn|lodge)$/, "Stay"],
  [/_(park|garden|beach|reserve|trail)$/, "Nature"],
  [/_(temple|church|shrine|mosque|cathedral|monastery)$/, "Spiritual"],
  [/_(museum|gallery|theater|theatre|cinema)$/, "Entertainment"],
  [/_(gym|studio|club|court|field|rink|pool|center)$/, "Sports & Wellness"],
];

function fromType(t) {
  if (!t) return null;
  if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
  for (const [re, cat] of SUFFIX_RULES) if (re.test(t)) return cat;
  return null;
}

/** Category when the name clearly says one ("… Nail Spa", "… Lagree Studio", "… Coffee"), else null. */
export function categoryFromName(name) {
  // Strip accents too, so "Café" matches \bcafe\b.
  const n = `${name.toLowerCase()} ${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}`;
  const rules = [
    [/\bsalon de th[eé]\b/, "Food & Drinks"],
    // Beauty first: "Nail Bar", "Blow Dry Bar", "Nail Spa" and "Hair Studio" are salons, not bars, spas or studios.
    [/\b(salon|salons|nails?|manicures?|pedicures?|mani|pedi|hair|hairdressers?|hairstylists?|barbers?|barbershop|lash|lashes|brows?|beauty|blowout|blow ?dry|waxing|threading|coiffure|coiffeur|peluquer[ií]a|aesthetics?)\b/, "Beauty"],
    [/\b(club|lounge|bar|pub|taproom|speakeasy|karaoke|disco|izakaya|cocktail)\b/, "Nightlife"],
    [/\b(ramen|sushi|cafe|café|coffee|kissaten|bistro|taverna|trattoria|osteria|restaurant|kitchen|bakery|boulangerie|pizzeria|taco|taquer[ií]a|grill|diner|noodle|udon|soba|tempura|yakitori|gelato|pastel|pastéis|patisserie|deli|brasserie|cantina|mezcaler[ií]a|churrascaria|dumpling|curry|bbq|steak|eatery|ten|tei)\b/, "Food & Drinks"],
    [/\b(temple|shrine|mosque|church|cathedral|basilica|monastery|synagogue|chapel|wat|pagoda|gurdwara)\b/, "Spiritual"],
    [/\b(park|garden|gardens|beach|forest|lake|falls|waterfall|trail|island|mountain|hill|bay|cove|reserve)\b/, "Nature"],
    [/\b(hotel|hostel|ryokan|riad|inn|resort|lodge|guesthouse|b&b|apartments|villa)\b/, "Stay"],
    [/\b(gym|spa|onsen|sento|hammam|yoga|pool|baths|climbing|surf|pilates|wellness|lagree|barre|crossfit|fitness|padel|boxing|reformer|bootcamp|tennis|massage|sauna)\b/, "Sports & Wellness"],
    [/\b(museum|gallery|theatre|theater|cinema|aquarium|zoo|arena|opera|hall|studio)\b/, "Entertainment"],
    [/\b(market|mall|souk|souq|bazaar|store|shop|boutique|bookshop|books|records|depachika)\b/, "Shopping"],
    [/\b(tower|bridge|square|plaza|castle|palace|viewpoint|lookout|acropolis|crossing|monument|fort|citadel|arch|gate)\b/, "Scenic Spots"],
  ];
  for (const [re, cat] of rules) if (re.test(n)) return cat;
  return null;
}

/** The MyGuide category for a Google place. */
export function categoryFromGoogle(primaryType, types, name) {
  const fromPrimary = fromType(primaryType);
  if (fromPrimary) return fromPrimary;
  for (const t of types ?? []) if (GOOGLE_TYPE_MAP[t]) return GOOGLE_TYPE_MAP[t];
  for (const t of types ?? []) {
    const c = fromType(t);
    if (c) return c;
  }
  // A Google type we don't know at all: the name is a better guess than a blanket default.
  return (name && categoryFromName(name)) || "Scenic Spots";
}
