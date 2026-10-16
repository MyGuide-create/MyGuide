import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { PlaceTile } from "@/components/PlaceTile";
import { EmptyState, LinkButton } from "@/components/ui";
import { deleteTrip } from "@/lib/actions/trips";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, places, trips } from "@/lib/db/schema";
import { planTrip } from "@/lib/guides";
import { placeArea } from "@/lib/places/neighbourhood";
import { formatTripDates, titleSize } from "@/lib/utils";
import { isReusable } from "@/lib/reuse";
import { ForkIcon } from "@/components/Icons";
import { AskForGuideButton } from "@/components/AskForGuide";
import { acceptedFollowingIds, citySpots, type CitySpot } from "@/lib/citySpots";
import { capRuns, friendsThenEveryone } from "@/lib/fill";

export const dynamic = "force-dynamic";
/** Spots shown on a trip before "All N spots": friends' first, then everyone's. */
const TRIP_SPOTS = 8;

/** "Yara", "Yara & 2 others", "3 people recommend it". */
function whoRecommends(sp: CitySpot, viewerId: string, following: Set<string>): string {
  const rs = sp.recommenders.filter((r) => r.user.id !== viewerId);
  const friends = rs.filter((r) => following.has(r.user.id));
  const lead = friends[0] ?? rs[0];
  if (!lead) return "You";
  const name = lead.user.displayName.split(" ")[0];
  return rs.length === 1 ? name : friends.length ? `${name} & ${rs.length - 1} other${rs.length === 2 ? "" : "s"}` : `${rs.length} people recommend it`;
}
export const metadata = { title: "Trip" };

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}`);
  const db = await getDb();
  const trip = await db.query.trips.findFirst({ where: and(eq(trips.id, id), eq(trips.userId, user.id)) });
  if (!trip) notFound();
  const [plan, following] = await Promise.all([planTrip(user.id, trip.city), acceptedFollowingIds(user.id)]);
  // Friends' spots lead, the same as the city page (which has the map, filters and everything else).
  // Friends first, then everyone else's on MyGuide to fill up to TRIP_SPOTS (labelled separately).
  const friendSpots = following.length ? await citySpots({ city: trip.city, viewerId: user.id, ownerIds: following }) : [];
  const allSpots = await citySpots({ city: trip.city, viewerId: user.id });
  const { friends: topFriends, fill: topEveryone } = friendsThenEveryone(
    friendSpots,
    capRuns(allSpots.filter((s) => s.recommenders.some((r) => r.user.id !== user.id)), (s) => s.recommenders[0].user.id),
    TRIP_SPOTS,
    (s) => s.key,
  );
  const spots = allSpots;
  const followingSet = new Set(following);
  const cityPage = `/city?${new URLSearchParams({ name: trip.city, ...(trip.country ? { country: trip.country } : {}) }).toString()}`;
  const dates = formatTripDates(trip.startDate, trip.endDate);
  const nothing = !spots.length && !plan.savedGuides.length && !plan.favourites.length && !plan.fromFollowing.length && !plan.more.length;
  const remove = deleteTrip.bind(null, trip.id);
  const tripGuide = trip.guideId ? await db.query.guides.findFirst({ where: eq(guides.id, trip.guideId) }) : undefined;
  const tripGuideCount = tripGuide ? (await db.select({ id: places.id }).from(places).where(eq(places.guideId, tripGuide.id))).length : 0;
  const combinable = [...plan.savedGuides, ...plan.fromFollowing, ...plan.more].filter((c) => isReusable(c.guide) && c.guide.id !== trip.guideId).length;

  return (
    <AppShell>
      <TopBar back="/trips" title={trip.city} avatarUser={toPublicUser(user)} />
      <div className="px-4 pt-4 pb-8 flex flex-col gap-7">
        <div className="px-1">
          <h1 className="font-display text-[34px] leading-none">{trip.city}</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">{[trip.country, dates].filter(Boolean).join(" · ") || "Everything for your trip, in one place"}</p>
        </div>

        {topFriends.length > 0 && (
          <Section title="Spots your friends recommend" count={friendSpots.length}>
            <ul className="flex flex-col gap-2">
              {topFriends.map((sp) => (
                <PlaceLine key={sp.key} href={`/g/${sp.recommenders[0].guideSlug}/p/${sp.recommenders[0].placeId}`} place={sp.place} sub={whoRecommends(sp, user.id, followingSet)} />
              ))}
            </ul>
          </Section>
        )}
        {topEveryone.length > 0 && (
          <Section title={topFriends.length ? "More from MyGuide" : `Popular in ${trip.city} on MyGuide`} count={topEveryone.length}>
            <ul className="flex flex-col gap-2">
              {topEveryone.map((sp) => (
                <PlaceLine key={sp.key} href={`/g/${sp.recommenders[0].guideSlug}/p/${sp.recommenders[0].placeId}`} place={sp.place} sub={whoRecommends(sp, user.id, followingSet)} />
              ))}
            </ul>
          </Section>
        )}
        {spots.length > 0 && (
          <LinkButton href={cityPage} variant="outline" className="-mt-3 w-full">
            {spots.length > TRIP_SPOTS ? `All ${spots.length} spots, with the map` : `Open ${trip.city}, with the map`}
          </LinkButton>
        )}

        {tripGuide && (
          <Link href={`/g/${tripGuide.slug}`} className="flex items-center gap-3 rounded-2xl border border-terracotta-soft bg-terracotta-tint/50 px-4 py-3.5 hover:border-terracotta">
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-terracotta-deep">Your trip guide</span>
              <span className="block font-display leading-tight break-words" style={{ fontSize: titleSize(tripGuide.title, 22) }}>{tripGuide.title}</span>
              <span className="block text-[12px] text-ink-muted">{tripGuideCount} {tripGuideCount === 1 ? "place" : "places"} · {tripGuide.publishedAt && tripGuide.visibility === "public" ? "published" : "private until you publish"}</span>
            </span>
            <span className="text-terracotta text-[13px] font-medium shrink-0">Open →</span>
          </Link>
        )}

        {combinable > 0 && (
          <Link href={`/trips/${trip.id}/combine`} className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3.5 hover:border-terracotta-soft">
            <span className="w-10 h-10 rounded-full bg-cream-deep flex items-center justify-center shrink-0 text-terracotta"><ForkIcon size={18} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-semibold">{tripGuide ? "Add places from more guides" : "Combine guides into your own"}</span>
              <span className="block text-[12px] text-ink-muted">Pick a few {trip.city} guides, keep the places you want, and get one guide for your trip.</span>
            </span>
          </Link>
        )}

        {nothing && (
          <EmptyState
            title={`No ${trip.city} spots yet`}
            body="Nobody you can see has recommended any. Ask friends who know it for their spots — they come straight to you."
            action={<AskForGuideButton city={{ city: trip.city, country: trip.country }} label={`Ask friends for ${trip.city} spots`} variant="primary" size="md" />}
          />
        )}

        {plan.savedGuides.length > 0 && (
          <Section title="Guides you saved" count={plan.savedGuides.length}>
            <div className="flex flex-col gap-4">{plan.savedGuides.map((c) => <GuideCard key={c.guide.id} data={c} />)}</div>
          </Section>
        )}

        {plan.favourites.length > 0 && (
          <Section title="Saved" count={plan.favourites.length}>
            <ul className="flex flex-col gap-2">
              {plan.favourites.map(({ place, guide }) => (
                <PlaceLine key={place.id} href={`/g/${guide.slug}/p/${place.id}`} place={place} sub={`from ${guide.title}`} />
              ))}
            </ul>
          </Section>
        )}

        {plan.topPlaces.length > 0 && (
          <Section title="Most loved by MyGuide readers" count={plan.topPlaces.length}>
            <ul className="flex flex-col gap-2">
              {plan.topPlaces.map((t) => (
                <PlaceLine
                  key={t.place.id}
                  href={`/g/${t.guide.slug}/p/${t.place.id}`}
                  place={t.place}
                  sub={[t.favourites ? `${t.favourites} favourite${t.favourites === 1 ? "" : "s"}` : null, t.loved ? `${t.loved} loved it` : null].filter(Boolean).join(" · ")}
                />
              ))}
            </ul>
          </Section>
        )}

        {plan.fromFollowing.length > 0 && (
          <Section title="From people you follow" count={plan.fromFollowing.length}>
            <div className="flex flex-col gap-4">{plan.fromFollowing.map((c) => <GuideCard key={c.guide.id} data={c} />)}</div>
          </Section>
        )}

        {plan.more.length > 0 && (
          <Section title={plan.fromFollowing.length ? "More guides" : `Guides to ${trip.city}`} count={plan.more.length}>
            <div className="flex flex-col gap-4">{plan.more.map((c) => <GuideCard key={c.guide.id} data={c} />)}</div>
          </Section>
        )}

        <form action={remove} className="flex justify-center">
          <button type="submit" className="text-[12px] text-ink-faint hover:text-danger">Delete this trip</button>
        </form>
      </div>
    </AppShell>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-1 flex items-baseline gap-2 border-b border-line pb-1.5 mb-3">
        <span className="font-display text-[22px] leading-none">{title}</span>
        <span className="text-[12px] text-ink-faint tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function PlaceLine({ href, place, sub }: { href: string; place: Parameters<typeof PlaceTile>[0]["place"] & { address: string; city: string; country: string }; sub: string }) {
  return (
    <li>
      <Link href={href} className="flex gap-3 items-center rounded-2xl border border-line/70 bg-paper p-2.5 hover:border-terracotta-soft">
        <PlaceTile place={place} size={52} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[14px] truncate">{place.name}</span>
          <span className="block text-[11.5px] text-ink-muted truncate">{[place.category, placeArea(place)].filter(Boolean).join(" · ")}</span>
          {sub && <span className="block text-[11.5px] text-ink-faint truncate">{sub}</span>}
        </span>
      </Link>
    </li>
  );
}
