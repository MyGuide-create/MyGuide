// Read-only: how many copied/forked guides and copied places real people have (demo and @claude accounts left out).
// Usage, from the MyGuide folder:  node scripts/count-copies.mjs
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });
const real = `u.email not like '%@myguide.demo' and u.username != 'claude'`;

const forks = (await db.execute(`
  select u.username, g.title, g.visibility, (select count(*) from places p where p.guide_id = g.id) places,
         (select ou.username from users ou where ou.id = g.forked_from_user_id) from_user
  from guides g join users u on u.id = g.owner_id
  where g.forked_from_guide_id is not null and ${real} order by g.created_at`)).rows;
console.log(`\nCopied guides (Copy guide): ${forks.length}`);
for (const r of forks) console.log(`  @${r.username}: "${r.title}" (${r.visibility}, ${r.places} places) from @${r.from_user ?? "?"}`);

const copied = (await db.execute(`
  select u.username, g.title, count(*) n
  from places p join guides g on g.id = p.guide_id join users u on u.id = g.owner_id
  where p.source_place_id is not null and g.forked_from_guide_id is null and ${real}
  group by u.username, g.title order by n desc`)).rows;
const total = copied.reduce((s, r) => s + Number(r.n), 0);
console.log(`\nPlaces added from someone else's guide (Add to my guide / trips), outside copied guides: ${total}`);
for (const r of copied) console.log(`  @${r.username}: ${r.n} in "${r.title}"`);
console.log("");
