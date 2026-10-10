import Link from "next/link";
import { redirect } from "next/navigation";
import { PreviewNotAllowed } from "@/components/PreviewGate";
import { AppShell, Wordmark } from "@/components/AppShell";
import { GoingSomewhere } from "@/components/GoingSomewhere";
import { GuideCover } from "@/components/GuideCover";
import { Avatar, LinkButton } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { listFeed } from "@/lib/guides";
import { cityTiles, nameList, nextTrip, wantedGuides, type CityTile } from "@/lib/homeV2";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home (preview)", robots: { index: false } };

const cityHref = (t: { city: string; country?: string }) =>
  `/city-v2?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}) }).toString()}`;

/** Admin-only preview of the city-first Home. The live Home (/) is unchanged. */
export default async function HomeV2Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fhome-v2");
  if (!isAdmin(user)) return <PreviewNotAllowed username={user.username} />;

  const [{ friendCities, moreCities, byCity }, trip, wanted, following] = await Promise.all([
    cityTiles(user.id),
    nextTrip(user.id),
    wantedGuides(user.id, 3),
    listFeed({ viewerId: user.id, scope: "following", limit: 40 }),
  ]);
  const latest = [...following].sort((a, b) => b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime()).slice(0, 3);
  const tripTile = trip ? byCity.get(trip.trip.city.trim().toLowerCase()) : undefined;
  const firstName = user.displayName.split(" ")[0];

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

  return (
    <AppShell>
      <div className="mx-4 mt-3 rounded-2xl bg-ochre-soft/50 px-4 py-2.5 text-[12.5px] leading-snug">
        <span className="font-semibold">Preview:</span> only admins see this page. Everyone else still gets the{" "}
        <Link href="/" className="font-medium text-terracotta-deep underline">current Home</Link>.
      </div>

      <header className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <Wordmark />
          <Link href="/me" aria-label="Your profile"><Avatar user={user} size={34} /></Link>
        </div>
        <h1 className="mt-5 font-display text-[34px] leading-[1.05]">Going somewhere, {firstName}?</h1>
        <div className="mt-4">
          <GoingSomewhere basePath="/city-v2" />
        </div>
      </header>

      <main className="pb-6 flex flex-col">
        {trip && (
          <div className="px-4 pt-4">
            <Link href={`/trips/${trip.trip.id}`} className="flex items-center gap-3.5 rounded-[20px] bg-ink text-cream p-3">
              {tripTile ? (
                <GuideCover guide={tripTile.cover.guide} ownerUsername={tripTile.cover.owner.username} bare className="w-16 h-16 rounded-xl shrink-0" />
              ) : (
                <span className="w-16 h-16 rounded-xl shrink-0 bg-terracotta" />
              )}
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-cream-deep">{tripWhen}</span>
                <span className="font-display text-[22px] leading-tight truncate">{trip.trip.city}</span>
                {tripTile && tripTile.friends > 0 && (
                  <span className="text-[13px] text-cream-deep">
                    {tripTile.friends} {tripTile.friends === 1 ? "friend has" : "friends have"} a guide there
                  </span>
                )}
              </span>
              <span aria-hidden className="pr-1 text-[20px]">›</span>
            </Link>
          </div>
        )}

        {friendCities.length > 0 && (
          <section className="pt-8 flex flex-col gap-3">
            <h2 className="px-5 font-display text-[22px]">Cities your friends know</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">
              {friendCities.slice(0, 12).map((t) => <CityTileCard key={t.city} t={t} />)}
            </div>
          </section>
        )}

        <section className="px-4 pt-8 flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-[22px]">Guides people want</h2>
            <Link href="/wishes" className="text-[14px] font-medium text-terracotta-deep">See all</Link>
          </div>
          {wanted.help && (() => {
            const w = wanted.help;
            const names = nameList(w.known.map((p) => p.user.displayName));
            const ids = w.others.map((p) => p.wish.id).join(",");
            return (
              <div className="rounded-[20px] bg-ink text-cream p-4 flex flex-col gap-3">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-cream-deep">You could help</span>
                <p className="font-display text-[21px] leading-snug">
                  {names} {w.known.length === 1 ? "wants" : "want"} a {w.group.city} guide.
                  {w.viewerPlaces > 0 && ` You've got ${w.viewerPlaces} place${w.viewerPlaces === 1 ? "" : "s"} there.`}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <LinkButton href={`/create?wish=${ids}`}>Make it for them</LinkButton>
                  {w.viewerGuides.length > 0 && (
                    <Link href={`/wishes?city=${encodeURIComponent(w.group.city)}`} className="inline-flex items-center h-11 px-4 rounded-full border border-cream/40 text-[14px] font-medium">
                      Send my guide
                    </Link>
                  )}
                </div>
              </div>
            );
          })()}
          {wanted.list.length > 0 && (
            <ul className="flex flex-col">
              {wanted.list.map((w) => {
                const tile = byCity.get(w.group.city.trim().toLowerCase());
                const extra = w.others.length - w.known.length;
                const who = w.known.length
                  ? `${nameList(w.known.map((p) => p.user.displayName))}${extra > 0 ? ` + ${extra} more` : ""} ${w.others.length === 1 ? "wants" : "want"} this`
                  : `${w.others.length} ${w.others.length === 1 ? "person wants" : "people want"} this`;
                return (
                  <li key={w.group.city} className="flex items-center gap-3 py-2.5 border-b border-line/80">
                    <span className="flex-1 min-w-0 px-1">
                      <span className="block font-semibold text-[15.5px]">{w.group.city}</span>
                      <span className="block text-[13px] text-ink-muted">{who} · {tile ? `${tile.guides} guide${tile.guides === 1 ? "" : "s"}` : "no guides yet"}</span>
                    </span>
                    <LinkButton href={`/create?wish=${w.others.map((p) => p.wish.id).join(",")}`} variant="outline" size="sm">Make it</LinkButton>
                  </li>
                );
              })}
            </ul>
          )}
          {!wanted.help && wanted.list.length === 0 && (
            <p className="px-1 text-[14px] text-ink-muted">No one&apos;s asked for a guide yet. Be the first.</p>
          )}
          <Link href={`/u/${user.username}#wishes`} className="self-start px-1 py-2 text-[14px] font-semibold text-ink">
            + Ask for a guide: add a city to your wish list
          </Link>
        </section>

        {moreCities.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-3">
            <h2 className="px-1 font-display text-[22px]">{friendCities.length ? "More cities on MyGuide" : "Cities on MyGuide"}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {moreCities.slice(0, 8).map((t) => (
                <Link key={t.city} href={cityHref(t)} className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper p-2 hover:border-terracotta-soft">
                  <GuideCover guide={t.cover.guide} ownerUsername={t.cover.owner.username} bare className="w-11 h-11 rounded-[10px] shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14.5px] truncate">{t.city}</span>
                    <span className="block text-[12px] text-ink-muted">{t.guides} guide{t.guides === 1 ? "" : "s"}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {latest.length > 0 && (
          <section className="px-4 pt-8 flex flex-col">
            <div className="flex items-baseline justify-between px-1 pb-1">
              <h2 className="font-display text-[22px]">From people you follow</h2>
              <Link href="/?scope=following" className="text-[14px] font-medium text-terracotta-deep">See all</Link>
            </div>
            {latest.map((g) => (
              <Link key={g.guide.id} href={`/g/${g.guide.slug}`} className="flex items-center gap-3 py-2.5 px-1 border-b border-line/80">
                <Avatar user={g.owner} size={40} />
                <span className="flex-1 min-w-0 text-[14px] leading-snug">
                  <span className="font-semibold">{g.owner.displayName.split(" ")[0]}</span>{" "}
                  {g.guide.publishedAt && g.guide.updatedAt.getTime() - g.guide.publishedAt.getTime() < 60_000 ? "published" : "updated"} {g.guide.title}
                  <span className="block text-[12.5px] text-ink-muted">
                    {g.guide.city ? `${g.guide.city} · ` : ""}{g.placeCount} place{g.placeCount === 1 ? "" : "s"} · {timeAgo(g.guide.updatedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        )}

        <p className="mt-8 text-center text-[12px] text-ink-faint">
          Preview of the new Home. <Link href="/feedback?from=/home-v2" className="text-terracotta font-medium">Note an idea</Link>
        </p>
      </main>
    </AppShell>
  );
}

function CityTileCard({ t }: { t: CityTile }) {
  return (
    <Link href={cityHref(t)} className="shrink-0 w-[150px] flex flex-col gap-2">
      <GuideCover guide={t.cover.guide} ownerUsername={t.cover.owner.username} bare className="h-[170px] rounded-2xl" />
      <span className="px-0.5">
        <span className="block font-display text-[19px] leading-tight truncate">{t.city}</span>
        <span className="block text-[12.5px] text-ink-muted">
          <span className="font-semibold text-ink">{t.friends} friend{t.friends === 1 ? "" : "s"}</span> · {t.guides} guide{t.guides === 1 ? "" : "s"}
        </span>
      </span>
    </Link>
  );
}
