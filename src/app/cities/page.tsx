import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { friendCities } from "@/lib/citySpots";
import { cityKey, cityTiles } from "@/lib/homeV2";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
import { nearestFirst, viewerLocation } from "@/lib/nearby";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cities" };

const cityHref = (t: { city: string; country?: string }) => `/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}) }).toString()}`;

type Row = { city: string; country: string; spots: number; guides?: number; who?: string };

/**
 * Every city on MyGuide, in three plain groups (13 Oct 2026): yours, ones your friends know that
 * you don't, then everyone else's. Each group: the city you're in (or nearest) first, then most spots.
 */
export default async function CitiesPage() {
  const user = await getCurrentUser();
  const [{ byCity }, known, here] = await Promise.all([cityTiles(user?.id), friendCities(user?.id, undefined, { withOwn: true }), viewerLocation()]);
  // Where only you have places, the city page shows everyone's spots with yours: count the same.
  const all = known.map((c) => (c.friends.length ? c : { ...c, spots: Math.max(c.spots, byCity.get(cityKey(c.city))?.spots ?? 0) }));
  const knownKeys = new Set(all.map((c) => cityKey(c.city)));
  const friendsLabel = (n: number) => `${n} friend${n === 1 ? "" : "s"}`;
  const [mine, friends, rest] = await Promise.all([
    nearestFirst(all.filter((c) => c.mine > 0).map<Row>((c) => ({ ...c, who: c.friends.length ? `you + ${friendsLabel(c.friends.length)}` : "you" })), here),
    nearestFirst(all.filter((c) => c.mine === 0 && c.friends.length > 0).map<Row>((c) => ({ ...c, who: c.friends.length === 1 ? c.friends[0].displayName.split(" ")[0] : friendsLabel(c.friends.length) })), here),
    nearestFirst([...byCity.values()].filter((t) => !knownKeys.has(cityKey(t.city))).map<Row>((t) => ({ city: t.city, country: t.country, spots: t.spots, guides: t.guides })), here),
  ]);
  const near = new Set([mine.nearKey, friends.nearKey, rest.nearKey].filter(Boolean) as string[]);
  const rows = [...mine.items, ...friends.items, ...rest.items];
  const photos = await cityPhotosFor(
    rows.map((c) => c.city),
    new Map(rows.filter((c) => c.country).map((c) => [cityPhotoKey(c.city), c.country])),
  );
  const thumb = (city: string) => {
    const p = photos.get(cityPhotoKey(city));
    // eslint-disable-next-line @next/next/no-img-element
    if (p?.url) return <img src={p.url} alt="" className="w-11 h-11 rounded-[10px] shrink-0 object-cover bg-cream-deep" loading="lazy" />;
    return <span className="w-11 h-11 rounded-[10px] shrink-0 bg-gradient-to-br from-terracotta-soft to-terracotta" />;
  };
  const group = (title: string, sub: string | null, items: Row[]) =>
    items.length > 0 && (
      <section className="flex flex-col gap-2.5">
        <div className="px-1">
          <h2 className="font-display text-[22px]">{title}</h2>
          {sub && <p className="text-[13px] text-ink-muted">{sub}</p>}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {items.map((c) => (
            <Link key={c.city} href={cityHref(c)} className="flex items-center gap-2.5 rounded-2xl border border-line/80 bg-paper p-2 hover:border-terracotta-soft">
              {thumb(c.city)}
              <span className="min-w-0">
                <span className="block font-semibold text-[14.5px] truncate">{c.city}</span>
                <span className="block text-[12px] text-ink-muted truncate">
                  {[near.has(cityKey(c.city)) ? "Near you" : "", c.spots || !c.guides ? `${c.spots} spot${c.spots === 1 ? "" : "s"}` : `${c.guides} guide${c.guides === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </span>
                {c.who && <span className="block text-[12px] text-ink-muted truncate">{c.who}</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>
    );
  return (
    <AppShell>
      <TopBar back="/" title="Cities" avatarUser={user ? toPublicUser(user) : null} />
      <main className="px-4 pt-2 pb-8 flex flex-col gap-7">
        {group("Your cities", "Where you have places.", mine.items)}
        {group("Cities your friends know", "Where people you follow have spots and you don\u2019t yet.", friends.items)}
        {group(mine.items.length || friends.items.length ? "More on MyGuide" : "Cities on MyGuide", mine.items.length || friends.items.length ? "Everyone else\u2019s cities, most spots first." : null, rest.items)}
      </main>
    </AppShell>
  );
}
