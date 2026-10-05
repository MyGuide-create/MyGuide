import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { PinIcon, SparkleIcon } from "@/components/Icons";
import { Avatar, EmptyState, LinkButton } from "@/components/ui";
import { AddWishForm, GrantedLinks, SendGuideButton } from "@/components/WishList";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { listAllWishes } from "@/lib/wishes";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wanted guides" };

export default async function WishesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const cityFilter = typeof sp.city === "string" ? sp.city.trim() : "";
  const user = await getCurrentUser();
  const cities = await listAllWishes(user?.id, { city: cityFilter || undefined });
  const people = cities.reduce((n, c) => n + c.people.length, 0);

  return (
    <AppShell>
      <TopBar back="/search" title="Wanted guides" avatarUser={user ? toPublicUser(user) : null} />
      <main className="px-4 pt-4 pb-8 flex flex-col gap-4">
        <div className="px-1">
          <h1 className="font-display text-[30px] leading-[1.05]">Cities people want a guide to</h1>
          <p className="mt-2 text-[13.5px] text-ink-muted leading-relaxed">
            Know one of these places? Make the guide for them — it&apos;s shared with them the moment you publish. Already have one? Send it.
          </p>
        </div>

        {user ? (
          <details className="rounded-2xl border border-line bg-paper px-4 py-3 group">
            <summary className="cursor-pointer list-none flex items-center justify-between text-[14px] font-medium">
              <span className="inline-flex items-center gap-2"><SparkleIcon size={15} className="text-terracotta" /> Add a city to your wish list</span>
              <span className="text-terracotta text-[12.5px] group-open:hidden">Add</span>
            </summary>
            <div className="mt-3">
              <AddWishForm compact />
              <Link href={`/u/${user.username}#wishes`} className="mt-2 inline-block text-[12.5px] font-medium text-terracotta">Your wish list →</Link>
            </div>
          </details>
        ) : (
          <LinkButton href="/login?next=/wishes" size="sm" variant="outline" className="self-start">Log in to add your own wishes</LinkButton>
        )}

        {cityFilter && (
          <div className="px-1 flex items-center justify-between text-[12.5px]">
            <span className="text-ink-muted">Showing {cityFilter}</span>
            <Link href="/wishes" className="font-medium text-terracotta">All cities →</Link>
          </div>
        )}

        {cities.length === 0 ? (
          <EmptyState title={cityFilter ? `No wishes for ${cityFilter} yet` : "No wishes yet"} body="Add the cities you'd love a guide to — they show on your profile and here, so people who know them can make one for you." />
        ) : (
          <p className="px-1 -mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">{cities.length} {cities.length === 1 ? "city" : "cities"} · {people} {people === 1 ? "wish" : "wishes"}</p>
        )}

        {cities.map((c) => {
          const others = c.people.filter((p) => !p.isViewer);
          const makeFor = others.map((p) => p.wish.id).join(",");
          const names = others.map((p) => p.user.displayName.split(" ")[0]);
          const forWhom = names.length === 0 ? "" : names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} & ${names.length - 1} others`;
          return (
            <section key={c.city} className="rounded-[22px] border border-line bg-paper overflow-hidden">
              <div className="px-4 pt-4 pb-3 flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><PinIcon size={20} /></span>
                <div className="flex-1 min-w-0">
                  <h2 className="font-display text-[24px] leading-none truncate">{c.city}</h2>
                  <p className="mt-1 text-[12.5px] text-ink-muted">
                    {c.country ? `${c.country} · ` : ""}{c.people.length} {c.people.length === 1 ? "person wants" : "people want"} a guide
                  </p>
                </div>
              </div>
              <ul className="px-4 flex flex-col divide-y divide-line/70 border-t border-line/70">
                {c.people.map((p) => (
                  <li key={p.wish.id} className="py-2.5 flex items-start gap-3">
                    <Link href={`/u/${p.user.username}`} className="shrink-0"><Avatar user={p.user} size={34} /></Link>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] leading-snug">
                        <Link href={`/u/${p.user.username}`} className="font-semibold hover:underline">{p.isViewer ? "You" : p.user.displayName}</Link>
                        <span className="text-ink-faint"> · {timeAgo(p.wish.createdAt)}</span>
                      </div>
                      {p.wish.note && <div className="text-[12.5px] text-ink-muted italic leading-snug">{p.wish.note}</div>}
                      <GrantedLinks granted={p.granted} />
                    </div>
                    {!p.isViewer && user && (
                      <div className="shrink-0 self-center flex flex-col items-end gap-1">
                        <SendGuideButton wishId={p.wish.id} guides={p.viewerGuides} sent={p.viewerSent} wisherName={p.user.displayName.split(" ")[0]} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {others.length > 0 && (
                <div className="px-4 py-3 border-t border-line/70 bg-cream/40">
                  <LinkButton href={user ? `/create?wish=${makeFor}` : `/login?next=${encodeURIComponent("/wishes")}`} size="sm" className="w-full">
                    Make a {c.city} guide for {forWhom}
                  </LinkButton>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </AppShell>
  );
}
