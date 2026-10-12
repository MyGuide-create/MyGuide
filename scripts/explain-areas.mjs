// Why does a town still show as its own city? Lists every place whose town (or area) matches,
// with its guide, the guide's city and how far it is from the guide's places. Read-only.
//
// Usage, from the MyGuide folder:  node scripts/explain-areas.mjs Grândola Sparks
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const towns = process.argv.slice(2).map((t) => t.trim().toLowerCase()).filter(Boolean);
if (!towns.length) {
  console.log('Usage: node scripts/explain-areas.mjs <town> [<town>…]   e.g. node scripts/explain-areas.mjs Grândola Sparks');
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

const km = (a, b) => {
  const R = 6371, r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const job = await db.execute("select name, done_at from app_jobs").catch(() => ({ rows: [] }));
console.log("Settle jobs done:", job.rows.map((r) => `${r.name} (${new Date(Number(r.done_at)).toISOString()})`).join(", ") || "none yet — open the live site once");

const { rows } = await db.execute(`
  select p.id, p.name, p.city, p.source_city, p.area, p.country, p.lat, p.lng,
         g.id as gid, g.title, g.city as gcity, g.lat as glat, g.lng as glng, g.published_at, u.username
  from places p join guides g on g.id = p.guide_id join users u on u.id = g.owner_id`);
const hits = rows.filter((r) => [r.city, r.source_city, r.area].some((v) => towns.includes(String(v ?? "").trim().toLowerCase())));
if (!hits.length) console.log("No places in", towns.join(", "));
for (const r of hits) {
  const sameGuide = rows.filter((x) => x.gid === r.gid && x.lat != null && String(x.city).toLowerCase() === String(r.gcity).toLowerCase());
  const centre = r.glat != null ? { lat: r.glat, lng: r.glng } : sameGuide.length ? { lat: sameGuide[0].lat, lng: sameGuide[0].lng } : null;
  const d = centre && r.lat != null ? `${km({ lat: r.lat, lng: r.lng }, centre).toFixed(1)} km from the guide's centre` : "guide has no centre";
  console.log(`- ${r.name} · city "${r.city}" (Google: "${r.source_city || "—"}", area "${r.area || "—"}") · @${r.username} · ${r.title === "My places" || r.title === "Saved places" ? "My places" : `guide "${r.title}" (city "${r.gcity}")`} · ${d}`);
}
