// List everyone who has signed up to the LIVE MyGuide (pilot helper).
// Usage, from the MyGuide folder:  node scripts/list-users.mjs
import fs from "node:fs";
import { createClient } from "@libsql/client/web";
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });
const r = await db.execute("select username, display_name, email, datetime(created_at/1000,'unixepoch') as joined, (select count(*) from guides g where g.owner_id = users.id) as guides from users order by created_at");
console.table(r.rows.map((x) => ({ ...x })));
