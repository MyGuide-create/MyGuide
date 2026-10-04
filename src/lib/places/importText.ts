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
      // A plain (curl-like) request gets a normal 302; a browser-like one can get a JavaScript redirect page.
      const res = await fetch(current, { method: "GET", redirect: "manual", headers: { "User-Agent": "curl/8.7.1", Accept: "*/*" }, signal: AbortSignal.timeout(4000) });
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

/**
 * Google Takeout "Saved" lists are CSVs: Title,Note,URL,Tags,Comment.
 * Keep just the place title from each row (quoted fields handled).
 */
function takeoutTitles(text: string): string | null {
  const lines = text.split(/\r?\n/);
  if (!/^\s*title\s*,\s*note\s*,\s*url/i.test(lines[0] ?? "")) return null;
  const out: string[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const m = line.match(/^\s*"((?:[^"]|"")*)"|^\s*([^,]*)/);
    const title = (m?.[1] ?? m?.[2] ?? "").replace(/""/g, '"').trim();
    // "Milk & Madu, Canggu" → "Milk & Madu in Canggu" so the list parser doesn't split it in two.
    if (title) out.push(title.replace(/\s*,\s*/, " in ").replace(/,/g, " "));
    else {
      const url = line.match(URL_RE)?.[0];
      if (url) out.push(url);
    }
  }
  return out.join("\n");
}

/** Shown when a Google Maps saved list can't be read automatically. */
export const MAPS_LIST_FALLBACK =
  "We couldn't read that Google Maps list automatically. Try one of these instead: take screenshots of the list and use Add screenshots above; or on a computer, open the list in Google Maps, select it (click the first place, then shift-click the last, or Cmd/Ctrl+A), copy and paste it here; or download your lists from Google Takeout (Saved) and paste the CSV.";

const LIST_LINK_RE =
  /https?:\/\/(?:maps\.app\.goo\.gl\/[A-Za-z0-9_-]+|goo\.gl\/maps\/[A-Za-z0-9_-]+|(?:www\.)?google\.[a-z.]+\/maps\/placelists\/list\/[A-Za-z0-9_-]+)[^\s<>"')]*/i;
const MAPS_LINK_RE = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.|maps\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i;

/**
 * The first Google Maps list link in pasted text, plus the text just before it. The iPhone app
 * shares "London · Shahryar" + newline + link. Short links may still turn out to be a single
 * place — the list reader reports that as not_a_list.
 */
export function findMapsListLink(text: string): { url: string; caption: string } | null {
  const m = LIST_LINK_RE.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return { url: m[0].replace(/[.,;]+$/, ""), caption: before.at(-1) ?? "" };
}

/** Any Google Maps link at all (a single place or a list). */
export function hasMapsLink(text: string): boolean {
  return MAPS_LINK_RE.test(text);
}

/** "London · Shahryar" → "London": a fallback guide title from a list's share caption. */
export function listTitleFromCaption(caption: string): string {
  const c = caption.replace(WHATSAPP_PREFIX, "").replace(URL_RE, "").replace(EMOJI, " ").replace(/\s+/g, " ").trim();
  if (!c || /google maps|check out|shared? (?:a |this )?list/i.test(c)) return "";
  return c.split(/\s+[·•|]\s+/)[0].replace(/[\s:–—-]+$/, "").trim().slice(0, 80);
}

/** A Google Maps link to a whole saved list (not a single place). */
export function isMapsListUrl(url: string): boolean {
  return /\/maps\/(?:placelists|@[^/]*\/data=[^?]*!11m1)/.test(url) || /\/maps\/placelists\//.test(url);
}

/** Lines Google Maps adds when you copy a list page: ratings, prices, categories, buttons. */
const MAPS_NOISE = [
  /^\d(?:[.,]\d)?\s*\(\d[\d,.]*\)$/, // 4.4(811)
  /^(?:[£$€¥₹]|AED|USD|EUR|GBP|IDR|Rp)\s?\d/i, // £20–30
  /^[£$€¥]{1,4}$/, // ££
  /^·\s*/, // · Japanese
  /^(?:search google maps|save|share|layers|directions|nearby|send to phone|sign in|menu|more|map data.*|terms|privacy|send product feedback|united arab emirates|\d+\s?(?:km|mi|m|ft))$/i,
  /·\s*\d+\s+places?\s*·/i, // "Shahryar · 25 places · Shared list"
  /^(?:shared list|private list|public list|your lists?|saved)$/i,
  /^(?:open|closed|opens|closes)\b.*$/i,
];

const RATING = /^\d(?:[.,]\d)?\s*\(\d[\d,.]*\)$/;
const PRICE = /^(?:[£$€¥₹]|AED|USD|EUR|GBP|IDR|Rp)\s?\d|^[£$€¥]{1,4}$/i;

/**
 * Text copied from a Google Maps list page comes as blocks: name, rating, price, "· category".
 * Keep only the names. Returns null when the text doesn't look like that.
 */
function mapsListCopy(lines: string[]): string[] | null {
  const ratings = lines.filter((l) => RATING.test(l)).length;
  if (ratings < 2) return null;
  const out: string[] = [];
  let afterRating = false;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    const next = lines[k + 1] ?? "";
    if (/·\s*\d+\s+places?\s*·/i.test(next)) continue; // list title just above "Name · 25 places · Shared list"
    if (RATING.test(l)) { afterRating = true; continue; }
    if (/^permanently closed$/i.test(l)) { out.pop(); afterRating = false; continue; }
    if (afterRating) {
      // price, "· category", plain category or status lines that follow a rating
      if (PRICE.test(l) || /^·/.test(l) || /^temporarily closed$/i.test(l) || !RATING.test(next)) {
        if (!RATING.test(next)) continue;
      }
    }
    if (MAPS_NOISE.some((re) => re.test(l))) continue;
    if (RATING.test(next)) {
      afterRating = false;
      out.push(l.replace(/,/g, " ").replace(/\s+/g, " ").trim()); // one place per line — commas are part of the name
    }
  }
  return out;
}

function dropMapsNoise(lines: string[]): string[] {
  const fromList = mapsListCopy(lines);
  if (fromList) return fromList;
  const out: string[] = [];
  for (const l of lines) {
    if (/^(?:permanently closed)$/i.test(l)) {
      out.pop(); // skip places Google says have closed for good
      continue;
    }
    if (/^temporarily closed$/i.test(l)) continue;
    if (MAPS_NOISE.some((re) => re.test(l))) continue;
    out.push(l);
  }
  return out;
}

export interface CleanedImport {
  text: string;
  /** Google Maps links to whole saved lists — read separately via /api/import/maps-list. */
  listLinks: number;
  /** The list links as pasted (short links kept short; the list reader resolves them itself). */
  listUrls: string[];
  /** Share captions next to list links ("London · Shahryar"), taken out of `text` so they aren't read as places. */
  listCaptions: string[];
}

export async function cleanImportedList(text: string): Promise<CleanedImport> {
  text = takeoutTitles(text) ?? text;
  const urls = [...new Set(text.match(URL_RE) ?? [])];
  const names = new Map<string, string>();
  const listUrls: string[] = [];
  await Promise.all(
    urls.slice(0, 40).map(async (raw) => {
      const url = raw.replace(/[.,;]+$/, "");
      const full = isShortMapsLink(url) ? await expand(url) : url;
      if (isMapsListUrl(full)) listUrls.push(url);
      const name = isMapsListUrl(full) ? null : nameFromMapsUrl(full);
      names.set(raw, name ?? "");
    }),
  );
  // A list link's share caption is on the same line or the line above ("London · Shahryar").
  const listCaptions: string[] = [];
  const rawLines = text.split(/\r?\n/);
  if (listUrls.length) {
    const isList = (u: string) => listUrls.includes(u.replace(/[.,;]+$/, ""));
    rawLines.forEach((line, i) => {
      if (!(line.match(URL_RE) ?? []).some(isList)) return;
      const sameLine = line.replace(URL_RE, "").replace(WHATSAPP_PREFIX, "").trim();
      let j = i - 1;
      while (j >= 0 && !rawLines[j].trim()) j--;
      if (sameLine) listCaptions.push(sameLine);
      else if (j >= 0 && /\s·\s/.test(rawLines[j]) && !rawLines[j].match(URL_RE)) {
        listCaptions.push(rawLines[j].replace(WHATSAPP_PREFIX, "").trim());
        rawLines[j] = "";
      }
      rawLines[i] = "";
    });
  }
  const lines = rawLines
    .map((line) => {
      let l = line.replace(WHATSAPP_PREFIX, "");
      l = l.replace(URL_RE, (u) => (names.get(u) ? `\n${names.get(u)}\n` : ""));
      return l;
    })
    .join("\n")
    .split("\n")
    .map((l) => l.replace(EMOJI, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1 && !/^(<media omitted>|this message was deleted)$/i.test(l));
  const kept = dropMapsNoise(lines)
    .map((l) => l.replace(BULLET, "").trim())
    .filter((l) => l.length > 1);
  return { text: kept.join("\n"), listLinks: listUrls.length, listUrls, listCaptions };
}
