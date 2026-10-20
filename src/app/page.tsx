import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { AppShell, Wordmark } from "@/components/AppShell";
import { GoingSomewhere } from "@/components/GoingSomewhere";
import { CityTileImage } from "@/components/CityImage";
import { CitiesExplorer, type MapCity } from "@/components/CitiesExplorer";
import { findCity } from "@/lib/places/cities";
import { SearchIcon } from "@/components/Icons";
import { SendSpotsButton } from "@/components/SendSpotsButton";
import { Avatar, LinkButton, cx } from "@/components/ui";
import { getCurrentUser, toPublicUser, type PublicUser } from "@/lib/auth";
import { acceptedFollowingIds, friendCities, loadRecommendations, ownSpotKeys, spotKey } from "@/lib/citySpots";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
import type { CityPhoto } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { placeComments, placeReactions, places, savedPlaces } from "@/lib/db/schema";
import { hiddenUserIds } from "@/lib/blocks";
import { peopleToFollow } from "@/lib/guides";
import { pickSpotlight, reasonLine, suggestPeople } from "@/lib/suggest";
import { SpotlightCard } from "@/components/SpotlightCard";
import { cityKey, cityTiles, nameList, nextTrip, wantedGuides } from "@/lib/homeV2";
import { HomeScreenNudge } from "@/components/HomeScreenNudge";
import { pushPublicKey } from "@/lib/push";
import { userVisits } from "@/lib/db/schema";
import { nearestFirst, viewerLocation } from "@/lib/nearby";
import { FollowPill } from "@/components/FollowPill";
import { DiscoveryCard, type DiscoveryContext } from "@/components/DiscoveryCard";
import { loadDiscoveries } from "@/lib/discoveries";

export const dynamic = "force-dynamic";

const cityHref = (t: { city: string; country?: string }, friend?: string) =>
  `/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}), ...(friend ? { friend } : {}) }).toString()}`;
const first = (u: { displayName: string }) => u.displayName.split(" ")[0];
const FEED_DAYS = 45;
/** Discoveries: up to this many cards. */
const FEED_TARGET = 30;
/** Explore's one row of cities: up to this many, then "All cities". */
const CITY_TILES = 12;

/**
 * Home, places first: Going somewhere? → your trip → your friends' cities (then popular ones) →
 * Discoveries (src/lib/discoveries.ts: yours, people you follow, what they heart or comment on, and
 * featured accounts, one card per spot or guide) → friends heading somewhere (then other people's wishes).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const followingIds = user ? await acceptedFollowingIds(user.id) : [];

  const [{ moreCities, byCity }, trip, wanted, recs] = await Promise.all([
    cityTiles(user?.id),
    user ? nextTrip(user.id) : Promise.resolve(null),
    wantedGuides(user?.id, 5),
    user ? loadRecommendations({ viewerId: user.id, ownerIds: followingIds }) : Promise.resolve([]),
  ]);

  // One row of cities (16 Oct 2026): Explore is for discovering. Every city with spots you can see
  // (friends', yours, then the most active on MyGuide), the one you're in first, then most spots.
  // Your own cities live in My spots. Counts are everyone's spots, as the city page shows them.
  const here = await viewerLocation();
  // Opened MyGuide from its home-screen icon at least once: they have it, so no reminder card.
  const hasIcon = user ? (await (await getDb()).select({ d: userVisits.day }).from(userVisits).where(and(eq(userVisits.userId, user.id), eq(userVisits.standalone, true))).limit(1)).length > 0 : true;
  // Counts mean "new to you" (19 Oct 2026): friends' spots you haven't vouched for, saved or been to,
  // the same spots the city page lists. Cities only you know keep their MyGuide-wide count.
  const haveKeys = new Set<string>();
  if (user) {
    const db = await getDb();
    const [mineByCity, savedRows, beenRows] = await Promise.all([
      ownSpotKeys(user.id),
      db.select({ googlePlaceId: places.googlePlaceId, name: places.name, lat: places.lat, lng: places.lng }).from(savedPlaces).innerJoin(places, eq(places.id, savedPlaces.placeId)).where(eq(savedPlaces.userId, user.id)),
      db.select({ googlePlaceId: places.googlePlaceId, name: places.name, lat: places.lat, lng: places.lng }).from(placeReactions).innerJoin(places, eq(places.id, placeReactions.placeId)).where(and(eq(placeReactions.userId, user.id), eq(placeReactions.kind, "been"))),
    ]);
    for (const keys of mineByCity.values()) for (const k of keys) haveKeys.add(k);
    for (const r of [...savedRows, ...beenRows]) haveKeys.add(spotKey(r));
  }
  const newByCity = new Map<string, Set<string>>();
  for (const r of recs) {
    if (!r.city || r.owner.id === user?.id) continue;
    const k = spotKey(r.place);
    if (haveKeys.has(k)) continue;
    const ck = cityKey(r.city);
    newByCity.set(ck, (newByCity.get(ck) ?? new Set<string>()).add(k));
  }
  const known = (user ? await friendCities(user.id, recs, { withOwn: true }) : []).map((c) => ({
    ...c,
    spots: c.friends.length ? (newByCity.get(cityKey(c.city))?.size ?? 0) : Math.max(c.spots, byCity.get(cityKey(c.city))?.spots ?? 0),
    fresh: c.friends.length > 0,
  }));
  const knownKeys = new Set(known.map((c) => cityKey(c.city)));
  const popular = moreCities.filter((t) => !knownKeys.has(cityKey(t.city))).map((t) => ({ ...t, friends: [] as PublicUser[], mine: 0, more: true, fresh: false }));
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
      prev.fresh = prev.fresh || c.fresh;
      for (const f of friends) if (!prev.friends.some((x) => x.id === f.id)) prev.friends.push(f);
      prev.more = false;
      continue;
    }
    const entry: MapCity = { city: c.city, href: cityHref(c), lat: at.lat, lng: at.lng, spots: c.spots, mine: c.mine > 0, friends, more: isMore, fresh: c.fresh };
    onMap.set(k, entry);
    mapCities.push(entry);
  }

  // Discoveries (20 Oct 2026): one feed, newest first — yours, people you follow, what they heart or
  // comment on, and featured accounts. One card per spot or guide; saves never show.
  const disc = await loadDiscoveries(user?.id, { days: FEED_DAYS, limit: FEED_TARGET });
  const leadIds = disc.items.flatMap((d) => (d.kind === "place" ? [d.lead.place.id] : []));
  const savedIds = new Set<string>();
  const commentCounts = new Map<string, number>();
  if (leadIds.length) {
    const db = await getDb();
    const [saved, comments, hidden] = await Promise.all([
      user ? db.select({ id: savedPlaces.placeId }).from(savedPlaces).where(and(eq(savedPlaces.userId, user.id), inArray(savedPlaces.placeId, leadIds))) : Promise.resolve([]),
      db.select({ placeId: placeComments.placeId, authorId: placeComments.authorId }).from(placeComments).where(inArray(placeComments.placeId, leadIds)),
      hiddenUserIds(user?.id),
    ]);
    for (const r of saved) savedIds.add(r.id);
    for (const r of comments) if (!hidden.has(r.authorId)) commentCounts.set(r.placeId, (commentCounts.get(r.placeId) ?? 0) + 1);
  }
  // Spots you already have (any of your places): "✓ In your list" instead of Vouch and Save.
  const ownKeys = new Set(user ? [...(await ownSpotKeys(user.id)).values()].flatMap((k) => [...k]) : []);
  const discCtx: DiscoveryContext = {
    viewerId: user?.id,
    signedIn: !!user,
    me: user ? { username: user.username, displayName: user.displayName, avatarMediaId: user.avatarMediaId } : undefined,
    following: disc.following,
    savedIds,
    ownKeys,
    commentCounts,
    firstHeart: disc.firstHeart,
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
                  <CityTile key={c.city} href={cityHref(c)} city={c.city} photo={photoFor(c.city)} near={row.nearKey === cityKey(c.city)} spots={c.spots} guides={c.guides} fresh={c.fresh}>
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
        <section className="px-4 pt-8 flex flex-col gap-3">
          <div className="px-1">
            <h2 className="font-display text-[22px]">Discoveries</h2>
            {disc.items.length === 0 && (
              <p className="mt-1 text-[13px] text-ink-muted">
                {user ? "Follow people whose taste you trust: what they vouch for, love and comment on shows up here." : "Spots and guides people are vouching for. Sign up to follow friends."}{" "}
                {user && <Link href="/search" className="font-semibold text-terracotta">Find people →</Link>}
              </p>
            )}
          </div>
          {disc.items.map((d) => <DiscoveryCard key={d.key} d={d} ctx={discCtx} />)}
        </section>

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
                  ? ` You vouch for ${help.viewerSpots} there.`
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

/** A row of city tiles that scrolls sideways, with "All cities" in the header when `all`. */

/** One city: picture, who knows it (children), and how many spots. */
/** `small`: friends' and popular cities (16 Oct 2026); your own cities stay bigger. */
function CityTile({ href, city, photo, near, spots, guides, children, small = false, fresh = false }: { href: string; city: string; photo?: CityPhoto; near?: boolean; spots: number; guides?: number; children?: React.ReactNode; small?: boolean; fresh?: boolean }) {
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
          {fresh ? (spots ? `${spots} new` : "All in your list") : spots || !guides ? `${spots} spot${spots === 1 ? "" : "s"}` : `${guides} guide${guides === 1 ? "" : "s"}`}
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
