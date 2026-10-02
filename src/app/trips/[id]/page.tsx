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
import { trips } from "@/lib/db/schema";
import { planTrip } from "@/lib/guides";
import { neighbourhood } from "@/lib/places/neighbourhood";
import { formatTripDates } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trip" };

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/trips/${id}`);
  const db = await getDb();
  const trip = await db.query.trips.findFirst({ where: and(eq(trips.id, id), eq(trips.userId, user.id)) });
  if (!trip) notFound();
  const plan = await planTrip(user.id, trip.city);
  const dates = formatTripDates(trip.startDate, trip.endDate);
  const nothing = !plan.favourites.length && !plan.fromFollowing.length && !plan.more.length;
  const remove = deleteTrip.bind(null, trip.id);

  return (
    <AppShell>
      <TopBar back="/trips" title={trip.city} avatarUser={toPublicUser(user)} />
      <div className="px-4 pt-4 pb-8 flex flex-col gap-7">
        <div className="px-1">
          <h1 className="font-display text-[34px] leading-none">{trip.city}</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">{[trip.country, dates].filter(Boolean).join(" · ") || "Your trip"}</p>
        </div>

        {nothing && (
          <EmptyState
            title={`No ${trip.city} guides yet`}
            body="Nobody you can see has published one. Ask a friend who knows it to make one — or start your own and fill it in as you go."
            action={<LinkButton href="/create" size="sm">Start a guide</LinkButton>}
          />
        )}

        {plan.favourites.length > 0 && (
          <Section title="Your favourites here" count={plan.favourites.length}>
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
          <span className="block text-[11.5px] text-ink-muted truncate">{[place.category, neighbourhood(place.address, place.city, place.country)].filter(Boolean).join(" · ")}</span>
          {sub && <span className="block text-[11.5px] text-ink-faint truncate">{sub}</span>}
        </span>
      </Link>
    </li>
  );
}
