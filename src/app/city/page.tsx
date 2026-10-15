import { sharedLabel } from "@/lib/fresh";
import { suggestPeople } from "@/lib/suggest";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCover } from "@/components/GuideCover";
import { BookmarkIcon, ChevronDown, LockIcon, MapIcon, PlusIcon, SparkleIcon } from "@/components/Icons";
import { findCity, metroOfDistrict } from "@/lib/places/cities";
import { placeArea } from "@/lib/places/neighbourhood";
import { redirect } from "next/navigation";
import { AskForGuideButton } from "@/components/AskForGuide";
import { SendSpotsButton } from "@/components/SendSpotsButton";
import { FollowPill } from "@/components/FollowPill";
import { capRuns } from "@/lib/fill";
import { GuideMap } from "@/components/GuideMap";
import { PlaceTile } from "@/components/PlaceTile";
import { Avatar, EmptyState, LinkButton, cx } from "@/components/ui";
import { getCurrentUser, toPublicUser, type PublicUser } from "@/lib/auth";
import { listFeed, listGuidesByOwner, type GuideCard } from "@/lib/guides";
import { cityKey, guideSaveCounts, wantedGuides } from "@/lib/homeV2";
import { acceptedFollowingIds, citySpots, type CitySpot } from "@/lib/citySpots";
import { CATEGORIES } from "@/lib/places";
import { orderedCategories } from "@/lib/places/order";
import { timeAgo } from "@/lib/utils";
import { getDb } from "@/lib/db";
import { placeReactions, savedPlaces } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { SaveButton } from "@/components/SaveButton";
import { BeenHere } from "@/components/BeenHere";

export const dynamic = "force-dynamic";


type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }) {
  const name = one((await searchParams).name);
  return { title: name ? `${name} guides` : "City" };
}

const first = (u: PublicUser) => u.displayName.split(" ")[0] || u.username;
/** "You" for the viewer, else their first name. */
const nm = (u: PublicUser, viewerId?: string | null) => (viewerId && u.id === viewerId ? "You" : first(u));

/**
 * "Going somewhere?" lands here. Places first: pick whose taste you want (friend row), see their
 * guides, then every spot they recommend, merged so a spot several friends love shows once with all
 * of them. No friends there yet → the most recommended spots on MyGuide. Every guide for the city
 * stays below with its sort.
 */
export default async function CityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const city = one(sp.name).slice(0, 80);
  // A district (Üsküdar, Etterbeek, Shibuya City) opens its main city: spots are grouped there.
  const metro = metroOfDistrict(city);
  if (metro) {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && !["name", "country", "lat", "lng"].includes(e[0])));
    q.set("name", metro);
    redirect(`/city?${q.toString()}`);
  }
  const country = one(sp.country).slice(0, 80);
  const lat = one(sp.lat);
  const lng = one(sp.lng);
  const sort = one(sp.sort) === "new" ? "new" : "saved";
  const friendParam = one(sp.friend).toLowerCase();
  const catParam = one(sp.cat);
  // "Want to go" chip (14 Oct 2026): only the spots you bookmarked here.
  const wantParam = one(sp.list) === "want";
  // Every spot is listed now; old ?all=1 / ?more=1 links still open the page and are ignored.
  const mapView = one(sp.view) === "map";

  const [mine, everyone, wanted] = city
    ? await Promise.all([
        user ? listFeed({ viewerId: user.id, scope: "following", city }) : Promise.resolve([] as GuideCard[]),
        listFeed({ viewerId: user?.id, scope: "public", city, limit: 100 }),
        wantedGuides(user?.id, 50),
      ])
    : [[], [], { help: null, list: [] }];
  const saves = await guideSaveCounts(everyone.map((g) => g.guide.id));
  const all = [...everyone].sort((a, b) =>
    sort === "new"
      ? b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime()
      : (saves.get(b.guide.id) ?? 0) - (saves.get(a.guide.id) ?? 0) || b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime(),
  );

  // Spots: yours (all of them, private ones too — only you see those) and your friends'. Nobody
  // you follow has any here → everyone's, so the page is never empty.
  const viewerId = user?.id ?? null;
  const followingIds = city && user ? await acceptedFollowingIds(user.id) : [];
  const friendSpots = city ? await citySpots({ city, viewerId, ownerIds: followingIds, withOwn: !!user }) : [];
  const fromFriends = friendSpots.some((s) => s.recommenders.some((r) => r.user.id !== viewerId));
  const spots = fromFriends ? friendSpots : city ? await citySpots({ city, viewerId, withOwn: !!user }) : [];

  // Your own guides for this city, drafts and private ones included.
  const ownGuides = user && city ? (await listGuidesByOwner(user.id, user.id)).filter((g) => cityKey(g.guide.city) === cityKey(city)) : [];
  const me = user ? toPublicUser(user) : null;
  const ownSpots = viewerId ? spots.filter((s) => s.recommenders.some((r) => r.user.id === viewerId)).length : 0;

  // Your Want to go list here: any spot (friends' or anyone's) with a place you bookmarked.
  const wantIds = user && city ? new Set((await (await getDb()).select({ id: savedPlaces.placeId }).from(savedPlaces).where(eq(savedPlaces.userId, user.id))).map((r) => r.id)) : new Set<string>();
  const wantSpots: CitySpot[] = [];
  if (wantIds.size) {
    const seen = new Set<string>();
    for (const s of [...spots, ...(fromFriends ? await citySpots({ city, viewerId }) : [])]) {
      if (seen.has(s.key) || !s.recommenders.some((r) => wantIds.has(r.placeId))) continue;
      seen.add(s.key);
      wantSpots.push(s);
    }
  }
  const wantActive = wantParam && wantSpots.length > 0;
  // Places you've marked "Been here" (for the ✓ on each row).
  const beenIds = user && city ? new Set((await (await getDb()).select({ id: placeReactions.placeId }).from(placeReactions).where(and(eq(placeReactions.userId, user.id), eq(placeReactions.kind, "been")))).map((r) => r.id)) : new Set<string>();
  const marks = { want: wantIds, been: beenIds };
  // Few friends' spots here: people who know this city, to follow (15 Oct 2026).
  const friendSpotCount = fromFriends ? friendSpots.filter((s) => s.recommenders.some((r) => r.user.id !== viewerId)).length : 0;
  const knowers = user && city && friendSpotCount < 5 ? await suggestPeople(user.id, { city, limit: 8 }) : [];

  // The friend row: everyone you follow with spots or guides here, most spots first (you get your own chip).
  const people = new Map<string, { user: PublicUser; spots: number; guides: number }>();
  const person = (u: PublicUser) => people.get(u.id) ?? people.set(u.id, { user: u, spots: 0, guides: 0 }).get(u.id)!;
  if (fromFriends) for (const s of friendSpots) for (const r of s.recommenders) if (r.user.id !== viewerId) person(r.user).spots++;
  for (const g of mine) if (g.owner.id !== viewerId) person(g.owner).guides++;
  const friends = [...people.values()].sort((a, b) => b.spots - a.spots || b.guides - a.guides || first(a.user).localeCompare(first(b.user)));
  const friendCount = friends.length;
  const isMe = !!me && friendParam === me.username.toLowerCase();
  const picked = wantActive ? null : isMe ? me : (friends.find((f) => f.user.username.toLowerCase() === friendParam)?.user ?? null);
  const showYou = !!me && (ownSpots > 0 || ownGuides.length > 0);

  const bySomeone = wantActive ? wantSpots : picked ? spots.filter((s) => s.recommenders.some((r) => r.user.id === picked.id)) : spots;
  const cats = CATEGORIES.filter((c) => bySomeone.some((s) => s.place.category === c));
  const cat = cats.find((c) => c === catParam) ?? null;
  const shownSpots = cat ? bySomeone.filter((s) => s.place.category === cat) : bySomeone;
  // After friends' spots: everyone else's on MyGuide ("More from MyGuide"), most recommended first,
  // never more than 2 in a row led by the same person. Not when a friend (or you) is picked.
  const following = new Set(followingIds);
  const friendKeys = new Set(spots.map((s) => s.key));
  const moreAll =
    city && fromFriends && !picked && !wantActive
      ? (await citySpots({ city, viewerId })).filter((s) => !friendKeys.has(s.key) && s.recommenders.some((r) => r.user.id !== viewerId) && (!cat || s.place.category === cat))
      : [];
  const capLead = (list: CitySpot[]) => capRuns(list, (s) => leadFor(s, null, viewerId).user.id);
  // No category chip → both lists are grouped by category (same fixed order as guide pages), every
  // spot shown, most recommended then most recent within each group. A chip → one flat list.
  const spotGroups = groupSpots(shownSpots, !cat);
  const moreGroups = groupSpots(moreAll, !cat).map((g) => ({ ...g, spots: capLead(g.spots) }));
  // Headings only when the page has more than one category (like a guide with one category).
  const headings = !cat && new Set([...shownSpots, ...moreAll].map((s) => s.place.category)).size > 1;
  const canFollow = (s: CitySpot) => {
    const lead = leadFor(s, picked, viewerId).user.id;
    return lead !== viewerId && !following.has(lead);
  };
  const friendGuides = isMe ? ownGuides : picked ? mine.filter((g) => g.owner.id === picked.id) : mine.filter((g) => g.owner.id !== viewerId);

  const centre = findCity(city);
  const wish = [wanted.help, ...wanted.list].find((w) => w && cityKey(w.group.city) === cityKey(city)) ?? null;

  const base = { name: city, ...(country ? { country } : {}), ...(lat && lng ? { lat, lng } : {}) };
  const state = { friend: picked?.username ?? "", list: wantActive ? "want" : "", cat: cat ?? "", sort: sort === "new" ? "new" : "", view: mapView ? "map" : "" };
  const cityHref = (over: Partial<typeof state>) => {
    const q = { ...base } as Record<string, string>;
    for (const [k, v] of Object.entries({ ...state, ...over })) if (v) q[k] = v;
    return `/city?${new URLSearchParams(q).toString()}`;
  };
  const sortHref = (s: "saved" | "new") => cityHref({ sort: s === "new" ? "new" : "" });
  const pickHref = `/pick?${new URLSearchParams({ city, ...(picked ? { friend: picked.username } : {}) }).toString()}`;
  // Places first: "Add your spots" opens Add a place (it lands in My places, recommended or not).
  const addSpotsHref = user ? "/record" : "/signup?next=/record&why=record";
  const hasAny = all.length > 0 || spots.length > 0;
  const wishFirst = wish?.others[0]?.wish.id;
  const wishNames = wish ? wish.others.map((p) => p.user.displayName.split(" ")[0]) : [];
  const wishWho = wishNames.length === 1 ? wishNames[0] : "them";
  const tripHref = user ? `/trips?city=${encodeURIComponent(city)}` : `/signup?next=${encodeURIComponent(`/trips?city=${city}`)}`;
  const signupAsk = `/signup?next=${encodeURIComponent(`/city?${new URLSearchParams(base).toString()}`)}`;
  const askCity = { city, country, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null };

  return (
    <AppShell>
      <TopBar back="/" title={null} avatarUser={user ? toPublicUser(user) : null} />
      <header className="px-5 pt-2 pb-4">
        <h1 className="font-display text-[38px] leading-[1.02]">{city || "Pick a city"}</h1>
        {city && (
          <p className="mt-1 text-[14px] text-ink-muted">
            {[
              country,
              spots.length ? `${spots.length} spot${spots.length === 1 ? "" : "s"}` : "",
              all.length ? `${all.length} guide${all.length === 1 ? "" : "s"}` : "",
              friendCount ? `${friendCount} friend${friendCount === 1 ? "" : "s"}` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        )}
        {city && (
          <div className="mt-4 flex gap-2.5">
            <LinkButton href={addSpotsHref} className="flex-1">
              <PlusIcon size={15} /> Add your spots
            </LinkButton>
            <LinkButton href={tripHref} variant="outline" className="flex-1">Plan a trip</LinkButton>
          </div>
        )}
      </header>

      <main className="pb-8 flex flex-col">
        {city && !hasAny && wish && wishFirst && (
          <div className="px-4 pb-4">
            <div className="rounded-[20px] bg-ink text-cream p-4 flex flex-col gap-3">
              <p className="font-display text-[21px] leading-snug">
                {wish.others.length} {wish.others.length === 1 ? "person wants" : "people want"} {city} spots. Been? Be the first to send {wishWho} yours.
              </p>
              <LinkButton href={user ? `/record?wish=${wishFirst}` : signupAsk} className="self-start">Add {city} spots</LinkButton>
            </div>
          </div>
        )}
        {city && !hasAny && (
          <div className="px-4">
            <EmptyState
              title={`No ${city} spots yet`}
              body="Know someone who's been? Ask them for their spots. Or add your own when you get there."
              action={
                <span className="flex flex-col items-center gap-3">
                  {user ? (
                    <AskForGuideButton city={askCity} label={`Ask friends for ${city} spots`} variant="primary" size="md" />
                  ) : (
                    <LinkButton href={signupAsk}>Sign up to ask friends for {city} spots</LinkButton>
                  )}
                  <Link href={addSpotsHref} className="text-[13px] font-medium text-terracotta-deep">Been? Add a place</Link>
                </span>
              }
            />
          </div>
        )}

        {(friends.length > 0 || showYou || wantSpots.length > 0) && (
          <section className="pt-1 flex flex-col gap-2.5">
            <h2 className="px-5 text-[13px] font-semibold text-ink-muted">Whose spots</h2>
            <div role="group" aria-label="Filter by friend" className="flex gap-3 overflow-x-auto no-scrollbar px-5 pb-1">
              <FriendChip href={cityHref({ friend: "", list: "", cat: "" })} active={!picked && !wantActive} label="Everyone" count={spots.length}>
                <span className="w-12 h-12 rounded-full bg-cream-deep text-ink text-[13px] font-semibold flex items-center justify-center">All</span>
              </FriendChip>
              {wantSpots.length > 0 && (
                <FriendChip href={cityHref({ friend: "", list: wantActive ? "" : "want", cat: "" })} active={wantActive} label="Want to go" count={wantSpots.length} wide>
                  <span className="w-12 h-12 rounded-full bg-terracotta-tint text-terracotta flex items-center justify-center"><BookmarkIcon size={20} filled /></span>
                </FriendChip>
              )}
              {showYou && me && (
                <FriendChip href={cityHref({ friend: isMe ? "" : me.username, list: "", cat: "" })} active={isMe} label="You" count={ownSpots}>
                  <Avatar user={me} size={48} />
                </FriendChip>
              )}
              {friends.map((f) => {
                const on = picked?.id === f.user.id;
                return (
                  <FriendChip key={f.user.id} href={cityHref({ friend: on ? "" : f.user.username, list: "", cat: "" })} active={on} label={first(f.user)} count={f.spots}>
                    <Avatar user={f.user} size={48} />
                  </FriendChip>
                );
              })}
            </div>
          </section>
        )}

        {knowers.length > 0 && (
          <section className="pt-6 flex flex-col gap-2.5">
            <div className="px-5">
              <h2 className="text-[13px] font-semibold text-ink-muted">These people know {city}</h2>
              <p className="text-[12px] text-ink-faint">Follow them and their spots join your friends&apos; here.</p>
            </div>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar px-5 pb-1">
              {knowers.map((k) => (
                <span key={k.user.id} className="shrink-0 flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper pl-2 pr-2.5 py-2">
                  <Link href={`/u/${k.user.username}`} className="flex items-center gap-2.5 min-w-0">
                    <Avatar user={k.user} size={36} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight">{first(k.user)}</span>
                      <span className="block text-[11.5px] text-ink-muted leading-tight">
                        {k.inCity} spot{k.inCity === 1 ? "" : "s"} here{k.followedBy.length ? ` · followed by ${k.followedBy[0]}` : k.shared ? ` · ${k.shared} in common` : ""}
                      </span>
                    </span>
                  </Link>
                  <FollowPill userId={k.user.id} signedIn next={cityHref({})} />
                </span>
              ))}
            </div>
          </section>
        )}

        {friendGuides.length > 0 && (
          <section className="pt-6 flex flex-col gap-3">
            <div className="px-5">
              <h2 className="font-display text-[22px]">{isMe ? "Your guides" : picked ? `${first(picked)}\u2019s guides` : "Guides from friends"}</h2>
              <p className="text-[13px] text-ink-muted">{isMe ? "Drafts and private ones are only visible to you" : picked ? `Their full take on ${city}` : `${friendGuides.length} guide${friendGuides.length === 1 ? "" : "s"} to ${city} from people you follow`}</p>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">
              {friendGuides.map((g) => (
                <Link key={g.guide.id} href={`/g/${g.guide.slug}`} className="shrink-0 w-[236px] rounded-2xl border border-line/80 bg-paper overflow-hidden">
                  <span className="relative block">
                    <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="h-[124px]" />
                    <span className="absolute left-2.5 bottom-2.5 rounded-full bg-paper/95 px-2.5 py-1 text-[12px] font-semibold">
                      {g.placeCount} place{g.placeCount === 1 ? "" : "s"}
                      {(g.guide.visibility !== "public" || !g.guide.publishedAt) && <> · {g.guide.publishedAt ? "Private" : "Draft"}</>}
                    </span>
                  </span>
                  <span className="block p-3">
                    <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{g.guide.title}</span>
                    {g.guide.description.trim() && <span className="block mt-1 text-[13px] leading-snug text-ink/80 line-clamp-2">{g.guide.description}</span>}
                    <span className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-muted">
                      <Avatar user={g.owner} size={22} />
                      {first(g.owner)}
                      {(saves.get(g.guide.id) ?? 0) > 0 && <> · <BookmarkIcon size={12} filled aria-hidden className="text-terracotta-deep" /> {saves.get(g.guide.id)}</>}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {spots.length > 0 && (
          <section className="pt-7 flex flex-col gap-3">
            {cats.length > 1 && (
              <div role="group" aria-label="Filter by category" className="flex gap-2 overflow-x-auto no-scrollbar px-5">
                {[null, ...cats].map((c) => (
                  <Link
                    key={c ?? "all"}
                    href={cityHref({ cat: c ?? "" })}
                    replace
                    scroll={false}
                    aria-current={cat === c ? "true" : undefined}
                    className={cx(
                      "shrink-0 rounded-full px-4 py-2 text-[13.5px] whitespace-nowrap border",
                      cat === c ? "bg-ink text-cream border-ink font-semibold" : "bg-paper border-line text-ink font-medium",
                    )}
                  >
                    {c ?? "All"}
                  </Link>
                ))}
              </div>
            )}

            {shownSpots.some((s) => s.place.lat != null && s.place.lng != null) && (
              <div className="px-4 flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[12.5px] text-ink-muted">Tap ◎ to see what&apos;s around you</span>
                  <Link href={cityHref({ view: mapView ? "" : "map" })} replace scroll={false} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-terracotta-deep">
                    <MapIcon size={15} /> {mapView ? "Smaller map" : "Full map"}
                  </Link>
                </div>
                <GuideMap
                  height={mapView ? "70vh" : 240}
                  locate
                  center={centre ? { lat: centre.lat, lng: centre.lng } : null}
                  places={shownSpots
                    .filter((s) => s.place.lat != null && s.place.lng != null)
                    .slice(0, 150)
                    .map((s) => {
                      const r = leadFor(s, picked, viewerId);
                      return {
                        id: s.key,
                        name: s.place.name,
                        lat: s.place.lat,
                        lng: s.place.lng,
                        category: s.place.category,
                        // A number only when several people recommend it (2, 3…); one person's spot is a plain pin.
                        n: s.recommenders.length > 1 ? s.recommenders.length : 0,
                        href: `/g/${r.guideSlug}/p/${r.placeId}`,
                        photoUrl: s.place.photoUrl,
                        photoMediaId: s.place.photoMediaId,
                        subtitle: recommendLabel(s, picked, fromFriends, viewerId),
                      };
                    })}
                />
              </div>
            )}

            <div className="px-4 flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="font-display text-[22px]">{isMe ? `My ${city}` : picked ? `${first(picked)}\u2019s ${city}` : fromFriends ? "Most recommended" : "Most recommended on MyGuide"}</h2>
                <span className="text-[13px] text-ink-muted">{shownSpots.length} spot{shownSpots.length === 1 ? "" : "s"}</span>
              </div>
              {shownSpots.length > 0 && (
                <Link
                  href={user ? pickHref : `/signup?why=fork&next=${encodeURIComponent(pickHref)}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-ink text-cream px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14.5px]">Make your own {city} guide</span>
                    <span className="block text-[12px] text-cream-deep">Tick the spots you want and keep them in a guide</span>
                  </span>
                  <span aria-hidden className="text-[20px]">›</span>
                </Link>
              )}
              {!fromFriends && (
                <p className="px-1 -mt-1 text-[13px] text-ink-muted">Nobody you follow has added {city} spots yet, so here&apos;s what MyGuide travellers recommend{ownSpots ? ", with yours" : ""}.</p>
              )}
              {shownSpots.length === 0 && (
                <p className="rounded-2xl border border-dashed border-cream-line p-5 text-center text-[14px] text-ink-muted">
                  {isMe ? `You haven\u2019t added any ${cat ?? ""} spots here yet.` : picked ? `${first(picked)} hasn\u2019t added any ${cat ?? ""} spots here yet.` : `No ${cat ?? ""} spots yet.`}
                </p>
              )}
              {spotGroups.map((g) => (
                <SpotGroup key={g.category ?? "all"} category={headings ? g.category : null} count={g.spots.length}>
                  {g.spots.map((s) => (
                    <SpotRow key={s.key} spot={s} picked={picked} fromFriends={fromFriends} viewerId={viewerId} follow={!fromFriends && canFollow(s)} signedIn={!!user} next={cityHref({})} grouped={headings} marks={marks} />
                  ))}
                </SpotGroup>
              ))}
            </div>
            {moreAll.length > 0 && (
              <div className="px-4 pt-7 flex flex-col gap-2.5">
                <div className="px-1">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-[22px]">More from MyGuide</h2>
                    <span className="text-[13px] text-ink-muted">{moreAll.length} spot{moreAll.length === 1 ? "" : "s"}</span>
                  </div>
                  <p className="text-[13px] text-ink-muted">{cat ? `${cat} spots` : "Spots"} recommended by people you don&apos;t follow yet.</p>
                </div>
                {moreGroups.map((g) => (
                  <SpotGroup key={g.category ?? "all"} category={headings ? g.category : null} count={g.spots.length}>
                    {g.spots.map((s) => (
                      <SpotRow key={s.key} spot={s} picked={null} fromFriends={false} viewerId={viewerId} follow={canFollow(s)} signedIn={!!user} next={cityHref({})} grouped={headings} marks={marks} />
                    ))}
                  </SpotGroup>
                ))}
              </div>
            )}
          </section>
        )}

        {all.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
              <h2 className="font-display text-[22px]">{spots.length ? `Every ${city} guide` : `All ${city} guides`}</h2>
              <div role="group" aria-label="Sort guides" className="flex rounded-full bg-cream-deep/70 p-[3px]">
                {(["saved", "new"] as const).map((s) => (
                  <Link
                    key={s}
                    href={sortHref(s)}
                    replace
                    scroll={false}
                    aria-current={sort === s ? "true" : undefined}
                    className={cx("px-3 py-1.5 rounded-full text-[13px]", sort === s ? "bg-ink text-cream font-semibold" : "text-ink")}
                  >
                    {s === "saved" ? "Most saved" : "Newest"}
                  </Link>
                ))}
              </div>
            </div>
            {all.map((g) => <GuideRow key={g.guide.id} g={g} hearts={saves.get(g.guide.id) ?? 0} />)}
          </section>
        )}

        {city && hasAny && (
          <div className="px-4 pt-8">
            <div className="rounded-[20px] bg-sage-tint p-4 flex flex-col gap-2.5">
              <p className="font-display text-[20px]">Know {city} well?</p>
              {wish ? (
                <>
                  <p className="text-[14px] leading-snug">
                    {wish.others.length} {wish.others.length === 1 ? "person has" : "people have"} {city} on their wish list. Send {wishWho} your spots.
                  </p>
                  {user && wish.viewerSpots > 0 ? (
                    <SendSpotsButton wishIds={wish.others.map((p) => p.wish.id)} label={`Send your ${wish.viewerSpots} spot${wish.viewerSpots === 1 ? "" : "s"}`} className="self-start" />
                  ) : (
                    <LinkButton href={user && wishFirst ? `/record?wish=${wishFirst}` : signupAsk} className="self-start">Add {city} spots</LinkButton>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[14px] leading-snug">Share your spots, or ask a friend who&apos;s been for theirs.</p>
                  <span className="flex flex-wrap gap-2.5">
                    <LinkButton href={addSpotsHref}>Add your spots</LinkButton>
                    {user && <AskForGuideButton city={askCity} label="Ask a friend" variant="outline" />}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {!city && (
          <p className="px-5 text-[14px] text-ink-muted">
            <SparkleIcon size={13} className="inline -mt-0.5" /> Pick a city from <Link href="/" className="text-terracotta-deep font-medium">Home</Link>.
          </p>
        )}
      </main>
    </AppShell>
  );
}

/** Spots grouped by category in the guide order (empty categories skipped), or one flat group. */
function groupSpots(list: CitySpot[], grouped: boolean): { category: string | null; spots: CitySpot[] }[] {
  if (!grouped) return list.length ? [{ category: null, spots: list }] : [];
  return orderedCategories(list.map((s) => s.place)).map((c) => ({ category: c, spots: list.filter((s) => s.place.category === c) }));
}

/**
 * A category's spots under a "Food & Drinks · 12" heading (no heading for a flat list). Tap the
 * heading to collapse or expand it; every group starts open. Native <details>, so no client JS.
 */
function SpotGroup({ category, count, children }: { category: string | null; count: number; children: ReactNode }) {
  if (!category) return <>{children}</>;
  return (
    <details open aria-label={category} className="group/cat flex flex-col">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none flex items-center gap-1.5 border-b border-line px-1 pb-1.5 pt-3">
        <h3 className="flex items-baseline gap-1.5 min-w-0">
          <span className="font-display text-[19px] leading-none">{category}</span>
          <span className="text-[12.5px] text-ink-faint tabular-nums">· {count}</span>
        </h3>
        <ChevronDown size={18} aria-hidden className="ml-auto text-ink-muted transition-transform -rotate-90 group-open/cat:rotate-0" />
      </summary>
      <div className="pt-2.5 flex flex-col gap-2.5">{children}</div>
    </details>
  );
}

/** A guide in the city list. 🔖 N = how many people saved it (the same bookmark as on the guide). */
function GuideRow({ g, hearts }: { g: GuideCard; hearts: number }) {
  return (
    <Link href={`/g/${g.guide.slug}`} className="flex items-center gap-3 rounded-2xl border border-line/80 bg-paper p-2.5 hover:border-terracotta-soft">
      <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="w-16 h-16 rounded-xl shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{g.guide.title}</span>
        <span className="block mt-0.5 text-[12.5px] text-ink-muted">{g.owner.displayName} · {g.placeCount} place{g.placeCount === 1 ? "" : "s"}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
          {hearts > 0 && (
            <>
              <span className="inline-flex items-center gap-1 font-semibold text-terracotta-deep" aria-label={`Saved by ${hearts} ${hearts === 1 ? "person" : "people"}`}>
                <BookmarkIcon size={13} filled aria-hidden /> {hearts}
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>Updated {timeAgo(g.guide.updatedAt)}</span>
        </span>
      </span>
    </Link>
  );
}

function FriendChip({ href, active, label, count, children, wide }: { href: string; active: boolean; label: string; count: number; children: ReactNode; wide?: boolean }) {
  return (
    <Link href={href} replace scroll={false} aria-current={active ? "true" : undefined} className={cx("shrink-0 flex flex-col items-center gap-1", wide ? "w-[78px]" : "w-[60px]")}>
      <span className={cx("rounded-full p-[2px] border-2", active ? "border-ink" : "border-transparent")}>{children}</span>
      <span className={cx("text-[12px] max-w-full truncate", active ? "font-semibold" : "font-medium text-ink/85")}>{label}</span>
      {count > 0 && <span className="text-[11px] text-ink-muted -mt-1">{count} spot{count === 1 ? "" : "s"}</span>}
    </Link>
  );
}

/** Whose tip and place page lead: the picked friend's, else the first with a tip. */
function leadFor(s: CitySpot, picked: PublicUser | null, viewerId?: string | null) {
  // Picked person first; otherwise a friend's words before your own.
  return (picked && s.recommenders.find((r) => r.user.id === picked.id)) || s.recommenders.find((r) => r.user.id !== viewerId) || s.recommenders[0];
}

function recommendLabel(s: CitySpot, picked: PublicUser | null, fromFriends: boolean, viewerId?: string | null): string {
  const rs = s.recommenders;
  const n = rs.length;
  const name = (u: PublicUser) => nm(u, viewerId);
  if (picked) {
    const others = rs.filter((r) => r.user.id !== picked.id);
    if (!others.length) return picked.id === viewerId ? (rs[0]?.isPrivate ? "Only you · private" : "Only you") : `Only ${name(picked)}`;
    return others.length === 1 ? `${name(picked)} & ${name(others[0].user)}` : `${name(picked)} + ${others.length} more`;
  }
  if (n === 1) return rs[0].user.id === viewerId ? (rs[0].isPrivate ? "You · private" : "You") : name(rs[0].user);
  // You first in the names: "You & Sara".
  const ordered = [...rs].sort((a, b) => Number(b.user.id === viewerId) - Number(a.user.id === viewerId));
  if (n === 2) return `${name(ordered[0].user)} & ${name(ordered[1].user)}`;
  const mineToo = rs.some((r) => r.user.id === viewerId);
  return mineToo ? `You + ${n - 1} ${fromFriends ? "friends" : "others"}` : fromFriends ? `${n} friends recommend` : `${n} people recommend`;
}

/** A spot in the list: who recommends it (faces + count) and one of their tips. */
function SpotRow({
  spot,
  picked,
  fromFriends,
  viewerId,
  follow = false,
  signedIn = false,
  next = "/",
  grouped = false,
  marks,
}: {
  spot: CitySpot;
  picked: PublicUser | null;
  fromFriends: boolean;
  viewerId: string | null;
  /** Lead recommender is someone you don't follow: a small Follow sits on the row. */
  follow?: boolean;
  signedIn?: boolean;
  next?: string;
  /** Under a category heading: the row shows just the area (the heading already names the category). */
  grouped?: boolean;
  /** Your Want to go and Been here place ids, for the 🔖 and ✓ on the row (14 Oct 2026). */
  marks?: { want: Set<string>; been: Set<string> };
}) {
  const lead = leadFor(spot, picked, viewerId);
  const onlyMinePrivate = spot.recommenders.every((r) => r.user.id === viewerId && r.isPrivate);
  const faces = [lead, ...spot.recommenders.filter((r) => r !== lead)].slice(0, 3);
  const p = spot.place;
  const many = spot.recommenders.length >= 3;
  const subline = [grouped ? "" : p.category, placeArea(p)].filter(Boolean).join(" · ");
  const yours = !!viewerId && spot.recommenders.some((r) => r.user.id === viewerId);
  // Someone else's copy to bookmark / mark: the one you saved, else the lead's.
  const theirs = spot.recommenders.filter((r) => r.user.id !== viewerId);
  const target = theirs.find((r) => marks?.want.has(r.placeId)) ?? (lead.user.id !== viewerId ? lead : theirs[0]);
  const showMarks = !!marks && !!target;
  return (
    <div className="relative">
    <Link href={`/g/${lead.guideSlug}/p/${lead.placeId}`} className="flex gap-3 rounded-2xl border border-line/80 bg-paper p-3 hover:border-terracotta-soft">
      <PlaceTile place={p} size={68} />
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className={cx("font-semibold text-[15px] leading-snug", (yours || showMarks) && "pr-16")}>{p.name}</span>
        {subline && <span className={cx("text-[12.5px] text-ink-muted truncate", (yours || showMarks) && "pr-16")}>{subline}</span>}
        {lead.tip && (
          <span className="text-[13px] leading-snug text-ink/85 line-clamp-2">
            &ldquo;{lead.tip}&rdquo; <span className="text-ink-muted">{nm(lead.user, viewerId)}</span>
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-2">
          <span className="flex">
            {faces.map((r, i) => (
              <Avatar key={r.user.id} user={r.user} size={24} className={cx("ring-2 ring-paper", i > 0 && "-ml-2")} />
            ))}
          </span>
          <span className={cx("text-[12.5px] font-semibold inline-flex items-center gap-1", many ? "text-sage" : "text-ink-muted")}>
            {onlyMinePrivate && <LockIcon size={12} />}
            {recommendLabel(spot, picked, fromFriends, viewerId)}
            <span className="font-normal text-ink-faint whitespace-nowrap">· {sharedLabel(lead.freshAt)}</span>
          </span>
          {follow && <span className="w-[72px] shrink-0 ml-auto" aria-hidden />}
        </span>
      </span>
    </Link>
    {follow && <FollowPill userId={lead.user.id} signedIn={signedIn} next={next} className="absolute right-3 bottom-3" />}
    {yours ? (
      <span className="absolute right-3 top-3 rounded-full bg-sage-tint px-2 py-0.5 text-[11px] font-semibold text-sage" title="One of your spots">✓ Yours</span>
    ) : (
      showMarks && (
        <span className="absolute right-3.5 top-3.5 flex items-center gap-3.5">
          <SaveButton placeId={target.placeId} initial={spot.recommenders.some((r) => marks.want.has(r.placeId))} signedIn={signedIn} />
          <BeenHere
            variant="icon"
            placeId={target.placeId}
            placeName={p.name}
            ownerFirst={target.user.displayName.split(" ")[0]}
            initial={spot.recommenders.some((r) => marks.been.has(r.placeId))}
            count={0}
            signedIn={signedIn}
            youHaveIt={false}
          />
        </span>
      )
    )}
    </div>
  );
}
