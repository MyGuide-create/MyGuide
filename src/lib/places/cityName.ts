/**
 * Tidy a city name from Google or a creator before it's stored or shown.
 * - Bali's regencies ("Kabupaten Badung", "Badung Regency", "Kota Denpasar") → "Bali": Google gives
 *   most Bali places no town, so the regency used to leak through as the "city".
 * - Other Indonesian "Kabupaten X" / "Kota X" → "X".
 * - Stray spaces, including around hyphens ("Crans- Montana" → "Crans-Montana").
 */
const BALI_REGENCIES = ["badung", "gianyar", "tabanan", "bangli", "klungkung", "karangasem", "buleleng", "jembrana", "denpasar"];

export function tidyCity(raw: string | null | undefined): string {
  let city = (raw ?? "").replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").trim();
  if (!city) return "";
  const m = city.match(/^(?:kabupaten|kota|regency of)\s+(.+)$/i) ?? city.match(/^(.+?)\s+regency$/i);
  if (m) {
    const name = m[1].trim();
    if (BALI_REGENCIES.includes(name.toLowerCase())) return "Bali";
    city = name;
  }
  return city;
}
