// One-off: tidy websites already saved on places.
//  - Instagram pages listed as "website" move to the Instagram button (unless one is already set)
//  - tracking junk (utm_*, gclid, fbclid, igsh…) is removed from website links
// Usage, from the MyGuide folder:  node scripts/clean-websites.mjs   (add --dry to preview only)
// Mirrors splitGoogleWebsite() in src/lib/placeLinks.ts.
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const dry = process.argv.includes("--dry");
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

const TRACKING_PARAM = /^(utm_.*|gclid|gbraid|wbraid|fbclid|igsh|igshid|mc_cid|mc_eid|_ga|_gl|y_source)$/i;
const strip = (url) => {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  return u.toString().replace(/\?$/, "");
};
const igHandle = (u) => {
  const h = (u.pathname.split("/").filter(Boolean)[0] ?? "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) && !["p", "reel", "explore", "stories"].includes(h) ? h : null;
};

const { rows } = await db.execute("select id, name, website, instagram from places where website is not null");
let moved = 0, tidied = 0;
for (const p of rows) {
  let u;
  try { u = new URL(p.website); } catch { continue; }
  if (/(^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname)) {
    const handle = igHandle(u);
    const instagram = p.instagram ?? handle;
    console.log(`  ↪ ${p.name}: website → Instagram @${instagram ?? "?"}`);
    if (!dry) await db.execute({ sql: "update places set website = null, instagram = ? where id = ?", args: [instagram, p.id] });
    moved++;
    continue;
  }
  const clean = strip(p.website);
  if (clean !== p.website) {
    console.log(`  ✂ ${p.name}: ${clean}`);
    if (!dry) await db.execute({ sql: "update places set website = ? where id = ?", args: [clean, p.id] });
    tidied++;
  }
}
console.log(`\n${dry ? "[dry run] would have " : ""}moved ${moved} Instagram link(s), tidied ${tidied} website(s) (of ${rows.length} checked).`);
