import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCover } from "@/components/GuideCover";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { friendCities } from "@/lib/citySpots";
import { cityKey, cityTiles } from "@/lib/homeV2";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cities" };

const cityHref = (t: { city: string; country?: string }) => `/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}) }).toString()}`;

/** Every city on MyGuide: the ones your friends recommend spots in first, then the rest. */
export default async function CitiesPage() {
  const user = await getCurrentUser();
  const [{ byCity }, friends] = await Promise.all([cityTiles(user?.id), friendCities(user?.id)]);
  const friendKeys = new Set(friends.map((c) => cityKey(c.city)));
  const rest = [...byCity.values()].filter((t) => !friendKeys.has(cityKey(t.city))).sort((a, b) => b.guides - a.guides);
  return (
    <AppShell>
      <TopBar back="/" title="Cities" avatarUser={user ? toPublicUser(user) : null} />
      <main className="px-4 pt-2 pb-8 flex flex-col gap-7">
        {friends.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="px-1 font-display text-[22px]">Your friends&apos; cities</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {friends.map((c) => {
                const t = byCity.get(cityKey(c.city));
                return (
                  <Link key={c.city} href={cityHref(c)} className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper p-2 hover:border-terracotta-soft">
                    {t ? <GuideCover guide={t.cover.guide} ownerUsername={t.cover.owner.username} bare thumb className="w-11 h-11 rounded-[10px] shrink-0" /> : <span className="w-11 h-11 rounded-[10px] shrink-0 bg-gradient-to-br from-terracotta-soft to-terracotta" />}
                    <span className="min-w-0">
                      <span className="block font-semibold text-[14.5px] truncate">{c.city}</span>
                      <span className="block text-[12px] text-ink-muted">{c.spots} spot{c.spots === 1 ? "" : "s"} · {c.friends.length} friend{c.friends.length === 1 ? "" : "s"}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        {rest.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="px-1 font-display text-[22px]">{friends.length ? "More cities on MyGuide" : "Cities on MyGuide"}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {rest.map((t) => (
                <Link key={t.city} href={cityHref(t)} className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper p-2 hover:border-terracotta-soft">
                  <GuideCover guide={t.cover.guide} ownerUsername={t.cover.owner.username} bare thumb className="w-11 h-11 rounded-[10px] shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14.5px] truncate">{t.city}</span>
                    <span className="block text-[12px] text-ink-muted">{t.guides} guide{t.guides === 1 ? "" : "s"}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
