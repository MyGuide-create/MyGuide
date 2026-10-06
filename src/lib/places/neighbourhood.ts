const ADMIN = /^(kec\.?|kecamatan|kabupaten|kab\.?|kota|regency|district|province|prefecture|governorate|emirate|county|state of)\b/i;
const STREET = /^(jl\.?|jln\.?|jalan|gg\.?|gang)\s|\bno\.?\s?\d|^\d+[a-z]?\s|^\d+$|\b(street|st\.?|road|rd\.?|avenue|ave\.?|blvd|boulevard|lane|ln\.?|way|highway|hwy)$/i;
/** Street names in other languages ("C. de Augusto Figueroa", "Rua Garrett", "Via Roma"). */
const FOREIGN_STREET = /^(c\/|c\.|calle|av\.|avda\.?|avenida|paseo|pº|p\.º|plaza|pl\.|ctra\.?|carretera|camino|rua|r\.|travessa|largo|praça|rue|bd|via|viale|piazza|corso|strada|straße|strasse)\s/i;
/** Unit, floor and landmark bits ("Bajo- Local 5", "Loc 4", "Km. 1.9", "esquina", "Shop 12", "Level 2"). */
const UNIT = /^(bajo|local|loc\.?|planta|piso|puerta|esc\.?|km\.?|kil[oó]metro|esquina|esq\.?|floor|fl\.?|unit|suite|ste\.?|shop|store|level|lvl\.?|bldg\.?|building|block|blk\.?|tower|apt\.?|apartment|office|room|g\/f|ground floor|#)(\b|\s|-|$)|\d+(st|nd|rd|th)\s+floor|\b\d+[.,]\d+\b|階/i;
const POSTAL = /\b\d{4,6}\b|\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/;

/**
 * Best-guess neighbourhood from a formatted address, e.g.
 * "Jl. Pantai Batu Bolong No.92, Canggu, Kec. Kuta Utara, …, Indonesia" → "Canggu".
 * Falls back to the city. Returns "" when nothing useful is found.
 */
export function neighbourhood(address: string, city?: string | null, country?: string | null): string {
  const parts = address
    .split(/\s*,\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (country && parts.length && parts[parts.length - 1].toLowerCase() === country.toLowerCase()) parts.pop();
  if (parts.length < 3) return city ?? "";
  const candidates = parts
    .slice(1)
    .filter((p) => !STREET.test(p) && !FOREIGN_STREET.test(p) && !UNIT.test(p) && !ADMIN.test(p) && !POSTAL.test(p) && p.length <= 32);
  const cityLower = city?.toLowerCase();
  const hood = candidates.find((p) => p.toLowerCase() !== cityLower);
  return hood ?? city ?? "";
}
