const ADMIN = /^(kec\.?|kecamatan|kabupaten|kab\.?|kota|regency|district|province|prefecture|governorate|emirate|county|state of)\b/i;
const STREET = /^(jl\.?|jln\.?|jalan|gg\.?|gang)\s|\bno\.?\s?\d|^\d+[a-z]?\s|^\d+$|\b(street|st\.?|road|rd\.?|avenue|ave\.?|blvd|boulevard|lane|ln\.?|way|highway|hwy)$/i;
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
    .filter((p) => !STREET.test(p) && !ADMIN.test(p) && !POSTAL.test(p) && p.length <= 32);
  const cityLower = city?.toLowerCase();
  const hood = candidates.find((p) => p.toLowerCase() !== cityLower);
  return hood ?? city ?? "";
}
