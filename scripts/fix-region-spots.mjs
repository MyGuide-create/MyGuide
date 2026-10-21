// Spots that are really a city or region (21 Oct 2026: Margit's "Cincinnati" and "Istanbul" — Add a place
// offered the city itself, she picked it and wrote the real venue in her description).
//
// Run from the MyGuide folder with tsx (it reuses the app's own Google and city code):
//   npx tsx scripts/fix-region-spots.mjs
//       Report every saved place Google says is a city/region (locality, admin area, country, postcode…):
//       owner, name, city, guide or My spots, vouched/private, start of the description. Writes nothing.
//       Places the database can't be a city for (they have opening hours or a phone) aren't looked up
//       (a city can have a website on Google, e.g. the city council's);
//       add --all to look up every place anyway.
//   Add --user <username> to list only one person's.
//   npx tsx scripts/fix-region-spots.mjs --place <placeId> --to "<venue search>"
//       Look the venue up on Google and show what would change. Writes nothing.
//   npx tsx scripts/fix-region-spots.mjs --place <placeId> --to "<venue search>" --apply
//       Update that place in place: name, Google listing, map position, address, city/area, category, and
//       Google's photo/hours/phone (website only if it had none). Description, photos, tips, vouch, dates,
//       claps and want-to-go stay as they are. Stops if the owner already has that venue in My spots.
//
// Cost: report = one Place Details lookup (types only) per checked place; --to = one Text Search.
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = flag("--apply");

const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
if (!env.GOOGLE_MAPS_API_KEY) throw new Error("GOOGLE_MAPS_API_KEY missing from .env.vercel");
process.env.GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;
const { googleProvider, isRegionResult } = await import("../src/lib/places/google.ts");
const { STASH_TITLES } = await import("../src/lib/stash.ts");
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

const isStash = (g) => STASH_TITLES.includes(g.title) && g.published_at == null;
const where = (r) => (isStash(r) ? "My spots" : `guide “${r.title}”${r.published_at == null ? " (draft)" : ""}`);
const visibility = (r) => (isStash(r) ? (r.shared_at != null ? "vouched" : "private") : r.published_at != null ? "in a published guide" : "in a draft guide");
const short = (s, n = 80) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function googleTypes(id) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "types" },
  });
  if (!res.ok) return null;
  return (await res.json()).types ?? [];
}

const placeId = opt("--place");
const to = opt("--to");

if (!placeId) {
  // ---- Report ----
  const rows = (
    await db.execute(`
      select p.id, p.name, p.city, p.country, p.note, p.google_place_id, p.shared_at, p.hours_json, p.phone, p.website,
             g.title, g.published_at, u.username, u.display_name
      from places p join guides g on g.id = p.guide_id join users u on u.id = g.owner_id
      where p.google_place_id is not null and p.google_place_id not like 'mock:%'
      order by u.username, p.city, p.name`)
  ).rows;
  // A city has no opening hours or phone on Google, so those rows can't be one (unless --all).
  const check = flag("--all") ? rows : rows.filter((r) => r.hours_json == null && r.phone == null);
  const ids = [...new Set(check.map((r) => r.google_place_id))];
  console.log(`${rows.length} places with a Google listing; looking up ${ids.length} listing${ids.length === 1 ? "" : "s"} (${check.length} places)…`);
  const types = new Map();
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8);
    const got = await Promise.all(batch.map((id) => googleTypes(id).catch(() => null)));
    batch.forEach((id, j) => types.set(id, got[j]));
  }
  const failed = ids.filter((id) => types.get(id) == null).length;
  const found = check.filter((r) => isRegionResult(types.get(r.google_place_id)));
  const who = opt("--user");
  if (who) found.splice(0, found.length, ...found.filter((r) => r.username === who.replace(/^@/, "")));
  if (!found.length) console.log("No city or region spots found.");
  else {
    console.log(`\n${found.length} spot${found.length === 1 ? " is" : "s are"} really a city or region:\n`);
    for (const r of found) {
      console.log(`${r.id}  @${r.username} (${r.display_name})`);
      console.log(`  “${r.name}” · ${r.city || "no city"} · ${where(r)} · ${visibility(r)} · Google: ${types.get(r.google_place_id).join(", ")}`);
      console.log(`  ${r.note ? `“${short(r.note)}”` : "(no description)"}\n`);
    }
    console.log(`Fix one: npx tsx scripts/fix-region-spots.mjs --place <id> --to "<venue name and area>"`);
  }
  if (failed) console.log(`\n${failed} listing${failed === 1 ? "" : "s"} couldn't be looked up (removed from Google, or a key problem).`);
  process.exit(0);
}

// ---- Fix one ----
if (!to) {
  console.log('Add --to "<venue name and area>", e.g. --to "Son of a Butcher Liberty Township"');
  process.exit(1);
}
const r = (
  await db.execute({
    sql: `select p.*, g.title, g.published_at, g.owner_id, u.username from places p join guides g on g.id = p.guide_id join users u on u.id = g.owner_id where p.id = ?`,
    args: [placeId],
  })
).rows[0];
if (!r) {
  console.log(`No place with id ${placeId}.`);
  process.exit(1);
}
console.log(`Place:  “${r.name}” · ${r.city || "no city"} · ${r.category} · @${r.username} · ${where(r)} · ${visibility(r)}`);
console.log(`        ${r.note ? `“${short(r.note)}”` : "(no description)"}`);

const venue = await googleProvider.searchText(to);
if (!venue) {
  console.log(`\nGoogle found nothing for “${to}”. Try the name plus the area or street.`);
  process.exit(1);
}
console.log(`\nGoogle: ${venue.name}`);
console.log(`        ${venue.address}`);
console.log(`        types: ${(venue.types ?? []).join(", ")}`);
console.log(`        → city “${venue.city}”${venue.area ? `, area “${venue.area}”` : ""}, category ${venue.category}`);
if (isRegionResult(venue.types)) {
  console.log("\nThat's a city or region too. Search for the venue itself (name plus area).");
  process.exit(1);
}

// Already in their My spots? Then it'd be there twice: stop and let them decide.
const theirs = (
  await db.execute({
    sql: `select p.id, p.name, g.title, g.published_at from places p join guides g on g.id = p.guide_id
          where g.owner_id = ? and p.google_place_id = ? and p.id != ?`,
    args: [r.owner_id, venue.providerId, r.id],
  })
).rows.filter(isStash);
if (theirs.length) {
  console.log(`\n@${r.username} already has ${venue.name} in My spots (${theirs.map((t) => t.id).join(", ")}). Not changing anything:`);
  console.log("copy the description over to that one by hand and remove this city spot instead.");
  process.exit(1);
}

const set = {
  name: venue.name,
  google_place_id: venue.providerId,
  lat: venue.lat,
  lng: venue.lng,
  address: venue.address,
  area: venue.area ?? "",
  city: venue.city,
  country: venue.country,
  // "" = not settled yet: the app settles it into its area again (e.g. a suburb under its main city).
  source_city: "",
  category: venue.category,
  photo_url: venue.photoUrl,
  hours_json: venue.hours ? JSON.stringify(venue.hours) : null,
  phone: venue.phone,
  business_status: venue.businessStatus,
};
console.log("\nWould set:");
for (const [k, v] of Object.entries(set)) console.log(`  ${k.padEnd(16)} ${JSON.stringify(r[k])} → ${JSON.stringify(v)}`);
if (r.website == null && venue.website) console.log(`  ${"website".padEnd(16)} null → ${JSON.stringify(venue.website)}`);
console.log("Kept: description, photos, tips, vouch, dates, claps, want-to-go.");
if (!APPLY) {
  console.log("\nDry run. Add --apply to save it.");
  process.exit(0);
}
const cols = Object.keys(set);
await db.execute({
  sql: `update places set ${cols.map((c) => `${c} = ?`).join(", ")}, website = coalesce(website, ?) where id = ?`,
  args: [...cols.map((c) => set[c] ?? null), venue.website ?? null, r.id],
});
console.log(`\nDone: “${r.name}” is now “${venue.name}” (${venue.category}).`);
