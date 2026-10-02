// Pilot usage summary for the LIVE MyGuide.
// Usage, from the MyGuide folder:
//   node scripts/stats.mjs                  all time
//   node scripts/stats.mjs 7                last 7 days
//   node scripts/stats.mjs venue "Zuma"     one venue (all guides it appears in); add a number for a day window
//   add --local to any of these to read the local dev database instead
// Counts exclude the guide's own creator, so they show use by OTHER people.
import fs from "node:fs";

const args = process.argv.slice(2);
const local = args.includes("--local");
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 0);
const since = days ? Date.now() - days * 86400000 : 0;
const venueIdx = args.indexOf("venue");
const venueQuery = venueIdx >= 0 ? args[venueIdx + 1] : null;

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
const rows = (r) => r.map((x) => ({ ...x }));
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "–");
const period = `${days ? `last ${days} days` : "all time"}${local ? " (LOCAL db)" : ""}`;
const TAPS = [
  ["tap_reserve", "Reserve"],
  ["tap_directions", "Directions"],
  ["tap_call", "Call"],
  ["tap_whatsapp", "WhatsApp"],
  ["tap_instagram", "Instagram"],
  ["tap_website", "Website"],
];
const tapList = TAPS.map(([t]) => `'${t}'`).join(",");
const tapCols = (alias = "") => TAPS.map(([t, label]) => `sum(${alias}type='${t}') as "${label}"`).join(", ");
// The same venue can appear in many guides (separate rows); group by Google place id when we have one.
const venueKey = "coalesce(p.google_place_id, lower(p.name))";

if (venueQuery) {
  const venues = await q(
    `select ${venueKey} as k, min(p.name) as name, min(p.address) as address,
       count(distinct p.guide_id) as guides,
       count(distinct case when g.visibility='public' and g.published_at is not null then p.guide_id end) as public_guides
     from places p join guides g on g.id = p.guide_id
     where p.name like ? group by k order by guides desc limit 10`,
    [`%${venueQuery}%`]
  );
  if (!venues.length) {
    console.log(`No place matching "${venueQuery}".`);
    process.exit(0);
  }
  for (const v of venues) {
    const [s] = await q(
      `select sum(e.type='place_view') as views, sum(e.type in (${tapList})) as taps, ${tapCols("e.")},
         count(distinct case when e.type in (${tapList}) then coalesce(e.user_id, e.visitor_id) end) as people
       from events e join places p on p.id = e.place_id
       where ${venueKey} = ? and e.is_owner = 0 and e.created_at >= ?`,
      [v.k, since]
    );
    console.log(`\n${v.name} — ${period}`);
    if (v.address) console.log(v.address);
    console.log(`In ${v.guides} guide(s) (${v.public_guides} public)\n`);
    const out = { "Place page views": Number(s.views ?? 0), "Taps (all buttons)": Number(s.taps ?? 0), "People who tapped": Number(s.people ?? 0) };
    for (const [, label] of TAPS) out[`  ${label}`] = Number(s[label] ?? 0);
    console.table(out);
  }
  process.exit(0);
}

const others = "is_owner = 0 and created_at >= ?";
const one = async (sql, a) => Number((await q(sql, a))[0].n ?? 0);
const viewer = "coalesce(user_id, visitor_id)";
const guideViews = await one(`select count(*) n from events where type='guide_view' and ${others}`, [since]);
const uniqueViewers = await one(`select count(distinct ${viewer}) n from events where type='guide_view' and ${others}`, [since]);
const placeViews = await one(`select count(*) n from events where type='place_view' and ${others}`, [since]);
const forks = await one(`select count(*) n from events where type='fork' and ${others}`, [since]);
const shares = await one(`select count(*) n from events where type='share' and created_at >= ?`, [since]);
const [byTap] = await q(`select count(*) as total, ${tapCols()} from events where type in (${tapList}) and ${others}`, [since]);
const taps = Number(byTap.total ?? 0);
const tappers = await one(`select count(distinct ${viewer}) n from events where type in (${tapList}) and ${others}`, [since]);

console.log(`\nMyGuide pilot stats — ${period}`);
console.log("(views and taps by people other than the guide's creator)\n");
const summary = {
  "Guide opens": guideViews,
  "Unique people opening guides": uniqueViewers,
  "Place pages opened": placeViews,
  "Taps (all buttons)": taps,
};
for (const [, label] of TAPS) summary[`  ${label}`] = Number(byTap[label] ?? 0);
Object.assign(summary, {
  "Tap-through rate (people who tapped ÷ people who opened)": pct(tappers, uniqueViewers),
  "Guides copied ('Use this guide')": forks,
  "Shares (incl. by creators)": shares,
});
console.table(summary);

const topGuides = await q(
  `select g.title, u.username as creator,
     sum(e.type='guide_view') opens,
     count(distinct case when e.type='guide_view' then coalesce(e.user_id, e.visitor_id) end) people,
     sum(e.type in (${tapList})) taps, sum(e.type='share') shares
   from events e join guides g on g.id = e.guide_id join users u on u.id = g.owner_id
   where (e.is_owner = 0 or e.type = 'share') and e.created_at >= ?
   group by e.guide_id order by opens desc limit 10`,
  [since]
);
if (topGuides.length) {
  console.log("Top guides");
  console.table(rows(topGuides));
}

const topVenues = await q(
  `select min(p.name) as venue, count(distinct p.guide_id) as guides,
     sum(e.type='place_view') views, sum(e.type in (${tapList})) taps, sum(e.type='tap_reserve') reserve
   from events e join places p on p.id = e.place_id
   where e.is_owner = 0 and e.created_at >= ?
   group by ${venueKey} order by taps desc, views desc limit 10`,
  [since]
);
if (topVenues.length) {
  console.log("Top venues (across all guides)");
  console.table(rows(topVenues));
}
