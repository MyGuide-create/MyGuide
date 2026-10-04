// src/lib/places/googleMapsList.ts
// Reads a shared/public Google Maps saved list (maps.app.goo.gl/… or /maps/placelists/list/<id>).
// Uses Google's UNDOCUMENTED internal endpoint — best-effort only. It can change or be blocked
// at any time, so callers must fall back to the existing "copy the list text / Takeout / screenshot" message.

export type MapsListPlace = {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  note?: string; // the list owner's note on the place, if any
};

export type MapsListResult = { title?: string; places: MapsListPlace[] };

export type MapsListErrorCode = "not_a_list" | "fetch_failed" | "parse_failed" | "empty";

export class MapsListError extends Error {
  constructor(public code: MapsListErrorCode, message?: string) {
    super(message ?? code);
  }
}

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+", // skips the EU consent interstitial if Google shows it
};

const SHORT_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i;
const LIST_RE = /\/maps\/placelists\/list\/([A-Za-z0-9_-]+)/;
const MAX_PLACES = 500;

export function looksLikeMapsList(url: string): boolean {
  return LIST_RE.test(url) || SHORT_RE.test(url);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function resolveListId(url: string): Promise<string> {
  const direct = url.match(LIST_RE);
  if (direct) return direct[1];
  if (!SHORT_RE.test(url)) throw new MapsListError("not_a_list");

  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new MapsListError("fetch_failed", String(e));
  }
  for (const candidate of [res.url, safeDecode(res.url)]) {
    const m = candidate.match(LIST_RE);
    if (m) return m[1];
  }
  const html = (await res.text()).replace(/\\\//g, "/");
  const m = html.match(LIST_RE) ?? safeDecode(html).match(LIST_RE);
  if (m) return m[1];
  throw new MapsListError("not_a_list"); // a single place or something else — let the normal importer handle it
}

// ---- parsing (defensive: Google's array layout has no stable schema) ----

function isCoordPair(a: unknown): a is [unknown, unknown, number, number] {
  return (
    Array.isArray(a) &&
    a.length >= 4 &&
    a[0] == null &&
    a[1] == null &&
    typeof a[2] === "number" &&
    typeof a[3] === "number" &&
    Math.abs(a[2]) <= 90 &&
    Math.abs(a[3]) <= 180 &&
    !(a[2] === 0 && a[3] === 0)
  );
}

function findCoords(node: unknown, depth = 0): [number, number] | null {
  if (!Array.isArray(node) || depth > 3) return null;
  if (isCoordPair(node)) return [node[2], node[3]];
  for (const child of node) {
    const c = findCoords(child, depth + 1);
    if (c) return c;
  }
  return null;
}

// Known shape of one list entry: [?, info, name, note, …] where info[5] = [null, null, lat, lng]
function asPlace(item: unknown): MapsListPlace | null {
  if (!Array.isArray(item) || typeof item[2] !== "string" || !item[2].trim()) return null;
  const coords = findCoords(item[1]);
  if (!coords) return null;
  const info: unknown[] = Array.isArray(item[1]) ? item[1] : [];
  const address = [info[4], info[2]].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  const note = typeof item[3] === "string" && item[3].trim() ? item[3].trim() : undefined;
  return { name: item[2].trim(), lat: coords[0], lng: coords[1], address, note };
}

// Walk the whole response and keep the array that contains the most place-shaped entries.
function findPlaces(root: unknown): MapsListPlace[] {
  let best: MapsListPlace[] = [];
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length && visited < 200_000) {
    const node = stack.pop();
    visited++;
    if (!Array.isArray(node)) continue;
    const places = node.map(asPlace).filter((p): p is MapsListPlace => p !== null);
    if (places.length > best.length) best = places;
    for (const child of node) if (Array.isArray(child)) stack.push(child);
  }
  return best;
}

function dedupe(places: MapsListPlace[]): MapsListPlace[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = `${p.name.toLowerCase()}|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseMapsListResponse(text: string): MapsListResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\)\]\}'\s*/, "")); // strip Google's XSSI prefix
  } catch {
    throw new MapsListError("parse_failed");
  }
  const head = Array.isArray(data) && Array.isArray(data[0]) ? (data[0] as unknown[]) : [];
  const title = typeof head[4] === "string" && head[4].trim() ? head[4].trim() : undefined;
  const places = dedupe(findPlaces(data)).slice(0, MAX_PLACES);
  if (!places.length) throw new MapsListError("empty");
  return { title, places };
}

export async function fetchGoogleMapsList(url: string): Promise<MapsListResult> {
  const listId = await resolveListId(url.trim());
  const endpoint =
    "https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us" +
    `&pb=!1m4!1s${encodeURIComponent(listId)}!2e1!3m1!1e1!2e2!3e2!4i${MAX_PLACES}!16b1`;

  let res: Response;
  try {
    res = await fetch(endpoint, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  } catch (e) {
    throw new MapsListError("fetch_failed", String(e));
  }
  if (!res.ok) throw new MapsListError("fetch_failed", `HTTP ${res.status}`);
  return parseMapsListResponse(await res.text());
}
