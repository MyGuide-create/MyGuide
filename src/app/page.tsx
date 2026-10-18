import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { AppShell, Wordmark } from "@/components/AppShell";
import { GoingSomewhere } from "@/components/GoingSomewhere";
import { GuideCover } from "@/components/GuideCover";
import { PlaceTile } from "@/components/PlaceTile";
import { CityTileImage } from "@/components/CityImage";
import { CitiesExplorer, type MapCity } from "@/components/CitiesExplorer";
import { findCity } from "@/lib/places/cities";
import { SearchIcon } from "@/components/Icons";
import { SaveButton } from "@/components/SaveButton";
import { SendSpotsButton } from "@/components/SendSpotsButton";
import { Avatar, LinkButton, cx } from "@/components/ui";
import { getCurrentUser, toPublicUser, type PublicUser } from "@/lib/auth";
import { acceptedFollowingIds, friendCities, loadRecommendations, ownSpotKeys, spotKey } from "@/lib/citySpots";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
import type { CityPhoto } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { placeComments, placeReactions, savedPlaces } from "@/lib/db/schema";
import { hiddenUserIds } from "@/lib/blocks";
import { BeenHere } from "@/components/BeenHere";
import { listFeed, peopleToFollow, type GuideCard } from "@/lib/guides";
import { pickSpotlight, reasonLine, suggestPeople } from "@/lib/suggest";
import { SpotlightCard } from "@/components/SpotlightCard";
import { cityKey, cityTiles, everyoneFeed, feedOwner, homeFeed, nameList, nextTrip, wantedGuides, type FeedEntry } from "@/lib/homeV2";
import { capRuns } from "@/lib/fill";
import { HomeScreenNudge } from "@/components/HomeScreenNudge";
import { pushPublicKey } from "@/lib/push";
import { userVisits } from "@/lib/db/schema";
import { nearestFirst, viewerLocation } from "@/lib/nearby";
import { FollowPill } from "@/components/FollowPill";
import { ClapBar } from "@/components/ClapBar";
import { loadClaps } from "@/lib/claps";
import { clapKey, spotsTarget, type ClapFace, type ClapSummary } from "@/lib/clapTargets";
import { placeArea } from "@/lib/places/neighbourhood";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const cityHref = (t: { city: string; country?: string }, friend?: string) =>
  `/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}), ...(friend ? { friend } : {}) }).toString()}`;
const first = (u: { displayName: string }) => u.displayName.split(" ")[0];
const FEED_DAYS = 45;
/** Home feed: about this many items, friends' first, the rest from everyone ("New on MyGuide"). */
const FEED_TARGET = 15;
/** Below this many friends' posts, "More on MyGuide" fills in. */
const FEED_FILL_BELOW = 6;
/** Explore's one row of cities: up to this many, then "All cities". */
const CITY_TILES = 12;

/**
 * Home, places first: Going somewhere? → your trip → your friends' cities (then popular ones) → new
 * from friends (spots they recommend, spots several friends now share, new guides) then new on
 * MyGuide from everyone → friends heading somewhere (then other people's wishes). Friends always
 * come first and are labelled; everyone's public content fills the rest, so Home is never empty.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const followingIds = user ? await acceptedFollowingIds(user.id) : [];

  const [{ moreCities, byCity }, trip, wanted, recs, followingGuides] = await Promise.all([
    cityTiles(user?.id),
    user ? nextTrip(user.id) : Promise.resolve(null),
    wantedGuides(user?.id, 5),
    user ? loadRecommendations({ viewerId: user.id, ownerIds: followingIds }) : Promise.resolve([]),
    user ? listFeed({ viewerId: user.id, scope: "following", limit: 40 }) : Promise.resolve([] as GuideCard[]),
  ]);

  // One row of cities (16 Oct 2026): Explore is for discovering. Every city with spots you can see
  // (friends', yours, then the most active on MyGuide), the one you're in first, then most spots.
  // Your own cities live in My spots. Counts are everyone's spots, as the city page shows them.
  const here = await viewerLocation();
  // Opened MyGuide from its home-screen icon at least once: they have it, so no reminder card.
  const hasIcon = user ? (await (await getDb()).select({ d: userVisits.day }).from(userVisits).where(and(eq(userVisits.userId, user.id), eq(userVisits.standalone, true))).limit(1)).length > 0 : true;
  const known = (user ? await friendCities(user.id, recs, { withOwn: true }) : []).map((c) => ({
    ...c,
    spots: Math.max(c.spots, byCity.get(cityKey(c.city))?.spots ?? 0),
  }));
  const knownKeys = new Set(known.map((c) => cityKey(c.city)));
  const popular = moreCities.filter((t) => !knownKeys.has(cityKey(t.city))).map((t) => ({ ...t, friends: [] as PublicUser[], mine: 0, more: true }));
  const row = await nearestFirst([...known.map((c) => ({ ...c, guides: 0, more: false })), ...popular], here);
  const cities = row.items.slice(0, CITY_TILES);
  const moreToExplore = row.items.length - cities.length;
  // Following few people: a row of people to follow.
  // Who to follow (15 Oct 2026): one ranking (src/lib/suggest.ts) for the spotlight card and the row.
  const suggestions = user ? await suggestPeople(user.id, { limit: 13, extraCities: trip ? [trip.trip.city] : [] }) : [];
  // Admins can preview the card while following everyone: /?preview=spotlight.
  const previewSpotlight = !!user && isAdmin(user) && sp.preview === "spotlight";
  const spotlight = previewSpotlight
    ? pickSpotlight(await suggestPeople(user!.id, { limit: 13, includeFollowed: true })) ?? (await suggestPeople(user!.id, { limit: 1, includeFollowed: true }))[0] ?? null
    : pickSpotlight(suggestions);
  let people: Array<{ user: PublicUser; line: string; followsYou: boolean }> = suggestions
    .filter((p) => p.user.id !== spotlight?.user.id)
    .slice(0, 12)
    .map((p) => ({ user: p.user, line: reasonLine(p), followsYou: p.followsYou }));
  // Nobody with spots to suggest (a quiet network): newest members, so a new person still finds friends.
  if (user && !people.length && followingIds.length < 3)
    people = (await peopleToFollow(user.id, 12)).hits.map((h) => ({ user: h.user, line: "New on MyGuide", followsYou: h.followsViewer }));
  const fewFollows = followingIds.length < 3;
  const photos = await cityPhotosFor(
    [...(trip ? [trip.trip.city] : []), ...cities.map((c) => c.city)],
    new Map(cities.filter((c) => c.country).map((c) => [cityPhotoKey(c.city), c.country])),
  );
  const photoFor = (city: string) => photos.get(cityPhotoKey(city));
  // The cities map (16 Oct 2026): yours, your friends', then the most active elsewhere on MyGuide.
  const mapCities: MapCity[] = [];
  // One dot per real city: names that resolve to the same place (aliases, spellings) are merged.
  const onMap = new Map<string, MapCity>();
  const me = user ? toPublicUser(user) : null;
  for (const c of [...known, ...popular]) {
    const at = findCity(c.city);
    if (!at) continue;
    const k = `${at.city}|${at.country}`.toLowerCase();
    const friends = c.friends.filter((f) => f.id !== me?.id);
    const isMore = "more" in c && !c.friends.length && !c.mine;
    const prev = onMap.get(k);
    if (prev) {
      // Already there from a better list (yours/friends'): add this name's spots and people.
      if (isMore) continue;
      prev.spots += c.spots;
      prev.mine = prev.mine || c.mine > 0;
      for (const f of friends) if (!prev.friends.some((x) => x.id === f.id)) prev.friends.push(f);
      prev.more = false;
      continue;
    }
    const entry: MapCity = { city: c.city, href: cityHref(c), lat: at.lat, lng: at.lng, spots: c.spots, mine: c.mine > 0, friends, more: isMore };
    onMap.set(k, entry);
    mapCities.push(entry);
  }

  // New from friends: their spots, spots several friends now share, and newly published guides.
  // Then "New on MyGuide": everyone else's, filling up to FEED_TARGET (all of it when you follow nobody).
  // Friends only (16 Oct 2026): your own spots live in My spots, so Explore is all new to you.
  const feed = capRuns(homeFeed(recs, followingGuides, FEED_DAYS), feedOwner).slice(0, FEED_TARGET);
  // Everyone's posts only fill in while friends' are thin (16 Oct 2026), so Explore stays short.
  const friendsShown = feed.length;
  const fillCount = friendsShown >= FEED_FILL_BELOW ? 0 : Math.max(FEED_TARGET - feed.length, 4);
  const everyone = fillCount ? await everyoneFeed(user?.id, new Set([...(user ? [user.id] : []), ...followingIds]), { days: 30, limit: fillCount }) : [];
  const feedPlaceIds = [...feed, ...everyone].flatMap((f) => (f.kind === "spots" ? f.recs.slice(0, 8).map((r) => r.place.id) : []));
  const savedIds = new Set<string>();
  if (user && feedPlaceIds.length) {
    const db = await getDb();
    for (const r of await db.select({ id: savedPlaces.placeId }).from(savedPlaces).where(and(eq(savedPlaces.userId, user.id), inArray(savedPlaces.placeId, feedPlaceIds)))) savedIds.add(r.id);
  }

  // Spots you already have (any of your places): no "Want to go" on those, a ✓ instead.
  const ownKeys = new Set(user ? [...(await ownSpotKeys(user.id)).values()].flatMap((k) => [...k]) : []);

  // 👏 on activity posts (spots on a day, new guides).
  const clapTargetOf = (f: FeedEntry) => (f.kind === "guide" ? { kind: "guide" as const, target: f.card.guide.id } : f.kind === "spots" ? { kind: "spots" as const, target: spotsTarget(f.user.id, f.city, f.at) } : null);
  const clapMap = await loadClaps(user?.id, [...feed, ...everyone].map(clapTargetOf).filter((x) => !!x));
  // The action row (17 Oct 2026): comments, Recommend and "N friends recommend it too" on one-spot posts.
  const onePlaceIds = [...feed, ...everyone].flatMap((f) => (f.kind === "spots" && f.recs.length === 1 ? [f.recs[0].place.id] : []));
  const commentCounts = new Map<string, number>();
  const beenIds = new Set<string>();
  if (onePlaceIds.length) {
    const db = await getDb();
    const [rows, hidden, been] = await Promise.all([
      db.select({ placeId: placeComments.placeId, authorId: placeComments.authorId }).from(placeComments).where(inArray(placeComments.placeId, onePlaceIds)),
      hiddenUserIds(user?.id),
      user ? db.select({ id: placeReactions.placeId }).from(placeReactions).where(and(eq(placeReactions.userId, user.id), eq(placeReactions.kind, "been"), inArray(placeReactions.placeId, onePlaceIds))) : Promise.resolve([]),
    ]);
    for (const r of rows) if (!hidden.has(r.authorId)) commentCounts.set(r.placeId, (commentCounts.get(r.placeId) ?? 0) + 1);
    for (const r of been) beenIds.add(r.id);
  }
  const recommenders = new Map<string, Set<string>>();
  for (const r of recs) {
    const k = spotKey(r.place);
    recommenders.set(k, (recommenders.get(k) ?? new Set<string>()).add(r.owner.id));
  }
  const meFace: ClapFace | undefined = user ? { username: user.username, displayName: user.displayName, avatarMediaId: user.avatarMediaId } : undefined;
  const rowData: RowData = { commentCounts, beenIds, recommenders, me: meFace };

  const clapsFor = (f: FeedEntry) => {
    const t = clapTargetOf(f);
    return t ? clapMap.get(clapKey(t.kind, t.target)) : undefined;
  };

  const peopleRow = people.length > 0 && (
    <section className="pt-8 flex flex-col gap-3">
      <div className="px-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[22px]">People to follow</h2>
          <p className="text-[13px] text-ink-muted">{fewFollows ? "Follow friends and their cities and spots show up here." : "More people whose taste you might like."}</p>
        </div>
        <Link href="/search" className="shrink-0 text-[13px] font-semibold text-terracotta whitespace-nowrap">Find someone →</Link>
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">
        {people.map((p) => (
          <span key={p.user.id} className="shrink-0 w-[124px] rounded-2xl border border-line/80 bg-paper p-3 flex flex-col items-center gap-1.5 text-center">
            <Link href={`/u/${p.user.username}`} className="flex flex-col items-center gap-1.5 min-w-0 w-full">
              <Avatar user={p.user} size={56} />
              <span className="text-[13.5px] font-semibold leading-tight truncate w-full">{first(p.user)}</span>
              <span className="-mt-1 text-[11.5px] leading-snug text-ink-muted w-full line-clamp-2 min-h-[2.6em]">{p.line}</span>
              {p.followsYou && p.line !== "Follows you" && <span className="text-[11px] font-semibold text-sage">Follows you</span>}
            </Link>
            <FollowPill userId={p.user.id} signedIn next="/" />
          </span>
        ))}
      </div>
    </section>
  );



  const help = wanted.help;
  const wishIds = (w: NonNullable<typeof help>) => w.others.map((p) => p.wish.id);

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <Wordmark />
          {user ? (
            <Link href="/search" aria-label="Search people, places and cities" className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-ink hover:bg-cream-deep/60"><SearchIcon size={22} /></Link>
          ) : (
            <span className="flex items-center gap-3">
              <Link href="/login" className="text-[14px] font-medium text-ink-muted hover:text-ink">Log in</Link>
              <LinkButton href="/signup" size="sm">Sign up</LinkButton>
            </span>
          )}
        </div>
        {!user && (
          <>
            <h1 className="mt-5 font-display text-[34px] leading-[1.05]">Going somewhere?</h1>
            <p className="mt-1.5 text-[14.5px] text-ink-muted">The spots your friends love, in every city they know.</p>
          </>
        )}
        <div className={user ? "mt-3" : "mt-4"}>
          <GoingSomewhere />
        </div>
      </header>
      {user && <HomeScreenNudge hasIcon={hasIcon} publicKey={pushPublicKey()} />}

      <main className="pb-6 flex flex-col">
        {sp.deleted === "1" && <p className="mx-4 mt-3 rounded-2xl bg-sage-tint px-4 py-3 text-[13px]">Your account has been deleted. Thanks for trying MyGuide.</p>}


        {mapCities.length > 0 && (
          <CitiesExplorer
            cities={mapCities}
            tiles={
              <div data-reel="cities" className="flex gap-3 overflow-x-auto no-scrollbar px-5">
                {cities.map((c) => (
                  <CityTile key={c.city} href={cityHref(c)} city={c.city} photo={photoFor(c.city)} near={row.nearKey === cityKey(c.city)} spots={c.spots} guides={c.guides}>
                    <Faces users={c.mine > 0 && me ? [me, ...c.friends.filter((f) => f.id !== me.id)] : c.friends} ring="ring-cream" />
                  </CityTile>
                ))}
                <Link href="/cities" className="shrink-0 w-[140px] h-[150px] rounded-2xl border-[1.5px] border-dashed border-cream-line flex flex-col items-center justify-center gap-1.5 text-center px-3">
                  <span className="font-semibold text-[14px]">All cities</span>
                  <span className="text-[12px] text-ink-muted">
                    {moreToExplore > 0 ? (
                      <>
                        {row.items.slice(cities.length, cities.length + 3).map((t) => t.city).join(", ")}
                        {moreToExplore > 3 ? ` +${moreToExplore - 3}` : ""}
                      </>
                    ) : (
                      "Every city on MyGuide"
                    )}
                  </span>
                </Link>
              </div>
            }
          />
        )}
        {fewFollows && peopleRow}

        {spotlight && (!fewFollows || !peopleRow || previewSpotlight) && <SpotlightCard s={spotlight} reason={reasonLine(spotlight)} preview={previewSpotlight} />}
        {feed.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <h2 className="px-1 font-display text-[22px]">New from friends</h2>
            {feed.map((f) => <FeedCard key={feedKey(f)} f={f} savedIds={savedIds} signedIn={!!user} viewerId={user?.id} claps={clapsFor(f)} ownKeys={ownKeys} row={rowData} />)}
          </section>
        )}
        {everyone.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <div className="px-1">
              <h2 className="font-display text-[22px]">More on MyGuide</h2>
              <p className="text-[13px] text-ink-muted">{feed.length ? "More from people you don\u2019t follow yet." : "What people are recommending right now. Follow anyone whose taste you like."}</p>
            </div>
            {everyone.map((f) => <FeedCard key={feedKey(f)} f={f} savedIds={savedIds} signedIn={!!user} viewerId={user?.id} claps={clapsFor(f)} ownKeys={ownKeys} row={rowData} followable />)}
          </section>
        )}

        {help && (
          <section className="px-4 pt-8 flex flex-col gap-3">
          {help && (
            <div className="rounded-[20px] bg-ink text-cream p-4 flex flex-col gap-3">
              <span className="flex items-center gap-2.5">
                {help.known[0] && <Avatar user={help.known[0].user} size={34} />}
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-cream-deep">You could help</span>
              </span>
              <p className="font-display text-[21px] leading-snug">
                {nameList(help.known.map((p) => p.user.displayName))} {help.known.length === 1 ? "wants" : "want"} spots for {help.group.city}.
                {help.viewerSpots > 0
                  ? ` You recommend ${help.viewerSpots} there.`
                  : help.viewerPlaces > 0
                    ? ` You've got ${help.viewerPlaces} place${help.viewerPlaces === 1 ? "" : "s"} there.`
                    : ""}
              </p>
              <div className="flex flex-wrap gap-2.5">
                {help.viewerSpots > 0 ? (
                  <SendSpotsButton dark wishIds={wishIds(help)} label={`Send ${help.known.length === 1 ? first(help.known[0].user) : "them"} your ${help.viewerSpots} spot${help.viewerSpots === 1 ? "" : "s"}`} />
                ) : help.viewerGuides.length > 0 ? (
                  <LinkButton href={`/wishes?city=${encodeURIComponent(help.group.city)}`}>Send my guide</LinkButton>
                ) : (
                  <LinkButton href={`/record?wish=${wishIds(help)[0]}`}>Add {help.group.city} spots</LinkButton>
                )}
                {help.viewerSpots > 0 && (
                  <Link href={`/record?wish=${wishIds(help)[0]}`} className="inline-flex items-center h-11 px-4 rounded-full border border-cream/40 text-[14px] font-medium">
                    Add more
                  </Link>
                )}
              </div>
            </div>
          )}
          </section>
        )}

      </main>
    </AppShell>
  );
}

function feedKey(f: FeedEntry): string {
  if (f.kind === "guide") return `g:${f.card.guide.id}`;
  if (f.kind === "overlap") return `o:${f.spot.key}`;
  return `s:${f.user.id}:${f.city}:${f.at.getTime()}`;
}

/** A row of city tiles that scrolls sideways, with "All cities" in the header when `all`. */

/** One city: picture, who knows it (children), and how many spots. */
/** `small`: friends' and popular cities (16 Oct 2026); your own cities stay bigger. */
function CityTile({ href, city, photo, near, spots, guides, children, small = false }: { href: string; city: string; photo?: CityPhoto; near?: boolean; spots: number; guides?: number; children?: React.ReactNode; small?: boolean }) {
  return (
    <Link href={href} className={cx("shrink-0 flex flex-col gap-1.5", small ? "w-[112px]" : "w-[140px]")}>
      <span className="relative block">
        <CityTileImage photo={photo} city={city} small={small} className={small ? "h-[100px]" : "h-[150px]"} />
        {near && <span className="absolute left-1.5 top-1.5 rounded-full bg-paper/95 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink">Near you</span>}
      </span>
      {/* One line under the photo (16 Oct 2026): faces, then the spot count. */}
      <span className="px-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted min-w-0">
        {children}
        <span className="font-semibold text-ink whitespace-nowrap">
          {spots || !guides ? `${spots} spot${spots === 1 ? "" : "s"}` : `${guides} guide${guides === 1 ? "" : "s"}`}
        </span>
      </span>
    </Link>
  );
}

function Faces({ users, ring }: { users: PublicUser[]; ring: string }) {
  return (
    <span className="flex shrink-0">
      {users.slice(0, 3).map((u, i) => (
        <Avatar key={u.id} user={u} size={22} className={cx("ring-2", ring, i > 0 && "-ml-1.5")} />
      ))}
    </span>
  );
}

/**
 * One item on Home. `followable`: from someone you don't follow ("New on MyGuide") — a small
 * Follow sits next to their name.
 */
/** What a post's action row needs beyond the post (17 Oct 2026). */
interface RowData {
  commentCounts: Map<string, number>;
  beenIds: Set<string>;
  /** Spot key → friends who recommend it. */
  recommenders: Map<string, Set<string>>;
  me?: ClapFace;
}

function FeedCard({ f, savedIds, signedIn, followable = false, viewerId, claps, ownKeys, row }: { f: FeedEntry; savedIds: Set<string>; signedIn: boolean; followable?: boolean; viewerId?: string; claps?: ClapSummary; ownKeys?: Set<string>; row: RowData }) {
  const yours = (p: Parameters<typeof spotKey>[0]) => !!ownKeys?.has(spotKey(p));
  if (f.kind === "guide") {
    const g = f.card;
    return (
      <div className="rounded-2xl border border-line/80 bg-paper overflow-hidden">
        <Link href={`/g/${g.guide.slug}`} className="relative block">
          <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="h-[110px]" />
          <span className="absolute left-2.5 bottom-2.5 rounded-full bg-paper/95 px-2.5 py-1 text-[12px] font-semibold">
            New guide · {g.placeCount} place{g.placeCount === 1 ? "" : "s"}
          </span>
        </Link>
        <span className="flex items-center gap-2.5 px-3.5 py-3">
          <Link href={`/u/${g.owner.username}`} className="shrink-0"><Avatar user={g.owner} size={32} /></Link>
          {/* Name → profile, the rest → the guide (18 Oct 2026). */}
          <span className="flex-1 min-w-0 text-[13.5px] leading-snug">
            <Link href={`/u/${g.owner.username}`} className="font-semibold">{first(g.owner)}</Link>{" "}
            <Link href={`/g/${g.guide.slug}`}>published <b className="font-semibold">{g.guide.title}</b>
              <span className="block text-[12px] text-ink-muted">{[g.guide.city, timeAgo(f.at)].filter(Boolean).join(" · ")}</span>
            </Link>
          </span>
          {followable && <FollowPill userId={g.owner.id} signedIn={signedIn} next="/" />}
        </span>
        <div className="px-3.5 pb-3 -mt-0.5">
          <ClapBar kind="guide" target={g.guide.id} ownerId={g.owner.id} ownerName={first(g.owner)} initial={claps} signedIn={signedIn} own={viewerId === g.owner.id} me={row.me} share={{ path: `/g/${g.guide.slug}`, title: g.guide.title }} />
        </div>
      </div>
    );
  }
  if (f.kind === "overlap") {
    const rs = f.spot.recommenders;
    const lead = rs[0];
    return (
      <Link href={`/g/${lead.guideSlug}/p/${lead.placeId}`} className="rounded-2xl bg-sage-tint p-3.5 flex items-center gap-3">
        <Faces users={rs.map((r) => r.user)} ring="ring-sage-tint" />
        <span className="flex-1 min-w-0 text-[13.5px] leading-snug">
          <b className="font-semibold">{f.spot.place.name}</b> in {f.city} now has {rs.length} friends recommending it: {nameList(rs.map((r) => r.user.displayName))}
        </span>
      </Link>
    );
  }
  const r0 = f.recs[0];
  const one = f.recs.length === 1;
  const own = viewerId === f.user.id;
  // "in Copenhagen, Denmark" (17 Oct 2026): the country spelled out, never a code; skipped for city-states (Singapore).
  const country = f.city ? findCity(f.city)?.country || (r0?.place.country.length > 3 ? r0.place.country : "") : "";
  const where = country && country.toLowerCase() !== f.city.toLowerCase() ? `${f.city}, ${country}` : f.city;
  return (
    <div className="rounded-2xl border border-line/80 bg-paper p-3.5 flex flex-col gap-2.5">
      <span className="flex items-center gap-2.5">
        {/* The face always opens their profile (18 Oct 2026); the words open the city. */}
        <Link href={`/u/${f.user.username}`} aria-label={`${f.user.displayName}'s profile`} className="shrink-0"><Avatar user={f.user} size={32} /></Link>
        {/* Name → profile, the rest → their spots in that city (18 Oct 2026). */}
        <span className="flex-1 min-w-0 text-[13.5px] leading-snug">
          <Link href={`/u/${f.user.username}`} className="font-semibold">{followable ? f.user.displayName : first(f.user)}</Link>{" "}
          <Link href={followable ? `/u/${f.user.username}` : cityHref({ city: f.city }, f.user.username)}>
            recommended {one ? "a spot" : `${f.recs.length} spots`}{f.city ? <> in <b className="font-semibold">{where}</b></> : null}
            <span className="block text-[12px] text-ink-muted">{timeAgo(f.at)}</span>
          </Link>
        </span>
        {followable && <FollowPill userId={f.user.id} signedIn={signedIn} next="/" />}
      </span>
      {one ? (
        <>
          <Link href={`/g/${r0.guide.slug}/p/${r0.place.id}`} className="flex gap-3 rounded-xl bg-cream-deep/40 p-2.5">
            <PlaceTile place={r0.place} size={60} />
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-semibold text-[15px] leading-snug">{r0.place.name}</span>
              <span className="text-[12.5px] text-ink-muted truncate">{[r0.place.category, placeArea(r0.place)].filter(Boolean).join(" · ")}</span>
              {r0.tip && <span className="text-[13px] leading-snug text-ink/85 line-clamp-2">&ldquo;{r0.tip}&rdquo;</span>}
            </span>
          </Link>
        </>
      ) : (
        <span className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {f.recs.slice(0, 8).map((r) => (
            <span key={r.place.id} className="relative shrink-0 w-[118px]">
              <Link href={`/g/${r.guide.slug}/p/${r.place.id}`} className="flex flex-col gap-1.5">
                <PlaceTile place={r.place} size={118} />
                <span className="text-[13px] font-semibold leading-tight line-clamp-2">{r.place.name}</span>
                <span className="-mt-1 text-[11.5px] text-ink-muted truncate">{[r.place.category, placeArea(r.place)].filter(Boolean).join(" · ")}</span>
              </Link>
              {viewerId !== f.user.id &&
                (yours(r.place) ? (
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-sage text-white text-[11px] font-semibold px-2 py-0.5 shadow-sm" title="One of your spots">Your spot</span>
                ) : (
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-paper/90 backdrop-blur shadow-sm">
                    <SaveButton placeId={r.place.id} initial={savedIds.has(r.place.id)} signedIn={signedIn} className="m-0!" />
                  </span>
                ))}
            </span>
          ))}
        </span>
      )}
      {/* Action row (17 Oct 2026): ♥ · 💬 · Recommend · Send … Save. Comment, Recommend and Save are per spot, so one-spot posts only. */}
      <ClapBar
        kind="spots"
        target={spotsTarget(f.user.id, f.city, f.at)}
        ownerId={f.user.id}
        ownerName={first(f.user)}
        city={f.city}
        count={f.recs.length}
        initial={claps}
        signedIn={signedIn}
        own={own}
        me={row.me}
        comments={one ? { count: row.commentCounts.get(r0.place.id) ?? 0, href: `/g/${r0.guide.slug}/p/${r0.place.id}#comments` } : undefined}
        alsoRecommend={one ? [...(row.recommenders.get(spotKey(r0.place)) ?? [])].filter((id) => id !== f.user.id && id !== viewerId).length : 0}
        recommend={
          one && !own
            ? yours(r0.place)
              ? <span className="inline-flex items-center gap-1 h-8 rounded-full bg-sage-tint px-3 text-[12.5px] font-semibold text-sage whitespace-nowrap">✓ Your spot</span>
              : <BeenHere variant="bar" placeId={r0.place.id} placeName={r0.place.name} ownerFirst={first(f.user)} initial={row.beenIds.has(r0.place.id)} count={0} signedIn={signedIn} youHaveIt={false} />
            : undefined
        }
        share={one ? { path: `/g/${r0.guide.slug}/p/${r0.place.id}`, title: r0.place.name } : { path: cityHref({ city: f.city }, f.user.username), title: `${first(f.user)}\u2019s ${f.city} spots` }}
        save={one && !own && !yours(r0.place) ? <SaveButton placeId={r0.place.id} initial={savedIds.has(r0.place.id)} signedIn={signedIn} /> : undefined}
      />
    </div>
  );
}



