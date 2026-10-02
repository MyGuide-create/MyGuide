// One-off: fill in venue websites (from Google Places) for places added before websites were saved.
// Usage, from the MyGuide folder:  node scripts/backfill-websites.mjs
// Safe to run more than once — only touches places that still have no website.
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const key = env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("GOOGLE_MAPS_API_KEY missing from .env.vercel");
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

const { rows } = await db.execute(
  "select id, name, google_place_id from places where website is null and google_place_id is not null and google_place_id not like 'mock:%'"
);
console.log(`${rows.length} place(s) to check…`);
let updated = 0, none = 0, errors = 0;
for (const p of rows) {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(p.google_place_id)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "websiteUri" },
    });
    if (!res.ok) {
      errors++;
      if (errors === 1) console.log(`Google said ${res.status}: ${(await res.text()).slice(0, 300)}`);
      continue;
    }
    const { websiteUri } = await res.json();
    if (websiteUri) {
      await db.execute({ sql: "update places set website = ? where id = ?", args: [websiteUri, p.id] });
      updated++;
      console.log(`  ✓ ${p.name} → ${websiteUri}`);
    } else none++;
  } catch (e) {
    errors++;
    if (errors === 1) console.log(String(e));
  }
  await new Promise((r) => setTimeout(r, 120));
}
console.log(`\nDone: ${updated} updated, ${none} with no website on Google, ${errors} errors.`);
