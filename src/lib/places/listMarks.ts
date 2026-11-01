/**
 * Marks people type into Google Maps list names (1 Nov 2026, from Mona's Tokyo list):
 * "Kyubey Sushi*" (an asterisk = a spot to prioritise → Must try) and
 * "Ginza Kojyu - TWO Michelin Star" (a short label after " - " → their note).
 */

/** Strip the asterisks: a starred name is a Must try. */
export function readStar(name: string): { name: string; star: boolean } {
  const star = name.includes("*");
  return { name: star ? name.replace(/\*+/g, " ").replace(/\s+/g, " ").trim() : name.trim(), star };
}

/** "Ginza Kojyu - TWO Michelin Star" → base "Ginza Kojyu", label "TWO Michelin Star". No " - " → no label. */
export function splitLabel(name: string): { base: string; label: string } {
  const m = name.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (!m || m[1].trim().length < 2) return { base: name, label: "" };
  return { base: m[1].trim(), label: m[2].trim() };
}

const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Is the label part of the real name? "Toritanaka - Shutei Tanaka" vs Google's "Toritanaka Shutei
 * Tanaka" → yes (every word is in the name). "Ramen Manrai - Classic Ramen" vs "Ramen Manrai" → no,
 * so "Classic Ramen" is their note.
 */
export function labelIsName(label: string, matchedName: string): boolean {
  const have = new Set(words(matchedName));
  const w = words(label);
  return w.length > 0 && w.every((x) => have.has(x));
}

/** The note to keep: their label (when it isn't part of the name) before any note from the list. */
export function noteWithLabel(label: string, matchedName: string | null, note?: string): string | undefined {
  const keep = label && matchedName && !labelIsName(label, matchedName) ? label : "";
  const out = [keep, note?.trim() ?? ""].filter(Boolean).join("\n");
  return out || undefined;
}
