import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { friendCities } from "@/lib/citySpots";
import { cityKey, cityTiles } from "@/lib/homeV2";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cities" };

const cityHref = (t: { city: string; country?: string }) => `/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}) }).toString()}`;

/** Every city on MyGuide: the ones your friends recommend spots in first, then the rest. */
export default async function CitiesPage() {
  const user = await getCurrentUser();
  const [{ byCity }, friends] = await Promise.all([cityTiles(user?.id), friendCities(user?.id, undefined, { withOwn: true })]);
  const friendKeys = new Set(friends.map((c) => cityKey(c.city)));
  const rest = [...byCity.values()].filter((t) => !friendKeys.has(cityKey(t.city))).sort((a, b) => b.spots - a.spots || b.guides - a.guides);
  const photos = await cityPhotosFor([...friends.map((c) => c.city), ...rest.map((t) => t.city)]);
  const thumb = (city: string) => {
    const p = photos.get(cityPhotoKey(city));
    // eslint-disable-next-line @next/next/no-img-element
    if (p?.url) return <img src={p.url} alt="" className="w-11 h-11 rounded-[10px] shrink-0 object-cover bg-cream-deep" loading="lazy" />;
    return <span className="w-11 h-11 rounded-[10px] shrink-0 bg-gradient-to-br from-terracotta-soft to-terracotta" />;
  };
  return (
    <AppShell>
      <TopBar back="/" title="Cities" avatarUser={user ? toPublicUser(user) : null} />
      <main className="px-4 pt-2 pb-8 flex flex-col gap-7">
        {friends.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="px-1 font-display text-[22px]">Your friends&apos; cities</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {friends.map((c) => {
                return (
                  <Link key={c.city} href={cityHref(c)} className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper p-2 hover:border-terracotta-soft">
                    {thumb(c.city)}
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
                  {thumb(t.city)}
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14.5px] truncate">{t.city}</span>
                    <span className="block text-[12px] text-ink-muted">{t.spots ? `${t.spots} spot${t.spots === 1 ? "" : "s"}` : `${t.guides} guide${t.guides === 1 ? "" : "s"}`}</span>
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
