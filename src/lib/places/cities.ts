/** City centres used to synthesise coordinates and to geocode guides in mock mode. */
export interface CityInfo {
  city: string;
  country: string;
  lat: number;
  lng: number;
  aliases?: string[];
}

export const CITIES: CityInfo[] = [
  { city: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503, aliases: ["shinjuku", "shibuya", "yanaka", "ginza", "asakusa", "sugamo"] },
  { city: "Kyoto", country: "Japan", lat: 35.0116, lng: 135.7681 },
  { city: "Osaka", country: "Japan", lat: 34.6937, lng: 135.5023 },
  { city: "Athens", country: "Greece", lat: 37.9838, lng: 23.7275, aliases: ["plaka", "psyri", "koukaki", "exarcheia"] },
  { city: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332, aliases: ["cdmx", "ciudad de mexico", "ciudad de méxico", "roma norte", "condesa", "coyoacan", "coyoacán", "polanco"] },
  { city: "Oaxaca", country: "Mexico", lat: 17.0732, lng: -96.7266 },
  { city: "Dubai", country: "United Arab Emirates", lat: 25.2048, lng: 55.2708, aliases: ["jumeirah", "deira", "al quoz", "marina", "dubai marina", "downtown dubai", "business bay", "al barsha", "jebel ali", "al qudra", "hatta", "dubai emirate", "دبي"] },
  { city: "Abu Dhabi", country: "United Arab Emirates", lat: 24.4539, lng: 54.3773 },
  { city: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393, aliases: ["lisboa", "alfama", "belem", "belém", "bairro alto", "chiado"] },
  { city: "Porto", country: "Portugal", lat: 41.1579, lng: -8.6291 },
  { city: "London", country: "United Kingdom", lat: 51.5072, lng: -0.1276, aliases: ["soho", "shoreditch", "hackney", "notting hill", "camden"] },
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522, aliases: ["le marais", "montmartre", "belleville", "saint-germain"] },
  { city: "Marrakech", country: "Morocco", lat: 31.6295, lng: -7.9811, aliases: ["marrakesh", "medina", "gueliz"] },
  { city: "New York", country: "United States", lat: 40.7128, lng: -74.006, aliases: ["nyc", "new york city", "manhattan", "brooklyn", "williamsburg", "queens"] },
  { city: "Los Angeles", country: "United States", lat: 34.0522, lng: -118.2437, aliases: ["la", "silver lake", "venice", "santa monica"] },
  { city: "San Francisco", country: "United States", lat: 37.7749, lng: -122.4194, aliases: ["sf"] },
  { city: "Chicago", country: "United States", lat: 41.8781, lng: -87.6298 },
  { city: "Istanbul", country: "Türkiye", lat: 41.0082, lng: 28.9784, aliases: ["kadikoy", "kadıköy", "beyoglu", "beyoğlu", "karakoy", "karaköy"] },
  { city: "Barcelona", country: "Spain", lat: 41.3874, lng: 2.1686, aliases: ["gracia", "gràcia", "el born", "gothic quarter"] },
  { city: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { city: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964, aliases: ["roma", "trastevere", "testaccio"] },
  { city: "Florence", country: "Italy", lat: 43.7696, lng: 11.2558, aliases: ["firenze"] },
  { city: "Milan", country: "Italy", lat: 45.4642, lng: 9.19, aliases: ["milano"] },
  { city: "Naples", country: "Italy", lat: 40.8518, lng: 14.2681, aliases: ["napoli"] },
  { city: "Berlin", country: "Germany", lat: 52.52, lng: 13.405, aliases: ["kreuzberg", "neukolln", "neukölln", "mitte"] },
  // Island and small-country destinations: one area for the whole country (Hisham, 12 Oct 2026:
  // "a place like Maldives or Seychelles should have all its recommendations in one place").
  { city: "Maldives", country: "Maldives", lat: 3.2028, lng: 73.2207, aliases: ["hulhumale", "hulhumalé", "maafushi"] },
  { city: "Seychelles", country: "Seychelles", lat: -4.6796, lng: 55.492, aliases: ["mahe", "mahé", "praslin", "la digue", "beau vallon"] },
  { city: "Mauritius", country: "Mauritius", lat: -20.3484, lng: 57.5522, aliases: ["port louis", "grand baie", "flic en flac", "le morne", "belle mare"] },
  { city: "Fiji", country: "Fiji", lat: -17.7134, lng: 178.065, aliases: ["nadi", "denarau", "suva", "mamanuca islands", "yasawa islands"] },
  { city: "French Polynesia", country: "French Polynesia", lat: -17.6797, lng: -149.4068, aliases: ["bora bora", "moorea", "mo'orea", "papeete", "tahiti"] },
  { city: "Malta", country: "Malta", lat: 35.8989, lng: 14.5146, aliases: ["valletta", "sliema", "st julian's", "saint julian's", "gozo", "mdina"] },
  { city: "Bahamas", country: "Bahamas", lat: 25.0343, lng: -77.3963, aliases: ["the bahamas", "nassau", "exuma", "harbour island", "paradise island"] },
  { city: "Turks and Caicos", country: "Turks and Caicos Islands", lat: 21.694, lng: -71.7979, aliases: ["turks and caicos islands", "providenciales", "grace bay"] },
  { city: "Barbados", country: "Barbados", lat: 13.1939, lng: -59.5432, aliases: ["bridgetown", "holetown", "speightstown"] },
  { city: "St Lucia", country: "Saint Lucia", lat: 13.9094, lng: -60.9789, aliases: ["saint lucia", "st. lucia", "castries", "soufriere", "soufrière", "rodney bay"] },
  { city: "Antigua", country: "Antigua and Barbuda", lat: 17.0608, lng: -61.7964, aliases: ["antigua and barbuda", "st. john's antigua", "english harbour"] },
  { city: "Bermuda", country: "Bermuda", lat: 32.3078, lng: -64.7505, aliases: ["hamilton bermuda"] },
  { city: "Cayman Islands", country: "Cayman Islands", lat: 19.3133, lng: -81.2546, aliases: ["grand cayman", "george town cayman", "seven mile beach"] },
  { city: "Bahrain", country: "Bahrain", lat: 26.0667, lng: 50.5577, aliases: ["manama", "muharraq", "seef", "juffair", "adliya", "amwaj islands"] },
  { city: "Monaco", country: "Monaco", lat: 43.7384, lng: 7.4246, aliases: ["monte carlo", "monte-carlo"] },
  { city: "Brussels", country: "Belgium", lat: 50.8503, lng: 4.3517, aliases: ["bruxelles", "brussel", "city of brussels", "ville de bruxelles", "stad brussel"] },
  { city: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041, aliases: ["jordaan", "de pijp"] },
  { city: "Copenhagen", country: "Denmark", lat: 55.6761, lng: 12.5683, aliases: ["kobenhavn", "københavn", "norrebro", "nørrebro", "vesterbro"] },
  { city: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686, aliases: ["sodermalm", "södermalm"] },
  { city: "Vienna", country: "Austria", lat: 48.2082, lng: 16.3738, aliases: ["wien"] },
  { city: "Prague", country: "Czechia", lat: 50.0755, lng: 14.4378, aliases: ["praha"] },
  { city: "Budapest", country: "Hungary", lat: 47.4979, lng: 19.0402 },
  { city: "Beirut", country: "Lebanon", lat: 33.8938, lng: 35.5018, aliases: ["mar mikhael", "gemmayzeh", "hamra"] },
  { city: "Amman", country: "Jordan", lat: 31.9454, lng: 35.9284, aliases: ["jabal amman", "rainbow street"] },
  { city: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357, aliases: ["zamalek", "giza"] },
  { city: "Doha", country: "Qatar", lat: 25.2854, lng: 51.531 },
  { city: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753 },
  { city: "Muscat", country: "Oman", lat: 23.588, lng: 58.3829 },
  { city: "Tel Aviv", country: "Israel", lat: 32.0853, lng: 34.7818, aliases: ["jaffa", "yafo"] },
  { city: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018, aliases: ["sukhumvit", "thonglor", "ari", "chinatown bangkok"] },
  { city: "Chiang Mai", country: "Thailand", lat: 18.7883, lng: 98.9853 },
  { city: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198, aliases: ["tiong bahru", "joo chiat", "katong"] },
  { city: "Hong Kong", country: "Hong Kong", lat: 22.3193, lng: 114.1694, aliases: ["sheung wan", "central", "kowloon", "mong kok"] },
  { city: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978, aliases: ["hongdae", "itaewon", "seongsu", "gangnam", "ikseon"] },
  { city: "Taipei", country: "Taiwan", lat: 25.033, lng: 121.5654 },
  { city: "Hanoi", country: "Vietnam", lat: 21.0278, lng: 105.8342 },
  { city: "Ho Chi Minh City", country: "Vietnam", lat: 10.8231, lng: 106.6297, aliases: ["saigon"] },
  { city: "Bali", country: "Indonesia", lat: -8.4095, lng: 115.1889, aliases: ["ubud", "canggu", "seminyak", "uluwatu"] },
  { city: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093, aliases: ["surry hills", "bondi", "newtown"] },
  { city: "Melbourne", country: "Australia", lat: -37.8136, lng: 144.9631, aliases: ["fitzroy", "collingwood"] },
  { city: "Cape Town", country: "South Africa", lat: -33.9249, lng: 18.4241 },
  { city: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
  { city: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816, aliases: ["palermo", "san telmo", "recoleta"] },
  { city: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lng: -43.1729, aliases: ["rio", "ipanema", "copacabana", "santa teresa"] },
  { city: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333, aliases: ["sao paulo"] },
  { city: "Bogotá", country: "Colombia", lat: 4.711, lng: -74.0721, aliases: ["bogota"] },
  { city: "Medellín", country: "Colombia", lat: 6.2442, lng: -75.5812, aliases: ["medellin"] },
  { city: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428, aliases: ["miraflores", "barranco"] },
  { city: "Havana", country: "Cuba", lat: 23.1136, lng: -82.3666 },
  { city: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { city: "Vancouver", country: "Canada", lat: 49.2827, lng: -123.1207 },
  { city: "Montreal", country: "Canada", lat: 45.5019, lng: -73.5674, aliases: ["montréal", "mile end", "plateau"] },
  { city: "Edinburgh", country: "United Kingdom", lat: 55.9533, lng: -3.1883 },
  { city: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603 },
  { city: "Reykjavik", country: "Iceland", lat: 64.1466, lng: -21.9426, aliases: ["reykjavík"] },
  { city: "Tbilisi", country: "Georgia", lat: 41.7151, lng: 44.8271 },
  { city: "Athens, Georgia", country: "United States", lat: 33.951, lng: -83.3576 },
  { city: "Santorini", country: "Greece", lat: 36.3932, lng: 25.4615, aliases: ["oia", "fira"] },
  { city: "Crete", country: "Greece", lat: 35.2401, lng: 24.8093, aliases: ["chania", "heraklion"] },
  { city: "Mykonos", country: "Greece", lat: 37.4467, lng: 25.3289 },
  { city: "Tulum", country: "Mexico", lat: 20.2114, lng: -87.4654 },
  { city: "Fez", country: "Morocco", lat: 34.0181, lng: -5.0078, aliases: ["fes"] },
  { city: "Zanzibar", country: "Tanzania", lat: -6.1659, lng: 39.2026, aliases: ["stone town"] },
  { city: "Jaipur", country: "India", lat: 26.9124, lng: 75.7873 },
  { city: "Mumbai", country: "India", lat: 19.076, lng: 72.8777, aliases: ["bandra", "colaba"] },
  { city: "Delhi", country: "India", lat: 28.6139, lng: 77.209, aliases: ["new delhi"] },
  { city: "Kathmandu", country: "Nepal", lat: 27.7172, lng: 85.324 },
  { city: "Colombo", country: "Sri Lanka", lat: 6.9271, lng: 79.8612 },
];

/**
 * Districts, boroughs and communes that Google gives as their own "city" (Üsküdar, Etterbeek,
 * Shibuya City…) but that belong to a bigger city. Hisham (12 Oct 2026): group them under the main
 * city; people can still make a guide about one district. They match like aliases, and the
 * district name is kept as the place's area ("Üsküdar · Istanbul").
 * Leave out names that are also common words or other cities ("Forest" in Brussels, "Tuzla").
 */
const DISTRICTS: Record<string, string[]> = {
  Istanbul: [
    "Adalar", "Arnavutköy", "Ataşehir", "Avcılar", "Bağcılar", "Bahçelievler", "Bakırköy", "Başakşehir", "Bayrampaşa", "Beşiktaş",
    "Beykoz", "Beylikdüzü", "Beyoğlu", "Büyükçekmece", "Çatalca", "Çekmeköy", "Esenler", "Esenyurt", "Eyüpsultan", "Eyüp", "Fatih",
    "Gaziosmanpaşa", "Güngören", "Kadıköy", "Kağıthane", "Kartal", "Küçükçekmece", "Maltepe", "Pendik", "Sancaktepe", "Sarıyer",
    "Silivri", "Sultanbeyli", "Sultangazi", "Şile", "Şişli", "Ümraniye", "Üsküdar", "Zeytinburnu", "Ortaköy", "Cihangir",
    "Nişantaşı", "Balat", "Galata", "Sultanahmet", "Eminönü",
  ],
  Brussels: [
    "Anderlecht", "Auderghem", "Oudergem", "Berchem-Sainte-Agathe", "Sint-Agatha-Berchem", "Etterbeek", "Evere", "Vorst", "Ganshoren",
    "Ixelles", "Elsene", "Jette", "Koekelberg", "Molenbeek-Saint-Jean", "Sint-Jans-Molenbeek", "Molenbeek", "Saint-Gilles", "Sint-Gillis",
    "Saint-Josse-ten-Noode", "Sint-Joost-ten-Node", "Schaerbeek", "Schaarbeek", "Uccle", "Ukkel", "Watermael-Boitsfort",
    "Watermaal-Bosvoorde", "Woluwe-Saint-Lambert", "Sint-Lambrechts-Woluwe", "Woluwe-Saint-Pierre", "Sint-Pieters-Woluwe",
  ],
  Tokyo: [
    "Chiyoda City", "Chuo City", "Minato City", "Shinjuku City", "Bunkyo City", "Taito City", "Sumida City", "Koto City",
    "Shinagawa City", "Meguro City", "Ota City", "Setagaya City", "Shibuya City", "Nakano City", "Suginami City", "Toshima City",
    "Kita City", "Arakawa City", "Itabashi City", "Nerima City", "Adachi City", "Katsushika City", "Edogawa City",
    "Chiyoda", "Minato", "Bunkyo", "Meguro", "Setagaya", "Shinagawa", "Nakano", "Suginami", "Toshima", "Nerima", "Edogawa",
  ],
  "Mexico City": [
    "Cuauhtémoc", "Miguel Hidalgo", "Benito Juárez", "Álvaro Obregón", "Tlalpan", "Xochimilco", "Iztapalapa", "Azcapotzalco",
    "Gustavo A. Madero", "Venustiano Carranza", "Iztacalco", "La Magdalena Contreras", "Cuajimalpa", "Cuajimalpa de Morelos", "Tláhuac", "Milpa Alta",
  ],
  Seoul: ["Gangnam-gu", "Jongno-gu", "Mapo-gu", "Yongsan-gu", "Seongdong-gu", "Seocho-gu", "Songpa-gu", "Seodaemun-gu", "Gwangjin-gu", "Yeongdeungpo-gu"],
  Dubai: ["Bur Dubai", "Al Barsha", "Jumeirah Village Circle", "Palm Jumeirah", "Al Wasl", "Umm Suqeim", "Al Safa"],
};

/**
 * Regions that are the city itself: when Google's region for a place is one of these, the place
 * is in that city even if its "locality" is a district (İstanbul province → Istanbul, Brussels-Capital
 * Region → Brussels, Tokyo Metropolis → Tokyo). Not regions bigger than the city (Lisbon district has Sintra).
 */
const REGION_CITY: Record<string, string> = {
  istanbul: "Istanbul",
  "brussels-capital region": "Brussels",
  "brussels capital region": "Brussels",
  "region de bruxelles-capitale": "Brussels",
  "brussels hoofdstedelijk gewest": "Brussels",
  brussels: "Brussels",
  tokyo: "Tokyo",
  "tokyo metropolis": "Tokyo",
  seoul: "Seoul",
  "ciudad de mexico": "Mexico City",
  "mexico city": "Mexico City",
  cdmx: "Mexico City",
  berlin: "Berlin",
  vienna: "Vienna",
  wien: "Vienna",
  prague: "Prague",
  "hlavni mesto praha": "Prague",
  bangkok: "Bangkok",
  "krung thep maha nakhon": "Bangkok",
  "buenos aires": "Buenos Aires",
  "ciudad autonoma de buenos aires": "Buenos Aires",
  beirut: "Beirut",
  "beirut governorate": "Beirut",
  "greater london": "London",
  singapore: "Singapore",
  "hong kong": "Hong Kong",
  dubai: "Dubai",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").trim();

const DISTRICT_OF = new Map<string, string>();
for (const [metro, names] of Object.entries(DISTRICTS)) {
  const info = CITIES.find((c) => c.city === metro);
  if (!info) continue;
  info.aliases = [...(info.aliases ?? []), ...names];
  for (const n of names) DISTRICT_OF.set(norm(n), metro);
}

/**
 * Countries that are one area on MyGuide: islands and small countries where people move around the
 * whole place (Maldives atolls, Seychelles islands, Malta and Gozo). Every place there counts as the country.
 */
const COUNTRY_AREA: Record<string, string> = {
  maldives: "Maldives",
  seychelles: "Seychelles",
  mauritius: "Mauritius",
  fiji: "Fiji",
  "french polynesia": "French Polynesia",
  malta: "Malta",
  bahamas: "Bahamas",
  "the bahamas": "Bahamas",
  "turks and caicos islands": "Turks and Caicos",
  "turks & caicos islands": "Turks and Caicos",
  barbados: "Barbados",
  "saint lucia": "St Lucia",
  "st lucia": "St Lucia",
  "antigua and barbuda": "Antigua",
  "antigua & barbuda": "Antigua",
  bermuda: "Bermuda",
  "cayman islands": "Cayman Islands",
  bahrain: "Bahrain",
  monaco: "Monaco",
};

/** "Maldives" for any place in the Maldives (an atoll, an island, a resort): see COUNTRY_AREA. */
export function areaForCountry(country: string | null | undefined): string | undefined {
  return country ? COUNTRY_AREA[norm(country)] : undefined;
}

/** "Üsküdar" → "Istanbul", "Shibuya City" → "Tokyo": the main city a district belongs to (undefined if it isn't one). */
export function metroOfDistrict(name: string | null | undefined): string | undefined {
  return name ? DISTRICT_OF.get(norm(name)) : undefined;
}

/**
 * Group a place under its main city. `regions` are Google's administrative areas (province/state,
 * then county). Returns the city to store and, when it was a district, the district (for the area).
 */
export function groupUnderCity(city: string, regions: string[], country?: string): { city: string; district: string } {
  const metro = areaForCountry(country) ?? metroOfDistrict(city) ?? regions.map((r) => REGION_CITY[norm(r)]).find(Boolean);
  if (!metro || norm(metro) === norm(city)) return { city, district: "" };
  return { city: metro, district: city };
}

/** `phrase` appears in `text` as whole words ("dubai marina" has "dubai"; "valais" doesn't have "la"). */
const hasWords = (text: string, phrase: string) => ` ${text.replace(/[^\p{L}\p{N}]+/gu, " ")} `.includes(` ${phrase.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `);

/** Find a known city by name or alias. Prefers exact matches, then substring matches. */
export function findCity(input: string | undefined | null): CityInfo | undefined {
  if (!input) return undefined;
  const q = norm(input);
  if (!q) return undefined;
  let best: CityInfo | undefined;
  for (const c of CITIES) {
    const names = [c.city, ...(c.aliases ?? [])].map(norm);
    if (names.includes(q)) return c;
    // Partial matches need whole words, so "Valais" doesn't become Los Angeles via "la".
    if (!best && names.some((n) => (n.length >= 3 && hasWords(q, n)) || (q.length >= 4 && hasWords(n, q)))) best = c;
  }
  return best;
}

/** A known city whose name or alias is exactly this (no partial matches). */
export function findCityExact(input: string | undefined | null): CityInfo | undefined {
  const q = norm(input ?? "");
  if (!q) return undefined;
  return CITIES.find((c) => [c.city, ...(c.aliases ?? [])].some((n) => norm(n) === q));
}

/**
 * The city as one name: a known city's proper name when this is it or one of its aliases
 * ("dubai marina" → Dubai, "Lisboa" → Lisbon), else the text tidied (trimmed, single spaces).
 */
export function canonicalCity(input: string): string {
  const known = findCityExact(input);
  return known ? known.city : input.trim().replace(/\s+/g, " ");
}

/** Lower-case names a guide's city may be stored as for this city: the name plus a known city's aliases. */
export function cityNameVariants(input: string): string[] {
  const known = findCityExact(input);
  const names = known ? [known.city, ...(known.aliases ?? [])] : [input];
  // SQL compares with SQLite's lower(), which only lowers A–Z ("Üsküdar" stays "Üsküdar"), so both forms are listed.
  const tidy = names.map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean);
  return [...new Set([...tidy.map((n) => n.toLowerCase()), ...tidy.map((n) => n.replace(/[A-Z]/g, (c) => c.toLowerCase()))])];
}

/** Scan free text for any mention of a known city. */
export function detectCityInText(text: string): CityInfo | undefined {
  const t = ` ${norm(text)} `;
  let best: { city: CityInfo; len: number } | undefined;
  for (const c of CITIES) {
    for (const name of [c.city, ...(c.aliases ?? [])]) {
      const n = norm(name);
      if (n.length < 3) continue;
      if (t.includes(` ${n} `) || t.includes(` ${n},`) || t.includes(` ${n}.`)) {
        if (!best || n.length > best.len) best = { city: c, len: n.length };
      }
    }
  }
  return best?.city;
}
