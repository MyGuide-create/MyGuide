import { RemovableTrip } from "@/components/RemovableTrip";
import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { AppShell, Wordmark } from "@/components/AppShell";
import { GoingSomewhere } from "@/components/GoingSomewhere";
import { GuideCover } from "@/components/GuideCover";
import { AskForGuideButton } from "@/components/AskForGuide";
import { PlaceTile } from "@/components/PlaceTile";
import { SaveButton } from "@/components/SaveButton";
import { SendSpotsButton } from "@/components/SendSpotsButton";
import { Avatar, LinkButton, cx } from "@/components/ui";
import { getCurrentUser, toPublicUser, type PublicUser } from "@/lib/auth";
import { acceptedFollowingIds, friendCities, loadRecommendations, ownSpotKeys, spotKey } from "@/lib/citySpots";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
import type { CityPhoto } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { savedPlaces } from "@/lib/db/schema";
import { listFeed, peopleToFollow, type GuideCard } from "@/lib/guides";
import { pickSpotlight, reasonLine, suggestPeople } from "@/lib/suggest";
import { SpotlightCard } from "@/components/SpotlightCard";
import { cityKey, cityTiles, everyoneFeed, feedOwner, homeFeed, nameList, nextTrip, wantedGuides, type FeedEntry } from "@/lib/homeV2";
import { capRuns } from "@/lib/fill";
import { HomeScreenNudge } from "@/components/HomeScreenNudge";
import { pushPublicKey } from "@/lib/push";
import { userVisits } from "@/lib/db/schema";
import { nearestFirst, nearestKnownCity, viewerLocation } from "@/lib/nearby";
import { FollowPill } from "@/components/FollowPill";
import { ClapBar } from "@/components/ClapBar";
import { loadClaps } from "@/lib/claps";
import { clapKey, spotsTarget, type ClapSummary } from "@/lib/clapTargets";
import { placeArea } from "@/lib/places/neighbourhood";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const cityHref = (t: { city: string; country?: string }, friend?: string) =>
  `/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}), ...(friend ? { friend } : {}) }).toString()}`;
const first = (u: { displayName: string }) => u.displayName.split(" ")[0];
const FEED_DAYS = 45;
/** Home feed: about this many items, friends' first, the rest from everyone ("New on MyGuide"). */
const FEED_TARGET = 15;
/** City tiles before "Explore more cities": friends' cities first, then the most active on MyGuide. */
const CITY_TILES = 8;
/** "Your cities": all of them, up to this many. */
const MAX_OWN_TILES = 14;
/** "Cities your friends know": up to this many, then "All cities". */
const FRIEND_TILES = 12;

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
  // Two rows (13 Oct 2026): your cities, then cities your friends know that you don't (topped up
  // with the most active cities on MyGuide). In each, the city you're in or nearest goes first,
  // then most spots. Where only you have places, the city page lists everyone's spots with yours,
  // so the tile counts the same (everyone's ∪ yours).
  const here = await viewerLocation();
  // Opened MyGuide from its home-screen icon at least once: they have it, so no reminder card.
  const hasIcon = user ? (await (await getDb()).select({ d: userVisits.day }).from(userVisits).where(and(eq(userVisits.userId, user.id), eq(userVisits.standalone, true))).limit(1)).length > 0 : true;
  const known = (user ? await friendCities(user.id, recs, { withOwn: true }) : []).map((c) =>
    c.friends.length ? c : { ...c, spots: Math.max(c.spots, byCity.get(cityKey(c.city))?.spots ?? 0) },
  );
  const [mineRow, friendsRow] = await Promise.all([
    nearestFirst(known.filter((c) => c.mine > 0), here),
    nearestFirst(known.filter((c) => c.mine === 0 && c.friends.length > 0), here),
  ]);
  const myCities = mineRow.items.slice(0, MAX_OWN_TILES);
  const friendsCities = friendsRow.items.slice(0, FRIEND_TILES);
  const knownKeys = new Set(known.map((c) => cityKey(c.city)));
  const popularRow = await nearestFirst(moreCities.filter((t) => !knownKeys.has(cityKey(t.city))), here);
  const popular = popularRow.items;
  // Few friends' cities (or none): the most active cities on MyGuide fill the row up to CITY_TILES.
  const popularTiles = popular.slice(0, Math.max(0, CITY_TILES - friendsCities.length));
  const moreToExplore = popular.length - popularTiles.length;
  // Each row's nearest city leads it, labelled "Near you".
  const nearKeys = new Set([mineRow.nearKey, friendsRow.nearKey, popularTiles.length ? popularRow.nearKey : null].filter(Boolean) as string[]);
  const cities = [...myCities, ...friendsCities];
  // New here (no places yet): "Your Dubai — add your go-to spots", for the city they're in.
  const startCity = user && myCities.length === 0 ? nearestKnownCity(here) : null;
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
    [...(trip ? [trip.trip.city] : []), ...(startCity ? [startCity.city] : []), ...cities.map((c) => c.city), ...popularTiles.map((t) => t.city)],
    new Map([...(startCity ? [startCity] : []), ...cities, ...popularTiles].filter((c) => c.country).map((c) => [cityPhotoKey(c.city), c.country])),
  );
  const photoFor = (city: string) => photos.get(cityPhotoKey(city));
  const cityOf = new Map(known.map((c) => [cityKey(c.city), c]));
  const tripCity = trip ? cityOf.get(cityKey(trip.trip.city)) : undefined;

  // New from friends: their spots, spots several friends now share, and newly published guides.
  // Then "New on MyGuide": everyone else's, filling up to FEED_TARGET (all of it when you follow nobody).
  const feed = capRuns(homeFeed(recs, followingGuides, FEED_DAYS), feedOwner).slice(0, FEED_TARGET);
  const fillCount = feed.length >= FEED_TARGET ? 0 : Math.max(FEED_TARGET - feed.length, 4);
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

  const signupNext = (next: string, why?: string) => `/signup?next=${encodeURIComponent(next)}${why ? `&why=${why}` : ""}`;

  const tripWhen = !trip
    ? ""
    : trip.daysAway === null
      ? "Your trip"
      : trip.daysAway <= 0
        ? "Your trip · now"
        : trip.daysAway === 1
          ? "Your trip · tomorrow"
          : trip.daysAway < 14
            ? `Your trip · in ${trip.daysAway} days`
            : `Your trip · in ${Math.round(trip.daysAway / 7)} weeks`;

  const help = wanted.help;
  const wishIds = (w: NonNullable<typeof help>) => w.others.map((p) => p.wish.id);

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <Wordmark />
          {user ? (
            <Link href="/me" aria-label="Your profile"><Avatar user={user} size={34} /></Link>
          ) : (
            <span className="flex items-center gap-3">
              <Link href="/login" className="text-[14px] font-medium text-ink-muted hover:text-ink">Log in</Link>
              <LinkButton href="/signup" size="sm">Sign up</LinkButton>
            </span>
          )}
        </div>
        <h1 className="mt-5 font-display text-[34px] leading-[1.05]">
          {user ? `Going somewhere, ${first(user)}?` : "Going somewhere?"}
        </h1>
        {!user && <p className="mt-1.5 text-[14.5px] text-ink-muted">The spots your friends love, in every city they know.</p>}
        <div className="mt-4">
          <GoingSomewhere />
        </div>
      </header>
      {user && <HomeScreenNudge hasIcon={hasIcon} publicKey={pushPublicKey()} />}

      <main className="pb-6 flex flex-col">
        {sp.deleted === "1" && <p className="mx-4 mt-3 rounded-2xl bg-sage-tint px-4 py-3 text-[13px]">Your account has been deleted. Thanks for trying MyGuide.</p>}

        {trip && (
          <RemovableTrip key={trip.trip.id} tripId={trip.trip.id} city={trip.trip.city} tone="dark" className="mx-4 mt-4 rounded-[20px]">
            <Link href={cityHref({ city: trip.trip.city, country: trip.trip.country })} className="flex items-center gap-3.5 rounded-[20px] bg-ink text-cream p-3 pr-10">
              <CityImage photo={photoFor(trip.trip.city)} className="w-16 h-16 rounded-xl" />
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-cream-deep">{tripWhen}</span>
                <span className="font-display text-[22px] leading-tight truncate">{trip.trip.city}</span>
                {tripCity ? (
                  <span className="flex items-center gap-2 text-[13px] text-cream-deep">
                    <Faces users={tripCity.friends} ring="ring-ink" />
                    {tripCity.spots} spot{tripCity.spots === 1 ? "" : "s"}
                    {tripCity.friends.length
                      ? ` from ${tripCity.mine ? "you and " : ""}${tripCity.friends.length} friend${tripCity.friends.length === 1 ? "" : "s"}`
                      : " of yours"}
                  </span>
                ) : (
                  <span className="text-[13px] text-cream-deep">See what people recommend there</span>
                )}
              </span>
              <span aria-hidden className="pr-1 text-[20px]">›</span>
            </Link>
          </RemovableTrip>
        )}

        {user && myCities.length === 0 && (
          <CityRow title="Your cities" sub="The spots you'd send a friend to.">
            <StartTile
              href="/record"
              photo={startCity ? photoFor(startCity.city) : undefined}
              title={startCity ? `Your ${startCity.city}` : "Your city"}
              line="Add your go-to spots: where you eat, drink, work out, unwind"
              cta="Add your first spot"
            />
            <AddCityTile first />
          </CityRow>
        )}
        {myCities.length > 0 && (
          <CityRow title="Your cities" all>
            {myCities.map((c) => (
              <CityTile key={c.city} href={cityHref(c)} city={c.city} photo={photoFor(c.city)} near={nearKeys.has(cityKey(c.city))} spots={c.spots}>
                <Faces users={user ? [toPublicUser(user), ...c.friends] : c.friends} ring="ring-cream" />
                <span>{c.friends.length ? `you + ${c.friends.length}` : "you"}</span>
              </CityTile>
            ))}
            <AddCityTile />
          </CityRow>
        )}
        {fewFollows && peopleRow}
        {(friendsCities.length > 0 || popularTiles.length > 0) && (
          <CityRow title={friendsCities.length ? "Cities your friends know" : "Popular on MyGuide"} sub={friendsCities.length ? "Where people you follow have spots." : undefined} all={!myCities.length}>
            {friendsCities.map((c) => (
              <CityTile key={c.city} href={cityHref(c)} city={c.city} photo={photoFor(c.city)} near={nearKeys.has(cityKey(c.city))} spots={c.spots}>
                <Faces users={c.friends} ring="ring-cream" />
                <span className="truncate">{c.friends.length === 1 ? first(c.friends[0]) : `${c.friends.length} friends`}</span>
              </CityTile>
            ))}
            {friendsCities.length > 0 && popularTiles.length > 0 && (
              <span className="shrink-0 w-[64px] h-[170px] flex items-center justify-center">
                <span className="[writing-mode:vertical-rl] rotate-180 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Popular on MyGuide</span>
              </span>
            )}
            {popularTiles.map((t) => (
              <CityTile key={t.city} href={cityHref(t)} city={t.city} photo={photoFor(t.city)} near={nearKeys.has(cityKey(t.city))} spots={t.spots} guides={t.guides} />
            ))}
            <Link href="/cities" className="shrink-0 w-[150px] h-[170px] rounded-2xl border-[1.5px] border-dashed border-cream-line flex flex-col items-center justify-center gap-1.5 text-center px-3">
              <span className="font-semibold text-[14px]">All cities</span>
              <span className="text-[12px] text-ink-muted">
                {moreToExplore > 0 ? (
                  <>
                    {popular.slice(popularTiles.length, popularTiles.length + 3).map((t) => t.city).join(", ")}
                    {moreToExplore > 3 ? ` +${moreToExplore - 3}` : ""}
                  </>
                ) : (
                  "Every city on MyGuide"
                )}
              </span>
            </Link>
          </CityRow>
        )}

        {spotlight && <SpotlightCard s={spotlight} reason={reasonLine(spotlight)} preview={previewSpotlight} />}
        {feed.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <h2 className="px-1 font-display text-[22px]">New from friends</h2>
            {feed.map((f) => <FeedCard key={feedKey(f)} f={f} savedIds={savedIds} signedIn={!!user} viewerId={user?.id} claps={clapsFor(f)} ownKeys={ownKeys} />)}
          </section>
        )}
        {!fewFollows && peopleRow}
        {everyone.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <div className="px-1">
              <h2 className="font-display text-[22px]">New on MyGuide</h2>
              <p className="text-[13px] text-ink-muted">{feed.length ? "More from people you don\u2019t follow yet." : "What people are recommending right now. Follow anyone whose taste you like."}</p>
            </div>
            {everyone.map((f) => <FeedCard key={feedKey(f)} f={f} savedIds={savedIds} signedIn={!!user} viewerId={user?.id} claps={clapsFor(f)} ownKeys={ownKeys} followable />)}
          </section>
        )}

        <section className="px-4 pt-8 flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-[22px]">{help || wanted.list.some((w) => w.known.length > 0) ? "Friends heading somewhere" : "Where people are going"}</h2>
            <Link href="/wishes" className="text-[14px] font-medium text-terracotta-deep">See all</Link>
          </div>
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
          {wanted.list.length > 0 && (
            <ul className="flex flex-col">
              {wanted.list.map((w, i) => {
                const lead = w.known[0] ?? w.others[0];
                const extra = w.others.length - 1;
                const friend = w.known.length > 0;
                // Label where friends' wishes end and other people's begin.
                const startsOthers = !friend && (i === 0 ? !!help : wanted.list[i - 1].known.length > 0);
                return (
                  <li key={w.group.city} className="flex flex-col">
                    {startsOthers && <span className="pt-3 pb-1 px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Others on MyGuide</span>}
                  <span className="flex items-center gap-3 py-2.5 border-b border-line/80">
                    <Link href={`/u/${lead.user.username}`} className="shrink-0"><Avatar user={lead.user} size={40} /></Link>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[15px] truncate">
                          {first(lead.user)}
                          {extra > 0 ? ` +${extra}` : ""} · {w.group.city}
                        </span>
                        {!friend && user && <FollowPill userId={lead.user.id} signedIn next="/" />}
                      </span>
                      <span className="block text-[12.5px] text-ink-muted">
                        {w.viewerSpots > 0 ? `Wants spots · you recommend ${w.viewerSpots} there` : cityOf.get(cityKey(w.group.city)) ? "Wants spots · your friends have some" : friend ? "Wants spots · nobody you follow has been yet" : "Wants spots"}
                      </span>
                    </span>
                    {w.viewerSpots > 0 ? (
                      <SendSpotsButton wishIds={w.others.map((p) => p.wish.id)} label="Send spots" />
                    ) : (
                      user && (
                        <AskForGuideButton
                          variant="outline"
                          size="sm"
                          forWish={{ id: lead.wish.id, city: lead.wish.city, country: lead.wish.country, userId: lead.user.id, name: lead.user.displayName }}
                          label="Pass it on"
                        />
                      )
                    )}
                  </span>
                  </li>
                );
              })}
            </ul>
          )}
          {!help && wanted.list.length === 0 && <p className="px-1 text-[14px] text-ink-muted">No one&apos;s asked for spots yet.</p>}
          <Link href={user ? `/u/${user.username}#wishes` : signupNext("/wishes")} className="self-start px-1 py-2 text-[14px] font-semibold text-ink">
            + Going somewhere? Ask friends for spots
          </Link>
        </section>

        <p className="mt-8 text-center text-[12px] text-ink-faint">
          Something broken or an idea? <Link href="/feedback?from=/" className="text-terracotta font-medium">Tell us</Link>
        </p>
      </main>
    </AppShell>
  );
}

function feedKey(f: FeedEntry): string {
  if (f.kind === "guide") return `g:${f.card.guide.id}`;
  if (f.kind === "overlap") return `o:${f.spot.key}`;
  return `s:${f.user.id}:${f.city}:${f.at.getTime()}`;
}

/**
 * A city's picture: its iconic photo (Unsplash, see lib/cityPhotos), else a warm tile. Never a
 * guide cover or place photo, which can be anything (a plate of steak for Dubai).
 */
function CityImage({ photo, className }: { photo?: CityPhoto; className?: string }) {
  if (photo?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo.url} alt="" className={cx("shrink-0 object-cover bg-cream-deep", className)} loading="lazy" />;
  }
  return <span className={cx("shrink-0 block bg-gradient-to-br from-terracotta-soft to-terracotta", className)} />;
}

/** A row of city tiles that scrolls sideways, with "All cities" in the header when `all`. */
function CityRow({ title, sub, all, children }: { title: string; sub?: string; all?: boolean; children: React.ReactNode }) {
  return (
    <section className="pt-8 flex flex-col gap-3">
      <div className="px-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[22px]">{title}</h2>
          {sub && <p className="text-[13px] text-ink-muted">{sub}</p>}
        </div>
        {all && (
          <Link href="/cities" className="shrink-0 pb-1 text-[13px] font-medium text-terracotta-deep">
            All cities →
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">{children}</div>
    </section>
  );
}

/** One city: picture, who knows it (children), and how many spots. */
function CityTile({ href, city, photo, near, spots, guides, children }: { href: string; city: string; photo?: CityPhoto; near?: boolean; spots: number; guides?: number; children?: React.ReactNode }) {
  return (
    <Link href={href} className="shrink-0 w-[150px] flex flex-col gap-2">
      <span className="relative block">
        <CityTileImage photo={photo} city={city} />
        {near && <span className="absolute left-2 top-2 rounded-full bg-paper/95 px-2 py-0.5 text-[11px] font-semibold text-ink">Near you</span>}
      </span>
      {children && <span className="px-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted min-w-0">{children}</span>}
      <span className={cx("px-0.5 text-[13px] font-semibold", !!children && "-mt-1")}>
        {spots || !guides ? `${spots} spot${spots === 1 ? "" : "s"}` : `${guides} guide${guides === 1 ? "" : "s"}`}
      </span>
    </Link>
  );
}

/** A city tile's picture with the name over a dark fade. */
function CityTileImage({ photo, city }: { photo?: CityPhoto; city: string }) {
  return (
    <span className="relative block">
      <CityImage photo={photo} className="h-[170px] w-full rounded-2xl" />
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 rounded-b-2xl bg-gradient-to-t from-black/50 to-transparent" />
      <span className="absolute left-3 bottom-2.5 right-2 font-display text-[20px] leading-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.45)] truncate">{city}</span>
    </span>
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
function FeedCard({ f, savedIds, signedIn, followable = false, viewerId, claps, ownKeys }: { f: FeedEntry; savedIds: Set<string>; signedIn: boolean; followable?: boolean; viewerId?: string; claps?: ClapSummary; ownKeys?: Set<string> }) {
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
          <Link href={`/g/${g.guide.slug}`} className="flex-1 min-w-0 text-[13.5px] leading-snug">
            <b className="font-semibold">{first(g.owner)}</b> published <b className="font-semibold">{g.guide.title}</b>
            <span className="block text-[12px] text-ink-muted">{[g.guide.city, timeAgo(f.at)].filter(Boolean).join(" · ")}</span>
          </Link>
          {followable && <FollowPill userId={g.owner.id} signedIn={signedIn} next="/" />}
        </span>
        <div className="px-3.5 pb-3 -mt-0.5">
          <ClapBar kind="guide" target={g.guide.id} ownerId={g.owner.id} ownerName={first(g.owner)} initial={claps} signedIn={signedIn} own={viewerId === g.owner.id} />
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
  return (
    <div className="rounded-2xl border border-line/80 bg-paper p-3.5 flex flex-col gap-2.5">
      <span className="flex items-center gap-2.5">
        <Link href={followable ? `/u/${f.user.username}` : cityHref({ city: f.city }, f.user.username)} className="shrink-0"><Avatar user={f.user} size={32} /></Link>
        <Link href={followable ? `/u/${f.user.username}` : cityHref({ city: f.city }, f.user.username)} className="flex-1 min-w-0 text-[13.5px] leading-snug">
          <b className="font-semibold">{followable ? f.user.displayName : first(f.user)}</b> recommended {one ? "a spot" : `${f.recs.length} spots`}{f.city ? <> in <b className="font-semibold">{f.city}</b></> : null}
          <span className="block text-[12px] text-ink-muted">{timeAgo(f.at)}</span>
        </Link>
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
          <span className="flex items-center gap-2">
            {viewerId !== f.user.id &&
              (yours(r0.place) ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1.5 text-[12.5px] font-medium text-sage">✓ One of your spots</span>
              ) : (
                <SaveButton placeId={r0.place.id} initial={savedIds.has(r0.place.id)} signedIn={signedIn} variant="pill" />
              ))}
            {f.city && <Link href={cityHref({ city: f.city })} className="inline-flex items-center h-9 px-3.5 rounded-full border border-line text-[13px] font-semibold">All {f.city} spots</Link>}
          </span>
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
      <ClapBar kind="spots" target={spotsTarget(f.user.id, f.city, f.at)} ownerId={f.user.id} ownerName={first(f.user)} city={f.city} count={f.recs.length} initial={claps} signedIn={signedIn} own={viewerId === f.user.id} />
    </div>
  );
}

/** New here: the first tile of "Your cities" — the city you're in, waiting for your spots. */
function StartTile({ href, photo, title, line, cta }: { href: string; photo?: CityPhoto; title: string; line: string; cta: string }) {
  return (
    <Link href={href} className="shrink-0 w-[220px] flex flex-col gap-2">
      <span className="relative block">
        <CityImage photo={photo} className="h-[170px] w-full rounded-2xl opacity-60" />
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/60 to-black/10" />
        <span className="absolute left-3 right-3 bottom-3 flex flex-col gap-1.5 text-white">
          <span className="font-display text-[22px] leading-tight drop-shadow-[0_1px_4px_rgb(0_0_0/0.45)]">{title}</span>
          <span className="text-[12px] leading-snug text-white/90">{line}</span>
          <span className="self-start mt-0.5 inline-flex items-center gap-1 rounded-full bg-paper text-ink px-3 py-1 text-[12.5px] font-semibold">+ {cta}</span>
        </span>
      </span>
    </Link>
  );
}

/** The last tile of "Your cities": add spots in another city you know — even one helps friends going there. */
function AddCityTile({ first = false }: { first?: boolean }) {
  return (
    <Link href="/record" className="shrink-0 w-[150px] flex flex-col gap-2">
      <span className="h-[170px] w-full rounded-2xl border-2 border-dashed border-cream-line bg-paper/60 flex flex-col items-center justify-center gap-2 px-3 text-center hover:border-terracotta-soft">
        <span className="w-10 h-10 rounded-full bg-terracotta-tint text-terracotta flex items-center justify-center text-[22px] leading-none">+</span>
        <span className="font-display text-[18px] leading-tight">{first ? "A city you know" : "Another city you know"}</span>
        <span className="text-[11.5px] leading-snug text-ink-muted">Even one spot helps a friend going there</span>
      </span>
    </Link>
  );
}
