// Fix a misspelt city everywhere on the LIVE MyGuide (9 Oct 2026: "Brussles" → Brussels).
// Looks the right spelling up on Google for the country and map centre, then updates
// guides (city, plus country/centre when missing), places, trips, wish lists and guide requests.
//
// Usage, from the MyGuide folder:
//   node scripts/fix-city.mjs Brussles Brussels           ← dry run: shows what would change, writes nothing
//   node scripts/fix-city.mjs Brussles Brussels --apply   ← writes the changes
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APPLY = process.argv.includes("--apply");
const [wrong, right] = args;
if (!wrong || !right) {
  console.log('Usage: node scripts/fix-city.mjs <misspelt city> <correct city> [--apply]');
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

// The correct city's country and centre, from Google.
let country = "";
let lat = null;
let lng = null;
if (env.GOOGLE_MAPS_API_KEY) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY, "X-Goog-FieldMask": "places.displayName,places.addressComponents,places.location" },
    body: JSON.stringify({ textQuery: right, pageSize: 1, includedType: "locality", languageCode: "en" }),
  });
  const p = res.ok ? (await res.json()).places?.[0] : null;
  if (p) {
    country = p.addressComponents?.find((c) => c.types?.includes("country"))?.longText ?? "";
    lat = p.location?.latitude ?? null;
    lng = p.location?.longitude ?? null;
    console.log(`Google: ${p.displayName?.text}, ${country} (${lat}, ${lng})`);
  } else console.log("Google lookup found nothing — fixing the spelling only.");
}

const match = "lower(trim(city)) = lower(?)";
const guides = await db.execute({ sql: `select g.id, g.title, g.city, g.country, g.lat, u.username from guides g join users u on u.id = g.owner_id where ${match}`, args: [wrong] });
console.log(`\nGuides with city "${wrong}": ${guides.rows.length}`);
for (const g of guides.rows) console.log(`  • "${g.title}" by @${g.username} — country "${g.country || "(none)"}"${g.lat == null ? ", no map centre" : ""}`);

const counts = {};
for (const t of ["places", "trips", "guide_wishes", "guide_requests"]) {
  counts[t] = Number((await db.execute({ sql: `select count(*) n from ${t} where ${match}`, args: [wrong] })).rows[0].n);
}
console.log(`Also: ${Object.entries(counts).map(([t, n]) => `${n} in ${t}`).join(", ")}`);

if (!APPLY) {
  console.log(`\nDry run — nothing written. Add --apply to change "${wrong}" → "${right}".`);
  process.exit(0);
}
await db.execute({
  sql: `update guides set city = ?, country = case when country = '' then ? else country end, lat = coalesce(lat, ?), lng = coalesce(lng, ?) where ${match}`,
  args: [right, country, lat, lng, wrong],
});
for (const t of ["places", "trips", "guide_wishes", "guide_requests"]) {
  await db.execute({ sql: `update ${t} set city = ? where ${match}`, args: [right, wrong] });
}
console.log(`\nDone: "${wrong}" → "${right}".`);
