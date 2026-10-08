// One-off (8 Oct 2026, Raad's feedback): tidy places that were added before Group 2.
//   • English addresses (Google used to answer in the local language — Arabic street names in Dubai)
//   • the neighbourhood under each place ("Umm Suqeim", "Canggu") from Google, stored in places.area
//   • ALL-CAPS names → normal case ("CAFE BATEEL" → "Cafe Bateel"); other names are left as the creator has them
//   • a centre point for each guide's city (guides.lat/lng), for the map on new guides and place search
//
// Usage, from the MyGuide folder, AFTER deploying (the deploy adds the new columns):
//   node scripts/refresh-places.mjs           ← dry run: shows what would change, writes nothing
//   node scripts/refresh-places.mjs --apply   ← writes the changes
// Cost: one Google Place Details lookup per place (+ one per dropped pin / guide without a centre). Safe to re-run.
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const key = env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("GOOGLE_MAPS_API_KEY missing from .env.vercel");
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

/* ---- same rules as src/lib/places/tidy.ts (keep in sync) ---- */
const SMALL = new Set(["a", "an", "and", "at", "by", "de", "del", "di", "du", "for", "in", "la", "le", "of", "on", "or", "the", "to", "y"]);
function tidyPlaceName(name) {
  const t = name.trim().replace(/\s+/g, " ");
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return t;
  if (!t.split(" ").some((w) => w.replace(/[^A-Za-z]/g, "").length >= 4)) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/(^|[-/(])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/'([a-z])(?=[a-z])/g, (_, c) => `'${c.toUpperCase()}`)))
    .join(" ");
}
const DIRECTIONS = /^(opp\.?|opposite|near|nr\.?|next to|beside|behind|in front of|across from|facing|after|before|off)\b/i;
const NUMBERED_STREET = /^(street|st\.?|road|rd\.?|lane|alley)\s*(no\.?\s*)?\d+[a-z]?$|^\d+[a-z]?(st|nd|rd|th)?\s+(street|st\.?|road|rd\.?)$/i;
const isNoise = (p) => DIRECTIONS.test(p) || NUMBERED_STREET.test(p) || !/[A-Za-z]/.test(p);
const tidyArea = (a) => (!a?.trim() || isNoise(a.trim()) ? "" : tidyPlaceName(a.trim()));
function areaFromComponents(comps, city) {
  for (const type of ["neighborhood", "sublocality_level_1", "sublocality", "sublocality_level_2"]) {
    const hit = (comps ?? []).find((c) => c.types?.includes(type));
    const area = hit ? tidyArea(hit.longText ?? hit.long_name) : "";
    if (area && area.toLowerCase() !== (city ?? "").toLowerCase()) return area;
  }
  return "";
}
const hasLatin = (s) => /[A-Za-z]/.test(s ?? "");
const nonLatin = (s) => /[^\u0000-ɏ\s\d.,'’()&\-/#+]/.test(s ?? "");
/* ------------------------------------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lookups = 0, errors = 0;
async function g(path, fieldMask, body) {
  lookups++;
  const url = `https://places.googleapis.com/v1${path}${body ? "" : `${path.includes("?") ? "&" : "?"}languageCode=en`}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fieldMask, "Content-Type": "application/json" },
    body: body ? JSON.stringify({ languageCode: "en", ...body }) : undefined,
  });
  if (!res.ok) {
    errors++;
    if (errors <= 3) console.log(`  Google said ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  return res.json();
}

const changes = [];
const note = (what, id, before, after) => changes.push({ what, id, before, after });

// 1) Places with a Google listing.
const { rows: listed } = await db.execute(
  "select id, name, address, area, city, country, google_place_id from places where google_place_id is not null and google_place_id not like 'mock:%'"
);
console.log(`${listed.length} place(s) with a Google listing…`);
for (const p of listed) {
  const d = await g(`/places/${encodeURIComponent(p.google_place_id)}`, "displayName,formattedAddress,addressComponents");
  await sleep(80);
  if (!d) continue;
  const comp = (t) => d.addressComponents?.find((c) => c.types?.includes(t))?.longText ?? "";
  const set = {};
  if (d.formattedAddress && d.formattedAddress !== p.address) set.address = d.formattedAddress;
  const city = p.city && !nonLatin(p.city) ? p.city : comp("locality") || comp("postal_town") || comp("administrative_area_level_2") || comp("administrative_area_level_1") || p.city;
  if (city !== p.city) set.city = city;
  const country = p.country && !nonLatin(p.country) ? p.country : comp("country") || p.country;
  if (country !== p.country) set.country = country;
  const area = areaFromComponents(d.addressComponents, city);
  if (area && area !== p.area) set.area = area;
  // Names: fix ALL CAPS, or swap a non-Latin name for Google's English one. Anything else is the creator's.
  let name = tidyPlaceName(p.name);
  if (!hasLatin(p.name) && hasLatin(d.displayName?.text)) name = tidyPlaceName(d.displayName.text);
  if (name !== p.name) set.name = name;
  if (Object.keys(set).length) {
    note("place", p.id, { name: p.name, address: p.address, area: p.area }, set);
    if (APPLY) {
      const cols = Object.keys(set);
      await db.execute({ sql: `update places set ${cols.map((c) => `${c} = ?`).join(", ")} where id = ?`, args: [...cols.map((c) => set[c]), p.id] });
    }
  }
}

// 2) Dropped pins (no listing): English area via reverse geocoding, ALL-CAPS names.
const { rows: pins } = await db.execute("select id, name, address, area, city, lat, lng from places where google_place_id is null and lat is not null");
console.log(`${pins.length} dropped pin(s)…`);
for (const p of pins) {
  const set = {};
  const name = tidyPlaceName(p.name);
  if (name !== p.name) set.name = name;
  if (!p.area || nonLatin(p.address)) {
    lookups++;
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${p.lat},${p.lng}&language=en&key=${key}`).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    await sleep(80);
    if (data?.status === "OK") {
      const comps = data.results.flatMap((r) => r.address_components);
      const find = (...t) => comps.find((c) => t.some((x) => c.types.includes(x)))?.long_name ?? "";
      const city = find("locality", "postal_town") || find("administrative_area_level_2") || find("administrative_area_level_1");
      const hood = tidyArea(find("neighborhood", "sublocality", "sublocality_level_1"));
      if (hood && hood !== city && hood !== p.area) set.area = hood;
      if (nonLatin(p.address)) set.address = [hood && hood !== city ? hood : "", city, find("country")].filter(Boolean).join(", ");
    } else if (data && data.status !== "ZERO_RESULTS") {
      errors++;
      if (errors <= 3) console.log(`  Geocoding said ${data.status} (is the Geocoding API enabled for the key?)`);
    }
  }
  if (Object.keys(set).length) {
    note("pin", p.id, { name: p.name, address: p.address, area: p.area }, set);
    if (APPLY) {
      const cols = Object.keys(set);
      await db.execute({ sql: `update places set ${cols.map((c) => `${c} = ?`).join(", ")} where id = ?`, args: [...cols.map((c) => set[c]), p.id] });
    }
  }
}

// 3) Guides without a centre point.
const { rows: gs } = await db.execute("select id, title, city, country from guides where lat is null and city != ''");
console.log(`${gs.length} guide(s) without a city centre…`);
for (const gd of gs) {
  const found = await g("/places:searchText", "places.location", { textQuery: [gd.city, gd.country].filter(Boolean).join(", "), pageSize: 1 });
  await sleep(80);
  const loc = found?.places?.[0]?.location;
  if (!loc) continue;
  note("guide", gd.id, { title: gd.title, city: gd.city }, { lat: loc.latitude, lng: loc.longitude });
  if (APPLY) await db.execute({ sql: "update guides set lat = ?, lng = ? where id = ?", args: [loc.latitude, loc.longitude, gd.id] });
}

for (const c of changes.slice(0, 60)) {
  const label = c.before.name ?? c.before.title;
  const parts = Object.entries(c.after).map(([k, v]) => `${k}: ${JSON.stringify(c.before[k] ?? "")} → ${JSON.stringify(v)}`);
  console.log(`  ${c.what} · ${label}\n      ${parts.join("\n      ")}`);
}
if (changes.length > 60) console.log(`  …and ${changes.length - 60} more`);
console.log(`\n${APPLY ? "Updated" : "Would update"} ${changes.length} row(s). Google lookups: ${lookups}. Errors: ${errors}.`);
if (!APPLY) console.log("Dry run — nothing written. Run again with --apply to save.");
