// Pilot usage summary for the LIVE MyGuide.
// Usage, from the MyGuide folder:  node scripts/stats.mjs            (all time)
//                                  node scripts/stats.mjs 7          (last 7 days)
//                                  node scripts/stats.mjs --local    (local dev database)
// Counts exclude the guide's own creator, so they show use by OTHER people.
import fs from "node:fs";

const args = process.argv.slice(2);
const local = args.includes("--local");
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 0);
const since = days ? Date.now() - days * 86400000 : 0;

let db;
if (local) {
  const { createClient } = await import("@libsql/client");
  db = createClient({ url: "file:data/myguide.db" });
} else {
  const { createClient } = await import("@libsql/client/web");
  const env = Object.fromEntries(
    fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );
  db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });
}

const q = async (sql, a = []) => (await db.execute({ sql, args: a })).rows;
const others = "is_owner = 0 and created_at >= ?";
const count = async (type) => Number((await q(`select count(*) n from events where type = ? and ${others}`, [type, since]))[0].n);
const viewer = "coalesce(user_id, visitor_id)";

const guideViews = await count("guide_view");
const uniqueViewers = Number((await q(`select count(distinct ${viewer}) n from events where type = 'guide_view' and ${others}`, [since]))[0].n);
const placeViews = await count("place_view");
const directions = await count("tap_directions");
const calls = await count("tap_call");
const forks = await count("fork");
const shares = Number((await q(`select count(*) n from events where type = 'share' and created_at >= ?`, [since]))[0].n);
const taps = directions + calls;
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "–");

console.log(`\nMyGuide pilot stats — ${days ? `last ${days} days` : "all time"}${local ? " (LOCAL db)" : ""}`);
console.log("(views and taps by people other than the guide's creator)\n");
console.table({
  "Guide opens": guideViews,
  "Unique people opening guides": uniqueViewers,
  "Place pages opened": placeViews,
  "Taps: directions": directions,
  "Taps: call": calls,
  "Tap-through rate (taps ÷ guide opens)": pct(taps, guideViews),
  "Guides copied ('Use this guide')": forks,
  "Shares (incl. by creators)": shares,
});

const topGuides = await q(
  `select g.title, u.username as creator,
     sum(e.type='guide_view') opens, count(distinct case when e.type='guide_view' then ${viewer.replace(/(\w+_id)/g, "e.$1")} end) people,
     sum(e.type in ('tap_directions','tap_call')) taps, sum(e.type='share') shares
   from events e join guides g on g.id = e.guide_id join users u on u.id = g.owner_id
   where (e.is_owner = 0 or e.type = 'share') and e.created_at >= ?
   group by e.guide_id order by opens desc limit 10`,
  [since]
);
if (topGuides.length) {
  console.log("Top guides");
  console.table(topGuides.map((r) => ({ ...r })));
}

const topPlaces = await q(
  `select p.name, g.title as guide, sum(e.type='place_view') views, sum(e.type in ('tap_directions','tap_call')) taps
   from events e join places p on p.id = e.place_id join guides g on g.id = e.guide_id
   where e.is_owner = 0 and e.created_at >= ? and e.place_id is not null
   group by e.place_id order by taps desc, views desc limit 10`,
  [since]
);
if (topPlaces.length) {
  console.log("Top places");
  console.table(topPlaces.map((r) => ({ ...r })));
}
