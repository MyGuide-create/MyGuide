// Read-only preview of the Levels plan against the LIVE data (19 Oct 2026).
// Shows how many spots people have per city, how many they vouch for, and which city level
// each would get today with the spec numbers and with lower pilot numbers.
// Usage, from the MyGuide folder:
//   node scripts/level-preview.mjs           live database
//   node scripts/level-preview.mjs --local   local dev database
// Changes nothing.
import fs from "node:fs";

const local = process.argv.includes("--local");
let db;
if (local) {
  const { createClient } = await import("@libsql/client");
  db = createClient({ url: "file:data/myguide.db" });
} else {
  const { createClient } = await import("@libsql/client/web");
  const env = Object.fromEntries(
    fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
  db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });
}
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows.map((r) => ({ ...r }));

const users = new Map((await q("select id, display_name from users")).map((u) => [u.id, u.display_name]));
const places = await q(`
  select p.id, p.name, p.google_place_id gid, lower(trim(coalesce(nullif(p.city,''), g.city))) city, p.category,
         p.note, p.shared_at, p.source_place_id, p.created_at,
         g.owner_id owner, g.visibility, g.published_at, g.forked_from_guide_id forked
  from places p join guides g on g.id = p.guide_id`);
const tipIds = new Set((await q("select distinct place_id from place_tips where trim(body) <> ''")).map((r) => r.place_id));
const saves = await q("select s.user_id saver, s.place_id from saved_places s");

const key = (p) => p.gid || `${String(p.name).toLowerCase().trim()}|${p.city}`;
const vouched = (p) => (p.visibility === "public" && p.published_at) || p.shared_at;
const words = (p) => String(p.note || "").trim().length > 0 || tipIds.has(p.id);
const byPlace = new Map(places.map((p) => [p.id, p]));

// person|city → stats
const stats = new Map();
const S = (owner, city) => {
  const k = `${owner}|${city}`;
  if (!stats.has(k)) stats.set(k, { owner, city, spots: 0, vouched: 0, withWords: 0, cats: new Set(), keys: new Set(), savers: new Set(), alsoVouch: new Set() });
  return stats.get(k);
};
for (const p of places) {
  if (!p.city) continue;
  const s = S(p.owner, p.city);
  s.spots++;
  // Copies with no words of their own aren't vouches (same rule as the city page).
  const own = !(p.source_place_id || p.forked) || words(p);
  if (vouched(p) && own) {
    s.vouched++;
    s.keys.add(key(p));
    s.cats.add(p.category);
    if (words(p)) s.withWords++;
  }
}
for (const sv of saves) {
  const p = byPlace.get(sv.place_id);
  if (!p || !p.city || sv.saver === p.owner) continue;
  S(p.owner, p.city).savers.add(sv.saver);
}
// Someone else vouches for the same spot (a vouch "too").
const vouchersByKey = new Map();
for (const p of places) if (p.city && vouched(p)) vouchersByKey.set(key(p), (vouchersByKey.get(key(p)) ?? new Set()).add(p.owner));
for (const s of stats.values()) for (const k of s.keys) for (const o of vouchersByKey.get(k) ?? []) if (o !== s.owner) s.alsoVouch.add(o);

const level = (s, n) => {
  if (s.savers.size >= n.insiderPeople && s.alsoVouch.size >= n.insiderAlso && s.cats.size >= 3 && s.vouched >= n.regular) return "Insider";
  if (s.vouched >= n.regular && s.withWords * 2 >= s.vouched) return "Regular";
  if (s.vouched >= n.regular) return "Regular (needs tips)";
  if (s.vouched >= 1) return "Tourist";
  return s.spots ? "Not vouched yet" : "";
};
const SPEC = { regular: 6, insiderPeople: 10, insiderAlso: 2 };
const PILOT = { regular: 6, insiderPeople: 4, insiderAlso: 1 };

const rows = [...stats.values()].filter((s) => s.spots > 0).sort((a, b) => b.spots - a.spots);
const pad = (v, n) => String(v).slice(0, n).padEnd(n);
console.log(`\n${users.size} people · ${places.length} places in total\n`);
console.log(pad("Person", 18), pad("City", 16), pad("Spots", 6), pad("Vouched", 8), pad("Words", 6), pad("Cats", 5), pad("Savers", 7), pad("Also", 5), pad("Spec level", 22), "Pilot level");
for (const s of rows)
  console.log(pad(users.get(s.owner) ?? "?", 18), pad(s.city, 16), pad(s.spots, 6), pad(s.vouched, 8), pad(s.withWords, 6), pad(s.cats.size, 5), pad(s.savers.size, 7), pad(s.alsoVouch.size, 5), pad(level(s, SPEC), 22), level(s, PILOT));

// Totals per person and the spread of spots per city.
const per = new Map();
for (const s of rows) {
  const t = per.get(s.owner) ?? { spots: 0, vouched: 0, cities: 0 };
  t.spots += s.spots;
  t.vouched += s.vouched;
  t.cities++;
  per.set(s.owner, t);
}
console.log("\nPer person (all cities):");
for (const [o, t] of [...per.entries()].sort((a, b) => b[1].spots - a[1].spots)) console.log(" ", pad(users.get(o) ?? "?", 18), `${t.spots} spots, ${t.vouched} vouched, ${t.cities} cities`);
const buckets = [[1, 5], [6, 15], [16, 30], [31, 60], [61, 100000]];
console.log("\nPerson-city pairs by number of spots:");
for (const [lo, hi] of buckets) console.log(`  ${lo}${hi > 1000 ? "+" : `–${hi}`}: ${rows.filter((s) => s.spots >= lo && s.spots <= hi).length}`);
console.log("");
