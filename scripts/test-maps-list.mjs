// scripts/test-maps-list.mjs
// Run on the Mac:  node scripts/test-maps-list.mjs "https://maps.app.goo.gl/FXYbsTXDfRALVNSE8"
// Checks that Google's list endpoint answers and the parser finds the places.
// Saves the raw response to /tmp/maps-list-raw.json so the parser can be adjusted if needed.
import { writeFileSync } from "node:fs";

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/test-maps-list.mjs "<Google Maps list link>"');
  process.exit(1);
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+",
};
const LIST_RE = /\/maps\/placelists\/list\/([A-Za-z0-9_-]+)/;
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// 1. Resolve the short link to a list id
let listId = url.match(LIST_RE)?.[1];
// A browser User-Agent gets a JavaScript redirect page; a plain request gets a normal 302.
let current = url;
for (let hop = 0; !listId && hop < 5; hop++) {
  const res = await fetch(current, { headers: { "User-Agent": "curl/8.7.1", Accept: "*/*" }, redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) {
    const body = (await res.text()).replace(/\\\//g, "/").replace(/\\u002F/gi, "/");
    listId = body.match(LIST_RE)?.[1] ?? dec(body).match(LIST_RE)?.[1];
    break;
  }
  current = new URL(location, current).toString();
  console.log("Redirects to:", current.slice(0, 100) + (current.length > 100 ? "…" : ""));
  listId = current.match(LIST_RE)?.[1] ?? dec(current).match(LIST_RE)?.[1];
}
if (!listId) {
  console.error("✗ Couldn't find a list id — is this a saved-list link?");
  process.exit(1);
}
console.log("List id:", listId);

// 2. Call the internal endpoint
const endpoint =
  "https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us" +
  `&pb=!1m4!1s${encodeURIComponent(listId)}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
const res = await fetch(endpoint, { headers: HEADERS });
const text = await res.text();
writeFileSync("/tmp/maps-list-raw.json", text);
console.log(`Endpoint HTTP ${res.status}, ${text.length} bytes (saved to /tmp/maps-list-raw.json)`);

// 3. Parse (same logic as src/lib/places/googleMapsList.ts)
const isCoord = (a) =>
  Array.isArray(a) && a.length >= 4 && a[0] == null && a[1] == null &&
  typeof a[2] === "number" && typeof a[3] === "number" &&
  Math.abs(a[2]) <= 90 && Math.abs(a[3]) <= 180 && !(a[2] === 0 && a[3] === 0);
const findCoords = (n, d = 0) => {
  if (!Array.isArray(n) || d > 3) return null;
  if (isCoord(n)) return [n[2], n[3]];
  for (const c of n) { const r = findCoords(c, d + 1); if (r) return r; }
  return null;
};
const asPlace = (it) => {
  if (!Array.isArray(it) || typeof it[2] !== "string" || !it[2].trim()) return null;
  const c = findCoords(it[1]);
  if (!c) return null;
  const info = Array.isArray(it[1]) ? it[1] : [];
  const address = [info[4], info[2]].find((v) => typeof v === "string" && v.trim());
  return { name: it[2].trim(), lat: c[0], lng: c[1], address, note: typeof it[3] === "string" ? it[3] : undefined };
};

let data;
try { data = JSON.parse(text.replace(/^\)\]\}'\s*/, "")); }
catch { console.error("✗ Response isn't JSON — Google may have blocked or changed the endpoint."); process.exit(1); }

let best = [];
const stack = [data];
while (stack.length) {
  const n = stack.pop();
  if (!Array.isArray(n)) continue;
  const ps = n.map(asPlace).filter(Boolean);
  if (ps.length > best.length) best = ps;
  for (const c of n) if (Array.isArray(c)) stack.push(c);
}

console.log("Title:", typeof data?.[0]?.[4] === "string" ? data[0][4] : "(not found)");
console.log(best.length ? `✓ Found ${best.length} places:` : "✗ Found 0 places — send Claude the start of /tmp/maps-list-raw.json");
for (const p of best.slice(0, 15)) {
  console.log(` • ${p.name}  (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})${p.address ? "  — " + p.address : ""}${p.note ? "  [note: " + p.note + "]" : ""}`);
}
