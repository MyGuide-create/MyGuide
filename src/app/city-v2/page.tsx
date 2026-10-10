import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCover } from "@/components/GuideCover";
import { PlusIcon, SparkleIcon } from "@/components/Icons";
import { AskForGuideButton } from "@/components/AskForGuide";
import { EmptyState, LinkButton, cx } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { listFeed, type GuideCard } from "@/lib/guides";
import { guideSaveCounts, wantedGuides } from "@/lib/homeV2";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "City (preview)", robots: { index: false } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

/** Admin-only preview of the slim city page: friends' guides, then every guide for the city with a sort. */
export default async function CityV2Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) redirect("/");
  const sp = await searchParams;
  const city = one(sp.name).slice(0, 80);
  const country = one(sp.country).slice(0, 80);
  const lat = one(sp.lat);
  const lng = one(sp.lng);
  const sort = one(sp.sort) === "new" ? "new" : "saved";

  const [mine, everyone, wanted] = city
    ? await Promise.all([
        listFeed({ viewerId: user.id, scope: "following", city }),
        listFeed({ viewerId: user.id, scope: "public", city, limit: 100 }),
        wantedGuides(user.id, 50),
      ])
    : [[], [], { help: null, list: [] }];
  const saves = await guideSaveCounts(everyone.map((g) => g.guide.id));
  const all = [...everyone].sort((a, b) =>
    sort === "new"
      ? b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime()
      : (saves.get(b.guide.id) ?? 0) - (saves.get(a.guide.id) ?? 0) || b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime(),
  );
  const friendCount = new Set(mine.map((g) => g.owner.id)).size;
  const wish = [wanted.help, ...wanted.list].find((w) => w && w.group.city.trim().toLowerCase() === city.toLowerCase()) ?? null;

  const base = { name: city, ...(country ? { country } : {}), ...(lat && lng ? { lat, lng } : {}) };
  const sortHref = (s: "saved" | "new") => `/city-v2?${new URLSearchParams({ ...base, ...(s === "new" ? { sort: "new" } : {}) }).toString()}`;
  const startQs = new URLSearchParams({ city, ...(country ? { country } : {}), ...(lat && lng ? { lat, lng } : {}) }).toString();
  const startHref = `/create?${startQs}`;
  const tripHref = `/trips?city=${encodeURIComponent(city)}`;
  const askCity = { city, country, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null };

  return (
    <AppShell>
      <TopBar back="/home-v2" title={null} avatarUser={toPublicUser(user)} />
      <header className="px-5 pt-2 pb-4">
        <h1 className="font-display text-[38px] leading-[1.02]">{city || "Pick a city"}</h1>
        {city && (
          <p className="mt-1 text-[14px] text-ink-muted">
            {[country, all.length ? `${all.length} guide${all.length === 1 ? "" : "s"}` : "", friendCount ? `${friendCount} from friends` : ""].filter(Boolean).join(" · ")}
          </p>
        )}
        {city && (
          <div className="mt-4 flex gap-2.5">
            <LinkButton href={tripHref} className="flex-1">Plan a trip</LinkButton>
            {all.length > 0 && (
              <LinkButton href={startHref} variant="outline" className="flex-1">
                <PlusIcon size={15} /> Start a guide
              </LinkButton>
            )}
          </div>
        )}
      </header>

      <main className="pb-8 flex flex-col">
        {city && all.length === 0 && wish && (
          <div className="px-4 pb-4">
            <div className="rounded-[20px] bg-ink text-cream p-4 flex flex-col gap-3">
              <p className="font-display text-[21px] leading-snug">
                {wish.others.length} {wish.others.length === 1 ? "person wants" : "people want"} a {city} guide. Be the first to make one.
              </p>
              <LinkButton href={`/create?wish=${wish.others.map((p) => p.wish.id).join(",")}`} className="self-start">Make it for them</LinkButton>
            </div>
          </div>
        )}
        {city && all.length === 0 && (
          <div className="px-4">
            <EmptyState
              title={`No guides for ${city} yet`}
              body="Know someone who's been? Ask them to make you one. Or start your own and add places when you get there."
              action={
                <span className="flex flex-col items-center gap-3">
                  <LinkButton href={startHref}>
                    <PlusIcon size={15} /> Start a guide for {city}
                  </LinkButton>
                  <AskForGuideButton city={askCity} label="Ask a friend who knows it" variant="outline" size="md" />
                </span>
              }
            />
          </div>
        )}

        {mine.length > 0 && (
          <section className="pt-2 flex flex-col gap-3">
            <h2 className="px-5 font-display text-[22px]">From people you follow</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">
              {mine.map((g) => (
                <Link key={g.guide.id} href={`/g/${g.guide.slug}`} className="shrink-0 w-[220px] rounded-2xl border border-line/80 bg-paper overflow-hidden">
                  <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare className="h-[120px]" />
                  <span className="block p-3">
                    <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{g.guide.title}</span>
                    <span className="block mt-1 text-[12.5px] text-ink-muted">{g.owner.displayName.split(" ")[0]} · {g.placeCount} place{g.placeCount === 1 ? "" : "s"}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {all.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
              <h2 className="font-display text-[22px]">All {city} guides</h2>
              <div role="group" aria-label="Sort guides" className="flex rounded-full bg-cream-deep/70 p-[3px]">
                {(["saved", "new"] as const).map((s) => (
                  <Link
                    key={s}
                    href={sortHref(s)}
                    replace
                    scroll={false}
                    aria-current={sort === s ? "true" : undefined}
                    className={cx("px-3 py-1.5 rounded-full text-[13px]", sort === s ? "bg-ink text-cream font-semibold" : "text-ink")}
                  >
                    {s === "saved" ? "Most saved" : "Newest"}
                  </Link>
                ))}
              </div>
            </div>
            {all.map((g) => <GuideRow key={g.guide.id} g={g} meta={sort === "new" ? `Updated ${timeAgo(g.guide.updatedAt)}` : savedLabel(saves.get(g.guide.id) ?? 0)} />)}
          </section>
        )}

        {city && all.length > 0 && (
          <div className="px-4 pt-8">
            <div className="rounded-[20px] bg-sage-tint p-4 flex flex-col gap-2.5">
              <p className="font-display text-[20px]">Know {city} well?</p>
              {wish ? (
                <>
                  <p className="text-[14px] leading-snug">
                    {wish.others.length} {wish.others.length === 1 ? "person has" : "people have"} {city} on their wish list. Your guide would go straight to them.
                  </p>
                  <LinkButton href={`/create?wish=${wish.others.map((p) => p.wish.id).join(",")}`} className="self-start">Start a {city} guide</LinkButton>
                </>
              ) : (
                <>
                  <p className="text-[14px] leading-snug">Share what you know, or ask a friend who&apos;s been.</p>
                  <span className="flex flex-wrap gap-2.5">
                    <LinkButton href={startHref}>Start a {city} guide</LinkButton>
                    <AskForGuideButton city={askCity} label="Ask a friend" variant="outline" />
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {!city && (
          <p className="px-5 text-[14px] text-ink-muted">
            <SparkleIcon size={13} className="inline -mt-0.5" /> Pick a city from <Link href="/home-v2" className="text-terracotta-deep font-medium">Home</Link>.
          </p>
        )}
      </main>
    </AppShell>
  );
}

const savedLabel = (n: number) => (n === 0 ? "Not saved yet" : `Saved by ${n} ${n === 1 ? "person" : "people"}`);

function GuideRow({ g, meta }: { g: GuideCard; meta: string }) {
  return (
    <Link href={`/g/${g.guide.slug}`} className="flex items-center gap-3 rounded-2xl border border-line/80 bg-paper p-2.5 hover:border-terracotta-soft">
      <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare className="w-16 h-16 rounded-xl shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{g.guide.title}</span>
        <span className="block mt-0.5 text-[12.5px] text-ink-muted">{g.owner.displayName} · {g.placeCount} place{g.placeCount === 1 ? "" : "s"}</span>
        <span className="block mt-0.5 text-[12px] font-medium text-ink-muted">{meta}</span>
      </span>
    </Link>
  );
}
