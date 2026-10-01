/**
 * Older places were saved with Google's *national* number (e.g. "0821-4607-4272"),
 * which won't dial from abroad. Convert to international using the place's country.
 */
const CALLING_CODES: Record<string, string> = {
  Indonesia: "62", "United Arab Emirates": "971", Lebanon: "961", "Saudi Arabia": "966", Qatar: "974",
  Bahrain: "973", Kuwait: "965", Oman: "968", Jordan: "962", Egypt: "20", Turkey: "90", "Türkiye": "90",
  "United Kingdom": "44", France: "33", Italy: "39", Spain: "34", Portugal: "351", Greece: "30",
  Germany: "49", Netherlands: "31", Switzerland: "41", Austria: "43", Belgium: "32", Ireland: "353",
  Thailand: "66", Malaysia: "60", Singapore: "65", Philippines: "63", Vietnam: "84", Japan: "81",
  "South Korea": "82", India: "91", "Sri Lanka": "94", Maldives: "960", Australia: "61", "New Zealand": "64",
  Morocco: "212", "South Africa": "27", Mexico: "52", Brazil: "55", Argentina: "54",
  "United States": "1", Canada: "1",
};

export function internationalPhone(phone: string, country?: string | null): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const code = country ? CALLING_CODES[country] : undefined;
  if (!code) return trimmed;
  // Italy keeps its leading 0; everyone else on this list drops the trunk prefix.
  const local = code === "39" ? trimmed : trimmed.replace(/^0+/, "");
  return `+${code} ${local}`;
}

export function displayPhone(phone: string, country?: string | null): string {
  return internationalPhone(phone, country);
}

export function telHref(phone: string, country?: string | null): string {
  return `tel:${internationalPhone(phone, country).replace(/[^\d+]/g, "")}`;
}
