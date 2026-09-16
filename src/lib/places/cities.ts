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
  { city: "Dubai", country: "United Arab Emirates", lat: 25.2048, lng: 55.2708, aliases: ["jumeirah", "deira", "al quoz", "marina"] },
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

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Find a known city by name or alias. Prefers exact matches, then substring matches. */
export function findCity(input: string | undefined | null): CityInfo | undefined {
  if (!input) return undefined;
  const q = norm(input);
  if (!q) return undefined;
  let best: CityInfo | undefined;
  for (const c of CITIES) {
    const names = [c.city, ...(c.aliases ?? [])].map(norm);
    if (names.includes(q)) return c;
    if (!best && names.some((n) => q.includes(n) || (n.length > 3 && n.includes(q)))) best = c;
  }
  return best;
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
