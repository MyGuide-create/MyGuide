// Check the LIVE MyGuide for cities spelled more than one way (10 Oct 2026).
// Home and the city pages group guides by city, so "Dubai" vs "Dubai Marina", or "Lisbon" vs "Lisbn",
// would look like different cities. This only READS — it prints suspicious names and the fix-city
// command for each. Nothing is changed.
//
// Usage, from the MyGuide folder:
//   node scripts/check-cities.mjs
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

// Known cities and their aliases, read from the app's own list (src/lib/places/cities.ts).
const src = fs.readFileSync("src/lib/places/cities.ts", "utf8");
const known = [];
for (const m of src.matchAll(/\{\s*city:\s*"([^"]+)"[^}]*\}/g)) {
  const list = m[0].match(/aliases:\s*\[([^\]]*)\]/);
  const aliases = list ? [...list[1].matchAll(/"([^"]+)"/g)].map((a) => a[1]) : [];
  known.push({ city: m[1], aliases });
}
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const aliasOf = new Map();
for (const k of known) for (const n of [k.city, ...k.aliases]) aliasOf.set(norm(n), k.city);

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

const count = async (table) =>
  (await db.execute(`select city, count(*) n from ${table} where trim(city) != '' group by city order by n desc`)).rows.map((r) => ({ city: String(r.city), n: Number(r.n) }));
const guideCities = await count("guides");
const wishCities = await count("guide_wishes");
const all = new Map();
for (const r of [...guideCities, ...wishCities]) all.set(r.city, (all.get(r.city) ?? 0) + r.n);
const names = [...all.keys()];

console.log(`\nGuide cities (${guideCities.length}):`);
for (const r of guideCities) console.log(`  ${String(r.n).padStart(3)}  ${r.city}`);

const fixes = new Map(); // wrong -> [right, reason]
for (const name of names) {
  const proper = aliasOf.get(norm(name));
  if (proper && proper !== name) fixes.set(name, [proper, proper.toLowerCase() === name.trim().toLowerCase() ? "spacing/capitals" : "part of " + proper]);
}
// Same name written differently (capitals, spaces, accents): keep the most used spelling.
const byNorm = new Map();
for (const name of names) byNorm.set(norm(name), [...(byNorm.get(norm(name)) ?? []), name]);
for (const group of byNorm.values()) {
  if (group.length < 2) continue;
  const best = [...group].sort((a, b) => all.get(b) - all.get(a))[0];
  for (const n of group) if (n !== best && !fixes.has(n)) fixes.set(n, [best, "spacing/capitals/accents"]);
}
// Close spellings ("Lisbn" vs "Lisbon"): suggest the more used one, or the known city.
for (let i = 0; i < names.length; i++)
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    const na = norm(a), nb = norm(b);
    if (na === nb || Math.min(na.length, nb.length) < 4) continue;
    const allowed = Math.max(na.length, nb.length) <= 5 ? 1 : 2;
    if (distance(na, nb) > allowed) continue;
    const aKnown = aliasOf.has(na), bKnown = aliasOf.has(nb);
    const [wrong, right] = aKnown && !bKnown ? [b, a] : bKnown && !aKnown ? [a, b] : all.get(a) >= all.get(b) ? [b, a] : [a, b];
    if (!fixes.has(wrong)) fixes.set(wrong, [right, "looks like a misspelling"]);
  }

if (!fixes.size) {
  console.log("\nNo duplicate or misspelt city names found.");
} else {
  console.log(`\nPossible duplicates (${fixes.size}) — check each, then run the command to fix it:`);
  for (const [wrong, [right, why]] of fixes) {
    console.log(`\n  "${wrong}" → "${right}"  (${why}; ${all.get(wrong)} guide/wish${all.get(wrong) === 1 ? "" : "es"})`);
    console.log(`    node scripts/fix-city.mjs "${wrong}" "${right}"            ← dry run`);
    console.log(`    node scripts/fix-city.mjs "${wrong}" "${right}" --apply    ← fix it`);
  }
}
console.log("\nNote: Home already shows a known city's neighbourhoods (e.g. Dubai Marina) under the city, but fixing the data keeps search and city pages tidy too.\n");
