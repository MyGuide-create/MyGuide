// Re-check every place's category against Google with the new rules (10 Oct 2026):
//   • new "Beauty" category for hair, nail and beauty salons, barbers, lashes/brows, skin clinics
//   • many more Google types recognised ("thai_restaurant", "florist", "supermarket"…), so fewer
//     shops and salons fall through to "Scenic Spots"
//
// A place is only changed when its current category is still what the app chose automatically
// (the old rules give the same answer). If a creator picked a category by hand, it's left alone —
// EXCEPT when the new answer is Beauty: Beauty didn't exist before, so a creator with salons had no
// right choice and may have picked the nearest one (e.g. Sports & Wellness). Those move to Beauty.
// Dropped pins (no Google listing) are left alone too.
//
// Usage, from the MyGuide folder, AFTER deploying (so new places already use the new rules):
//   node scripts/recategorize-places.mjs           ← dry run: shows what would change, writes nothing
//   node scripts/recategorize-places.mjs --apply   ← writes the changes
//   node scripts/recategorize-places.mjs --guide "Hair"   ← explains every place in one guide, writes nothing
// Cost: one Google Place Details lookup (type fields only) per place. Safe to re-run.
import fs from "node:fs";
import { createClient } from "@libsql/client/web";
import { categoryFromGoogle } from "../src/lib/places/categoryRules.mjs";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
);
const key = env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("GOOGLE_MAPS_API_KEY missing from .env.vercel");
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });

/* ---- the OLD rules (as of 9 Oct 2026), frozen — used only to tell automatic categories from hand-picked ones ---- */
const OLD_MAP = {
  bar: "Nightlife", night_club: "Nightlife", pub: "Nightlife", wine_bar: "Nightlife", karaoke: "Nightlife", cocktail_bar: "Nightlife",
  restaurant: "Food & Drinks", cafe: "Food & Drinks", coffee_shop: "Food & Drinks", bakery: "Food & Drinks", meal_takeaway: "Food & Drinks",
  meal_delivery: "Food & Drinks", ice_cream_shop: "Food & Drinks", food: "Food & Drinks", tea_house: "Food & Drinks", dessert_shop: "Food & Drinks", food_court: "Food & Drinks",
  tourist_attraction: "Scenic Spots", historical_landmark: "Scenic Spots", monument: "Scenic Spots", observation_deck: "Scenic Spots", plaza: "Scenic Spots",
  bridge: "Scenic Spots", tower: "Scenic Spots", cultural_landmark: "Scenic Spots", historical_place: "Scenic Spots",
  museum: "Entertainment", art_gallery: "Entertainment", movie_theater: "Entertainment", amusement_park: "Entertainment", aquarium: "Entertainment", zoo: "Entertainment",
  performing_arts_theater: "Entertainment", concert_hall: "Entertainment", casino: "Entertainment", bowling_alley: "Entertainment", opera_house: "Entertainment", comedy_club: "Entertainment",
  gym: "Sports & Wellness", fitness_center: "Sports & Wellness", spa: "Sports & Wellness", yoga_studio: "Sports & Wellness", sports_complex: "Sports & Wellness",
  swimming_pool: "Sports & Wellness", sauna: "Sports & Wellness", stadium: "Sports & Wellness", sports_club: "Sports & Wellness", golf_course: "Sports & Wellness",
  ski_resort: "Sports & Wellness", public_bath: "Sports & Wellness", massage: "Sports & Wellness", wellness_center: "Sports & Wellness",
  church: "Spiritual", mosque: "Spiritual", hindu_temple: "Spiritual", synagogue: "Spiritual", place_of_worship: "Spiritual", buddhist_temple: "Spiritual", shinto_shrine: "Spiritual",
  shopping_mall: "Shopping", store: "Shopping", clothing_store: "Shopping", market: "Shopping", book_store: "Shopping", department_store: "Shopping",
  jewelry_store: "Shopping", gift_shop: "Shopping", grocery_store: "Shopping", home_goods_store: "Shopping", shoe_store: "Shopping",
  park: "Nature", national_park: "Nature", beach: "Nature", garden: "Nature", hiking_area: "Nature", botanical_garden: "Nature", campground: "Nature",
  lake: "Nature", forest: "Nature", waterfall: "Nature", marina: "Nature", state_park: "Nature",
  hotel: "Stay", lodging: "Stay", hostel: "Stay", resort_hotel: "Stay", bed_and_breakfast: "Stay", guest_house: "Stay", motel: "Stay", extended_stay_hotel: "Stay", inn: "Stay",
};
function oldFromName(name) {
  const n = `${name.toLowerCase()} ${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}`;
  const rules = [
    [/\b(club|lounge|bar|pub|taproom|speakeasy|karaoke|disco|izakaya|cocktail)\b/, "Nightlife"],
    [/\b(ramen|sushi|cafe|café|coffee|kissaten|bistro|taverna|trattoria|osteria|restaurant|kitchen|bakery|boulangerie|pizzeria|taco|taquer[ií]a|grill|diner|noodle|udon|soba|tempura|yakitori|gelato|pastel|pastéis|patisserie|deli|brasserie|cantina|mezcaler[ií]a|churrascaria|dumpling|curry|bbq|steak|eatery|ten|tei)\b/, "Food & Drinks"],
    [/\b(temple|shrine|mosque|church|cathedral|basilica|monastery|synagogue|chapel|wat|pagoda|gurdwara)\b/, "Spiritual"],
    [/\b(park|garden|gardens|beach|forest|lake|falls|waterfall|trail|island|mountain|hill|bay|cove|reserve)\b/, "Nature"],
    [/\b(hotel|hostel|ryokan|riad|inn|resort|lodge|guesthouse|b&b|apartments|villa)\b/, "Stay"],
    [/\b(gym|spa|onsen|sento|hammam|yoga|pool|baths|climbing|surf|pilates|wellness|lagree|barre|crossfit|fitness|padel|boxing|reformer|bootcamp|tennis)\b/, "Sports & Wellness"],
    [/\b(museum|gallery|theatre|theater|cinema|aquarium|zoo|arena|opera|hall|studio)\b/, "Entertainment"],
    [/\b(market|mall|souk|souq|bazaar|store|shop|boutique|bookshop|books|records|depachika)\b/, "Shopping"],
    [/\b(tower|bridge|square|plaza|castle|palace|viewpoint|lookout|acropolis|crossing|monument|fort|citadel|arch|gate)\b/, "Scenic Spots"],
  ];
  for (const [re, cat] of rules) if (re.test(n)) return cat;
  return null;
}
function oldCategory(primaryType, types, name) {
  if (primaryType && OLD_MAP[primaryType]) return OLD_MAP[primaryType];
  for (const t of types ?? []) if (OLD_MAP[t]) return OLD_MAP[t];
  return (name && oldFromName(name)) || "Scenic Spots";
}

async function googleTypes(id) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,primaryType,types" },
  });
  if (!res.ok) {
    // Say why once (a key restriction or quota shows up here), so a silent "nothing to change" can't hide it.
    if (!googleTypes.warned) { googleTypes.warned = true; console.log(`Google said ${res.status}: ${(await res.text()).slice(0, 300)}`); }
    return null;
  }
  return res.json();
}

// --guide "Hair": explain every place in the matching guide(s) — what Google says, what the old and new rules give,
// and what the script would do — then stop. For when a guide doesn't change and we need to see why.
const gi = process.argv.indexOf("--guide");
if (gi > -1) {
  const q = process.argv[gi + 1] ?? "";
  const list = (
    await db.execute({
      sql: "select p.name, p.category, p.google_place_id, g.title as guide, u.username from places p join guides g on g.id = p.guide_id join users u on u.id = g.owner_id where lower(g.title) like lower(?) order by g.title, p.position",
      args: [`%${q}%`],
    })
  ).rows;
  if (!list.length) console.log(`No guide with "${q}" in its title.`);
  let last = "";
  for (const p of list) {
    if (p.guide !== last) { console.log(`\n"${p.guide}" by @${p.username}`); last = p.guide; }
    if (!p.google_place_id) { console.log(`  • ${p.name}: ${p.category} — no Google listing saved, so the script skips it`); continue; }
    const g = await googleTypes(p.google_place_id);
    if (!g) { console.log(`  • ${p.name}: ${p.category} — Google lookup failed for ${p.google_place_id}`); continue; }
    const name = g.displayName?.text || p.name;
    const before = oldCategory(g.primaryType, g.types, name);
    const after = categoryFromGoogle(g.primaryType, g.types, name);
    const action = after === p.category ? "no change needed" : p.category !== before && after !== "Beauty" ? "left alone (picked by hand)" : `→ ${after}`;
    console.log(`  • ${p.name}: now ${p.category} | Google: ${g.primaryType || "-"} [${(g.types ?? []).join(", ")}] | old rules ${before}, new rules ${after} | ${action}`);
  }
  process.exit(0);
}

const rows = (
  await db.execute(
    "select p.id, p.name, p.category, p.google_place_id, g.title as guide, u.username from places p join guides g on g.id = p.guide_id join users u on u.id = g.owner_id where p.google_place_id is not null and p.google_place_id != ''"
  )
).rows;
console.log(`Checking ${rows.length} places with a Google listing…`);

const changes = [];
const keptByHand = [];
let handPicked = 0;
let notFound = 0;
let i = 0;
async function worker() {
  while (i < rows.length) {
    const p = rows[i++];
    const g = await googleTypes(p.google_place_id);
    if (!g) { notFound++; continue; }
    // The app stores the name as the creator saw it; Google's own name is what the rules saw at the time.
    const name = g.displayName?.text || p.name;
    const before = oldCategory(g.primaryType, g.types, name);
    const after = categoryFromGoogle(g.primaryType, g.types, name);
    if (p.category !== before && after !== "Beauty") {
      if (p.category !== after) { handPicked++; keptByHand.push({ ...p, after }); }
      continue;
    }
    if (after !== p.category) changes.push({ ...p, after, googleType: g.primaryType || (g.types ?? [])[0] || "?" });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const byGuide = new Map();
for (const c of changes) {
  const k = `"${c.guide}" by @${c.username}`;
  byGuide.set(k, [...(byGuide.get(k) ?? []), c]);
}
for (const [guide, list] of byGuide) {
  console.log(`\n${guide}`);
  for (const c of list) console.log(`  • ${c.name}: ${c.category} → ${c.after}   (Google: ${c.googleType})`);
}
if (keptByHand.length) {
  console.log("\nLeft alone (category picked by hand):");
  for (const c of keptByHand) console.log(`  • ${c.name} in "${c.guide}": stays ${c.category} (new rules would say ${c.after})`);
}
console.log(`\n${changes.length} place(s) to re-categorise. Left alone: ${handPicked} picked by hand, ${notFound} not found on Google.`);

if (!APPLY) {
  console.log("Dry run — nothing written. Add --apply to save these changes.");
  process.exit(0);
}
for (const c of changes) await db.execute({ sql: "update places set category = ? where id = ?", args: [c.after, c.id] });
console.log(`Done: ${changes.length} place(s) updated.`);
