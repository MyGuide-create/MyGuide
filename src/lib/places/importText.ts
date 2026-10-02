/**
 * Clean pasted lists before we look the places up: WhatsApp chat lines, bullet
 * and numbered lists, emojis, and Google Maps links (short or long).
 */

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
const WHATSAPP_PREFIX = /^\s*\[?\d{1,2}[./-]\d{1,2}[./-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/i;
const BULLET = /^\s*(?:[-*•·▪◦>]+|\d{1,3}[.)]|\(\d{1,3}\))\s*/;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

/** Pull a readable place name out of a Google Maps URL, or null. */
export function nameFromMapsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/google\.[a-z.]+$|goo\.gl$/i.test(u.hostname) && !u.hostname.startsWith("maps.")) return null;
    const m = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (m) return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null;
    const q = u.searchParams.get("q") ?? u.searchParams.get("query");
    if (q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) return q.trim();
    return null;
  } catch {
    return null;
  }
}

const isShortMapsLink = (url: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url);

/** Follow a short maps.app.goo.gl link to its full URL (a few hops, no body download). */
async function expand(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(4000) });
      const next = res.headers.get("location");
      if (!next) return current;
      current = new URL(next, current).toString();
      if (!isShortMapsLink(current)) return current;
    } catch {
      return current;
    }
  }
  return current;
}

export async function cleanImportedList(text: string): Promise<string> {
  const urls = [...new Set(text.match(URL_RE) ?? [])];
  const names = new Map<string, string>();
  await Promise.all(
    urls.slice(0, 40).map(async (raw) => {
      const url = raw.replace(/[.,;]+$/, "");
      const full = isShortMapsLink(url) ? await expand(url) : url;
      const name = nameFromMapsUrl(full);
      names.set(raw, name ?? "");
    }),
  );
  return text
    .split(/\r?\n/)
    .map((line) => {
      let l = line.replace(WHATSAPP_PREFIX, "");
      l = l.replace(URL_RE, (u) => (names.get(u) ? `\n${names.get(u)}\n` : ""));
      return l;
    })
    .join("\n")
    .split("\n")
    .map((l) => l.replace(EMOJI, " ").replace(BULLET, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && !/^(<media omitted>|this message was deleted)$/i.test(l))
    .join("\n");
}
