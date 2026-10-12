// Put every place in one guide into one category (10 Oct 2026: Sherry's "Hair & lashes" → Beauty).
//
// Usage, from the MyGuide folder:
//   node scripts/set-category.mjs "Hair & lashes" Beauty           ← dry run: shows what would change
//   node scripts/set-category.mjs "Hair & lashes" Beauty --apply   ← writes it
// The guide is matched by its exact title (ignoring case). If more than one guide has that title,
// add the creator's username: node scripts/set-category.mjs "Hair & lashes" Beauty sherry --apply
import fs from "node:fs";
import { createClient } from "@libsql/client/web";

const CATEGORIES = ["Food & Drinks", "Nightlife", "Scenic Spots", "Entertainment", "Sports & Wellness", "Beauty", "Spiritual", "Shopping", "Nature", "Stay"];
const APPLY = process.argv.includes("--apply");
const [title, category, username] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!title || !CATEGORIES.includes(category)) {
  console.log(`Usage: node scripts/set-category.mjs "<guide title>" <category> [username] [--apply]\nCategories: ${CATEGORIES.join(", ")}`);
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

const guides = (
  await db.execute({
    sql: `select g.id, g.title, u.username from guides g join users u on u.id = g.owner_id where lower(trim(g.title)) = lower(trim(?))${username ? " and lower(u.username) = lower(?)" : ""}`,
    args: username ? [title, username] : [title],
  })
).rows;
if (!guides.length) { console.log(`No guide called "${title}"${username ? ` by @${username}` : ""}.`); process.exit(1); }
if (guides.length > 1) {
  console.log(`${guides.length} guides are called "${title}" — add the username to pick one:`);
  for (const g of guides) console.log(`  • @${g.username}`);
  process.exit(1);
}
const g = guides[0];
const places = (await db.execute({ sql: "select id, name, category from places where guide_id = ? order by position", args: [g.id] })).rows;
console.log(`"${g.title}" by @${g.username} — ${places.length} place(s):`);
for (const p of places) console.log(`  • ${p.name}: ${p.category}${p.category === category ? " (already)" : ` → ${category}`}`);
const todo = places.filter((p) => p.category !== category);
if (!APPLY) { console.log(`\nDry run — nothing written. Add --apply to move ${todo.length} place(s) to ${category}.`); process.exit(0); }
for (const p of todo) await db.execute({ sql: "update places set category = ? where id = ?", args: [category, p.id] });
console.log(`\nDone: ${todo.length} place(s) moved to ${category}.`);
