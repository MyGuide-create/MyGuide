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
import { getCurrentUser, type PublicUser } from "@/lib/auth";
import { acceptedFollowingIds, friendCities, loadRecommendations } from "@/lib/citySpots";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
import type { CityPhoto } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { savedPlaces } from "@/lib/db/schema";
import { listFeed, type GuideCard } from "@/lib/guides";
import { cityKey, cityTiles, everyoneFeed, feedOwner, homeFeed, nameList, nextTrip, wantedGuides, type FeedEntry } from "@/lib/homeV2";
import { capRuns } from "@/lib/fill";
import { FollowPill } from "@/components/FollowPill";
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

  const [{ moreCities }, trip, wanted, recs, followingGuides] = await Promise.all([
    cityTiles(user?.id),
    user ? nextTrip(user.id) : Promise.resolve(null),
    wantedGuides(user?.id, 5),
    user ? loadRecommendations({ viewerId: user.id, ownerIds: followingIds }) : Promise.resolve([]),
    user ? listFeed({ viewerId: user.id, scope: "following", limit: 40 }) : Promise.resolve([] as GuideCard[]),
  ]);
  const cities = (user ? await friendCities(user.id, recs) : []).slice(0, CITY_TILES);
  // Then the most active cities on MyGuide (most spots) up to CITY_TILES.
  const friendCityKeys = new Set(cities.map((c) => cityKey(c.city)));
  const popular = moreCities.filter((t) => !friendCityKeys.has(cityKey(t.city))).sort((a, b) => b.spots - a.spots || b.guides - a.guides);
  const popularTiles = popular.slice(0, Math.max(0, CITY_TILES - cities.length));
  const moreToExplore = popular.length - popularTiles.length;
  const photos = await cityPhotosFor([...(trip ? [trip.trip.city] : []), ...cities.map((c) => c.city), ...popularTiles.map((t) => t.city)]);
  const photoFor = (city: string) => photos.get(cityPhotoKey(city));
  const cityOf = new Map(cities.map((c) => [cityKey(c.city), c]));
  const tripCity = trip ? cityOf.get(cityKey(trip.trip.city)) : undefined;

  // New from friends: their spots, spots several friends now share, and newly published guides.
  // Then "New on MyGuide": everyone else's, filling up to FEED_TARGET (all of it when you follow nobody).
  const feed = capRuns(homeFeed(recs, followingGuides, FEED_DAYS), feedOwner).slice(0, FEED_TARGET);
  const fillCount = feed.length >= FEED_TARGET ? 0 : Math.max(FEED_TARGET - feed.length, 4);
  const everyone = fillCount ? await everyoneFeed(user?.id, new Set([...(user ? [user.id] : []), ...followingIds]), { days: 30, limit: fillCount }) : [];
  const feedPlaceIds = [...feed, ...everyone].flatMap((f) => (f.kind === "spots" && f.recs.length === 1 ? [f.recs[0].place.id] : []));
  const savedIds = new Set<string>();
  if (user && feedPlaceIds.length) {
    const db = await getDb();
    for (const r of await db.select({ id: savedPlaces.placeId }).from(savedPlaces).where(and(eq(savedPlaces.userId, user.id), inArray(savedPlaces.placeId, feedPlaceIds)))) savedIds.add(r.id);
  }

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

      <main className="pb-6 flex flex-col">
        {sp.deleted === "1" && <p className="mx-4 mt-3 rounded-2xl bg-sage-tint px-4 py-3 text-[13px]">Your account has been deleted. Thanks for trying MyGuide.</p>}

        {trip && (
          <div className="px-4 pt-4">
            <Link href={cityHref({ city: trip.trip.city, country: trip.trip.country })} className="flex items-center gap-3.5 rounded-[20px] bg-ink text-cream p-3">
              <CityImage photo={photoFor(trip.trip.city)} className="w-16 h-16 rounded-xl" />
              <span className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-cream-deep">{tripWhen}</span>
                <span className="font-display text-[22px] leading-tight truncate">{trip.trip.city}</span>
                {tripCity ? (
                  <span className="flex items-center gap-2 text-[13px] text-cream-deep">
                    <Faces users={tripCity.friends} ring="ring-ink" />
                    {tripCity.spots} spot{tripCity.spots === 1 ? "" : "s"} from {tripCity.friends.length} friend{tripCity.friends.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-[13px] text-cream-deep">See what people recommend there</span>
                )}
              </span>
              <span aria-hidden className="pr-1 text-[20px]">›</span>
            </Link>
          </div>
        )}

        {user && cities.length === 0 && (
          <div className="mx-4 mt-6 rounded-2xl bg-cream-deep/50 px-4 py-3 text-[13.5px] leading-snug">
            Follow people you know and the cities they recommend spots in show up first.{" "}
            <Link href="/search" className="font-medium text-terracotta-deep">Find people</Link>
          </div>
        )}
        {(cities.length > 0 || popularTiles.length > 0) && (
          <section className="pt-8 flex flex-col gap-3">
            <h2 className="px-5 font-display text-[22px]">{cities.length ? "Your friends\u2019 cities" : "Popular on MyGuide"}</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">
              {cities.map((c) => (
                <Link key={c.city} href={cityHref(c)} className="shrink-0 w-[150px] flex flex-col gap-2">
                  <CityTileImage photo={photoFor(c.city)} city={c.city} />
                  <span className="px-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                    <Faces users={c.friends} ring="ring-cream" />
                    {c.friends.length > 3 && <span>+{c.friends.length - 3}</span>}
                  </span>
                  <span className="px-0.5 -mt-1 text-[13px] font-semibold">{c.spots} spot{c.spots === 1 ? "" : "s"}</span>
                </Link>
              ))}
              {cities.length > 0 && popularTiles.length > 0 && (
                <span className="shrink-0 w-[64px] h-[170px] flex items-center justify-center">
                  <span className="[writing-mode:vertical-rl] rotate-180 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Popular on MyGuide</span>
                </span>
              )}
              {popularTiles.map((t) => (
                <Link key={t.city} href={cityHref(t)} className="shrink-0 w-[150px] flex flex-col gap-2">
                  <CityTileImage photo={photoFor(t.city)} city={t.city} />
                  <span className="px-0.5 text-[13px] font-semibold">{t.spots ? `${t.spots} spot${t.spots === 1 ? "" : "s"}` : `${t.guides} guide${t.guides === 1 ? "" : "s"}`}</span>
                </Link>
              ))}
              <Link href="/cities" className="shrink-0 w-[150px] h-[170px] rounded-2xl border-[1.5px] border-dashed border-cream-line flex flex-col items-center justify-center gap-1.5 text-center px-3">
                <span className="font-semibold text-[14px]">Explore more cities</span>
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
            </div>
          </section>
        )}

        {feed.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <h2 className="px-1 font-display text-[22px]">New from friends</h2>
            {feed.map((f) => <FeedCard key={feedKey(f)} f={f} savedIds={savedIds} signedIn={!!user} />)}
          </section>
        )}
        {everyone.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <div className="px-1">
              <h2 className="font-display text-[22px]">New on MyGuide</h2>
              <p className="text-[13px] text-ink-muted">{feed.length ? "More from people you don\u2019t follow yet." : "What people are recommending right now. Follow anyone whose taste you like."}</p>
            </div>
            {everyone.map((f) => <FeedCard key={feedKey(f)} f={f} savedIds={savedIds} signedIn={!!user} followable />)}
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
function FeedCard({ f, savedIds, signedIn, followable = false }: { f: FeedEntry; savedIds: Set<string>; signedIn: boolean; followable?: boolean }) {
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
            <SaveButton placeId={r0.place.id} initial={savedIds.has(r0.place.id)} signedIn={signedIn} variant="pill" />
            {f.city && <Link href={cityHref({ city: f.city })} className="inline-flex items-center h-9 px-3.5 rounded-full border border-line text-[13px] font-semibold">All {f.city} spots</Link>}
          </span>
        </>
      ) : (
        <span className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {f.recs.slice(0, 8).map((r) => (
            <Link key={r.place.id} href={`/g/${r.guide.slug}/p/${r.place.id}`} className="shrink-0 w-[118px] flex flex-col gap-1.5">
              <PlaceTile place={r.place} size={118} />
              <span className="text-[13px] font-semibold leading-tight line-clamp-2">{r.place.name}</span>
              <span className="-mt-1 text-[11.5px] text-ink-muted truncate">{[r.place.category, placeArea(r.place)].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </span>
      )}
    </div>
  );
}
