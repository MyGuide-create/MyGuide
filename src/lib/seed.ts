import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { follows, guideShares, guides, notifications, places, users } from "./db/schema";
import { hashPassword } from "./auth";
import { MOCK_PLACES } from "./places/mock-data";
import { newId, newToken, slugify } from "./utils";

export const DEMO_PASSWORD = "myguide-demo";

const DEMO_USERS = [
  { username: "yara", displayName: "Yara Haddad", bio: "Beirut → Tokyo → wherever the next cheap flight goes. I only write down places I'd go back to." },
  { username: "marco", displayName: "Marco Bellini", bio: "Lisbon-based, Athens-obsessed. Long lunches, short lists." },
  { username: "aiko", displayName: "Aiko Tanaka", bio: "Early mornings, markets, temples before the crowds. Tokyo local, Istanbul regular." },
  { username: "leila", displayName: "Leila Nasser", bio: "Dubai by birth, Marrakech by heart. Hammams, souks and the good kind of rooftop." },
  { username: "tomas", displayName: "Tomás Reyes", bio: "Chilango. If it's not on this list I probably haven't eaten it yet." },
  { username: "sam", displayName: "Sam Okafor", bio: "London Sundays and New York weekends. Flower markets, pubs without music, long walks." },
];

interface SeedGuide {
  owner: string;
  title: string;
  city: string;
  country: string;
  description: string;
  placeSlugs: string[];
  daysAgo: number;
  visibility?: "public" | "private";
  shareWith?: string[];
}

const DEMO_GUIDES: SeedGuide[] = [
  { owner: "yara", title: "Tokyo, with Yara", city: "Tokyo", country: "Japan", description: "My favorite spots from three trips here, mostly small places my friends actually go back to.", placeSlugs: ["tsuta-ramen", "yanaka-coffee-ten", "ichiran-shinjuku", "golden-gai", "thermae-yu", "fuglen-tokyo", "daikanyama-tsutaya", "shibuya-sky"], daysAgo: 14 },
  { owner: "aiko", title: "Tokyo Mornings", city: "Tokyo", country: "Japan", description: "Everything on this list is better before 9am. Set an alarm, thank me later.", placeSlugs: ["tsukiji-outer-market", "senso-ji", "meiji-jingu", "yoyogi-park", "teamlab-planets", "trunk-hotel"], daysAgo: 3 },
  { owner: "marco", title: "Lisbon for a Long Weekend", city: "Lisbon", country: "Portugal", description: "Three days, one hill at a time. Comfortable shoes are not optional.", placeSlugs: ["pasteis-de-belem", "jeronimos-monastery", "miradouro-santa-luzia", "tasca-do-chico", "time-out-market", "lx-factory", "jardim-da-estrela", "memmo-alfama", "museu-nacional-do-azulejo"], daysAgo: 21 },
  { owner: "marco", title: "Athens, Properly", city: "Athens", country: "Greece", description: "Not just the Acropolis. The bits between the ruins are the point.", placeSlugs: ["acropolis", "philopappou-hill", "to-kafeneio-plaka", "six-dogs", "varvakios-market", "benaki-museum", "monastiraki-square", "the-foundry-suites"], daysAgo: 6 },
  { owner: "leila", title: "Dubai Beyond the Malls", city: "Dubai", country: "United Arab Emirates", description: "The Dubai I show friends who think it's all glass towers. Some glass towers included.", placeSlugs: ["al-fahidi", "ravi-restaurant", "alserkal-avenue", "jumeirah-mosque", "gold-souk", "kite-beach", "xva-art-hotel", "burj-khalifa"], daysAgo: 9 },
  { owner: "leila", title: "Marrakech Medina Days", city: "Marrakech", country: "Morocco", description: "Get lost, get scrubbed, eat on a roof. Repeat for four days.", placeSlugs: ["jemaa-el-fnaa", "jardin-majorelle", "nomad", "les-bains-de-marrakech", "souk-semmarine", "riad-yasmine", "koutoubia-mosque"], daysAgo: 30 },
  { owner: "tomas", title: "Mexico City, Eat Everything", city: "Mexico City", country: "Mexico", description: "A greedy person's guide to CDMX. Bring stretchy trousers and cash for the taco stands.", placeSlugs: ["contramar", "el-vilsito", "panaderia-rosetta", "licoreria-limantour", "mercado-de-coyoacan", "museo-frida-kahlo", "chapultepec-park", "casa-luis-barragan", "condesa-df"], daysAgo: 1 },
  { owner: "sam", title: "London Sundays", city: "London", country: "United Kingdom", description: "The perfect Sunday, as tested over roughly two hundred Sundays.", placeSlugs: ["columbia-road-flower-market", "borough-market", "hampstead-heath", "tate-modern", "the-french-house", "dishoom-shoreditch", "primrose-hill", "the-hoxton-shoreditch"], daysAgo: 12 },
  { owner: "sam", title: "New York in 48 Hours", city: "New York", country: "United States", description: "Two days, mostly downtown, one museum, one perfect bagel.", placeSlugs: ["russ-and-daughters", "the-high-line", "chelsea-market", "the-met", "brooklyn-bridge-park", "attaboy", "ace-hotel-brooklyn"], daysAgo: 40 },
  { owner: "aiko", title: "Istanbul, Asian Side", city: "Istanbul", country: "Türkiye", description: "Take the ferry to Kadıköy and stay there. The old city can wait until day three.", placeSlugs: ["ciya-sofrasi", "kadikoy-market", "arkaoda", "cagaloglu-hamami", "hagia-sophia", "galata-tower"], daysAgo: 18 },
  { owner: "yara", title: "Paris Canal Days", city: "Paris", country: "France", description: "The 10th arrondissement and a few reasons to leave it.", placeSlugs: ["du-pain-et-des-idees", "canal-saint-martin", "le-comptoir-general", "musee-de-l-orangerie", "sacre-coeur", "marche-des-enfants-rouges", "hotel-des-grands-boulevards"], daysAgo: 55 },
  { owner: "yara", title: "Dubai Wedding Weekend", city: "Dubai", country: "United Arab Emirates", description: "For everyone flying in for Nour's wedding. Private, just for us.", placeSlugs: ["xva-art-hotel", "al-fahidi", "ravi-restaurant", "kite-beach", "talise-spa", "zero-gravity"], daysAgo: 2, visibility: "private", shareWith: ["marco", "leila"] },
];

const FOLLOWS: Array<[string, string]> = [
  ["yara", "aiko"], ["yara", "marco"], ["yara", "tomas"],
  ["marco", "yara"], ["marco", "leila"],
  ["aiko", "yara"], ["aiko", "sam"],
  ["leila", "yara"], ["leila", "marco"], ["leila", "sam"],
  ["tomas", "yara"], ["tomas", "marco"],
  ["sam", "yara"], ["sam", "tomas"], ["sam", "aiko"],
];

function shouldSeed(): boolean {
  const flag = process.env.SEED_DEMO?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  return process.env.NODE_ENV !== "production";
}

/** Populate an empty database with demo creators and guides. */
export async function maybeSeed(db: Db): Promise<void> {
  if (!shouldSeed()) return;
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (Number(row?.n ?? 0) > 0) return;
  await seedDemo(db);
}

export async function seedDemo(db: Db): Promise<void> {
  console.log("[seed] Populating demo users and guides…");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const day = 86_400_000;
  const now = Date.now();

  const userIds = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const id = newId();
    userIds.set(u.username, id);
    await db.insert(users).values({
      id,
      email: `${u.username}@myguide.demo`,
      passwordHash,
      username: u.username,
      displayName: u.displayName,
      bio: u.bio,
      createdAt: new Date(now - 120 * day),
    });
  }

  const guideIds = new Map<string, string>();
  for (const g of DEMO_GUIDES) {
    const ownerId = userIds.get(g.owner)!;
    const id = newId();
    guideIds.set(g.title, id);
    const created = new Date(now - (g.daysAgo + 2) * day);
    const published = new Date(now - g.daysAgo * day);
    await db.insert(guides).values({
      id,
      ownerId,
      slug: `${slugify(g.title)}-${newId().slice(0, 6)}`,
      title: g.title,
      city: g.city,
      country: g.country,
      description: g.description,
      visibility: g.visibility ?? "public",
      allowFork: true,
      shareToken: newToken(),
      publishedAt: published,
      createdAt: created,
      updatedAt: published,
    });
    let position = 0;
    for (const slug of g.placeSlugs) {
      const p = MOCK_PLACES.find((m) => m.slug === slug);
      if (!p) continue;
      await db.insert(places).values({
        id: newId(),
        guideId: id,
        position: position++,
        name: p.name,
        address: p.address,
        city: p.city,
        country: p.country,
        lat: p.lat,
        lng: p.lng,
        category: p.category,
        hoursJson: JSON.stringify(p.hours),
        googlePlaceId: `mock:${p.slug}`,
        businessStatus: "OPERATIONAL",
        note: p.blurb ?? "",
        noteAuthorId: ownerId,
        createdAt: created,
      });
    }
    for (const username of g.shareWith ?? []) {
      const withId = userIds.get(username)!;
      await db.insert(guideShares).values({ id: newId(), guideId: id, sharedById: ownerId, sharedWithId: withId, createdAt: published });
      await db.insert(notifications).values({ id: newId(), userId: withId, type: "guide_shared", actorId: ownerId, guideId: id, createdAt: published });
    }
  }

  for (const [from, to] of FOLLOWS) {
    await db.insert(follows).values({ followerId: userIds.get(from)!, followingId: userIds.get(to)!, createdAt: new Date(now - 60 * day) });
  }

  // A forked guide so the "based on" attribution shows up in the demo.
  const sourceId = guideIds.get("Tokyo, with Yara")!;
  const sourcePlaces = await db.select().from(places).where(sql`${places.guideId} = ${sourceId}`).orderBy(places.position);
  const forkId = newId();
  const forkDate = new Date(now - 4 * day);
  await db.insert(guides).values({
    id: forkId,
    ownerId: userIds.get("tomas")!,
    slug: `tokyo-with-yara-${newId().slice(0, 6)}`,
    title: "Tokyo, with Yara (my edit)",
    city: "Tokyo",
    country: "Japan",
    description: "Yara's list, minus the onsen, plus the temple I loved. Going back in spring.",
    visibility: "public",
    allowFork: true,
    forkedFromGuideId: sourceId,
    forkedFromUserId: userIds.get("yara")!,
    shareToken: newToken(),
    publishedAt: forkDate,
    createdAt: forkDate,
    updatedAt: forkDate,
  });
  let pos = 0;
  for (const p of sourcePlaces.filter((sp) => sp.name !== "Thermae-Yu")) {
    await db.insert(places).values({ ...p, id: newId(), guideId: forkId, position: pos++, createdAt: forkDate });
  }
  const senso = MOCK_PLACES.find((m) => m.slug === "senso-ji")!;
  await db.insert(places).values({
    id: newId(),
    guideId: forkId,
    position: pos++,
    name: senso.name,
    address: senso.address,
    city: senso.city,
    country: senso.country,
    lat: senso.lat,
    lng: senso.lng,
    category: senso.category,
    hoursJson: JSON.stringify(senso.hours),
    googlePlaceId: `mock:${senso.slug}`,
    businessStatus: "OPERATIONAL",
    note: "Yara skipped this and she's wrong. Go at dawn, the whole street is yours.",
    noteAuthorId: userIds.get("tomas")!,
    createdAt: forkDate,
  });

  console.log(`[seed] Done. Demo accounts: ${DEMO_USERS.map((u) => `${u.username}@myguide.demo`).join(", ")} (password: ${DEMO_PASSWORD})`);
}
