import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { PickPlaces, type PickGroup, type PickItem } from "@/components/PickPlaces";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { acceptedFollowingIds, citySpots } from "@/lib/citySpots";
import { getDb } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { canViewGuide, getGuideBySlug, listGuidesByOwner } from "@/lib/guides";
import { CATEGORIES } from "@/lib/places";
import { placeArea } from "@/lib/places/neighbourhood";
import { isReusable } from "@/lib/reuse";

export const dynamic = "force-dynamic";
export const metadata = { title: "Save spots" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");
const firstName = (s: string) => s.split(" ")[0];
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Make your own guide by picking places — from a city's spots (/pick?city=Lisbon[&friend=sara])
 * or from someone's guide (/pick?guide=<slug>, everything ticked: the old "Copy guide").
 */
export default async function PickPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const guideSlug = one(sp.guide);
  const key = one(sp.key) || null;
  const cityParam = one(sp.city).slice(0, 80);
  const friendParam = one(sp.friend).toLowerCase();
  const next = `/pick?${new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][])).toString()}`;
  const user = await requireUser(next);
  const mine = (await listGuidesByOwner(user.id, user.id)).map((g) => ({ id: g.guide.id, title: g.guide.title, city: g.guide.city, placeCount: g.placeCount }));

  let heading = "Save spots";
  let intro = "";
  let city = cityParam;
  let groups: PickGroup[] = [];
  let preselectAll = false;
  let back = "/";
  let blocked: string | null = null;

  if (guideSlug) {
    const guide = await getGuideBySlug(guideSlug);
    if (!guide || !(await canViewGuide(guide, user.id, key))) notFound();
    back = `/g/${guide.slug}${key ? `?key=${key}` : ""}`;
    if (guide.ownerId !== user.id && !isReusable(guide)) blocked = "This guide is private, so its places can't be picked into another guide.";
    const db = await getDb();
    const rows = await db.select().from(places).where(eq(places.guideId, guide.id)).orderBy(asc(places.position), asc(places.createdAt));
    const items: PickItem[] = rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      photoUrl: p.photoUrl,
      photoMediaId: p.photoMediaId,
      area: placeArea(p),
      sub: p.note.trim() ? `“${clip(p.note.trim())}”` : "",
    }));
    groups = [{ label: guide.title, items }];
    heading = `Pick from ${guide.title}`;
    intro = "Everything's ticked. Untick what you don't want, then put the rest in a guide of your own.";
    city = guide.city;
    preselectAll = true;
  } else if (cityParam) {
    back = `/city?${new URLSearchParams({ name: cityParam, ...(friendParam ? { friend: friendParam } : {}) }).toString()}`;
    const following = await acceptedFollowingIds(user.id);
    // Your own spots too (private ones included), so your guide can mix your favourites with your friends'.
    let spots = await citySpots({ city: cityParam, viewerId: user.id, ownerIds: following, withOwn: true });
    const fromFriends = spots.some((s) => s.recommenders.some((r) => r.user.id !== user.id));
    if (!fromFriends) spots = await citySpots({ city: cityParam, viewerId: user.id, withOwn: true });
    const friend = friendParam ? spots.flatMap((s) => s.recommenders).find((r) => r.user.username.toLowerCase() === friendParam)?.user : null;
    if (friend) spots = spots.filter((s) => s.recommenders.some((r) => r.user.id === friend.id));
    const byCat = new Map<string, PickItem[]>();
    for (const s of spots) {
      const lead = (friend && s.recommenders.find((r) => r.user.id === friend.id)) || s.recommenders.find((r) => r.user.id !== user.id) || s.recommenders[0];
      const names = [...s.recommenders].sort((a, b) => Number(b.user.id === user.id) - Number(a.user.id === user.id)).map((r) => (r.user.id === user.id ? "You" : firstName(r.user.displayName)));
      const item: PickItem = {
        id: lead.placeId,
        name: s.place.name,
        category: s.place.category,
        photoUrl: s.place.photoUrl,
        photoMediaId: s.place.photoMediaId,
        area: placeArea(s.place),
        sub: names.length > 2 ? `${names.length} ${fromFriends ? "friends" : "people"} vouch` : names.join(" & "),
      };
      byCat.set(s.place.category, [...(byCat.get(s.place.category) ?? []), item]);
    }
    const order = (c: string) => {
      const i = (CATEGORIES as readonly string[]).indexOf(c);
      return i === -1 ? 99 : i;
    };
    groups = [...byCat.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([label, items]) => ({ label, items }));
    heading = friend ? (friend.id === user.id ? `Pick from your ${cityParam}` : `Pick from ${firstName(friend.displayName)}’s ${cityParam}`) : `Pick ${cityParam} spots`;
    intro = "Tick the spots you want, then make them a guide of your own (or add them to one).";
  }

  return (
    <AppShell nav={false}>
      <TopBar back={back} title="Save spots" avatarUser={toPublicUser(user)} />
      {blocked ? (
        <div className="px-4 pt-6"><EmptyState title="Can't pick from this one" body={blocked} action={<LinkButton href={back} size="sm">Back</LinkButton>} /></div>
      ) : groups.every((g) => g.items.length === 0) ? (
        <div className="px-4 pt-6">
          <EmptyState title="Nothing to pick yet" body={cityParam ? `No spots in ${cityParam} yet.` : "Open a city or a guide and tap Save spots."} action={<LinkButton href={back} size="sm">Back</LinkButton>} />
        </div>
      ) : (
        <PickPlaces title={heading} intro={intro} groups={groups} guides={mine} city={city} preselectAll={preselectAll} />
      )}
    </AppShell>
  );
}
