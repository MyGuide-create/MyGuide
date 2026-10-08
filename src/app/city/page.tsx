import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { PlusIcon, SparkleIcon } from "@/components/Icons";
import { AskForGuideButton } from "@/components/AskForGuide";
import { EmptyState, LinkButton } from "@/components/ui";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { listFeed } from "@/lib/guides";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }) {
  const name = one((await searchParams).name);
  return { title: name ? `${name} guides` : "City" };
}

/** "Going somewhere?" lands here: guides for one city, people you follow first, with Plan a trip. */
export default async function CityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const city = one(sp.name).slice(0, 80);
  const country = one(sp.country).slice(0, 80);
  const lat = one(sp.lat);
  const lng = one(sp.lng);
  const user = await getCurrentUser();

  const [mine, everyone] = city
    ? await Promise.all([user ? listFeed({ viewerId: user.id, scope: "following", city }) : Promise.resolve([]), listFeed({ viewerId: user?.id, scope: "public", city })])
    : [[], []];
  const seen = new Set(mine.map((g) => g.guide.id));
  const others = everyone.filter((g) => !seen.has(g.guide.id));
  const total = mine.length + others.length;
  const askCity = { city, country, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null };

  const startQs = new URLSearchParams({ city, ...(country ? { country } : {}), ...(lat && lng ? { lat, lng } : {}) }).toString();
  const startHref = user ? `/create?${startQs}` : `/signup?next=${encodeURIComponent(`/create?${startQs}`)}&why=create`;
  const tripHref = user ? `/trips?city=${encodeURIComponent(city)}` : `/signup?next=${encodeURIComponent(`/trips?city=${city}`)}`;

  return (
    <AppShell>
      <TopBar back="/" title={null} avatarUser={user ? toPublicUser(user) : null} />
      <header className="px-5 pt-2 pb-4">
        <h1 className="font-display text-[38px] leading-[1.02]">{city || "Pick a city"}</h1>
        {country && <p className="mt-1 text-[15px] text-ink-muted">{country}</p>}
        {city && (
          <div className="mt-4 flex gap-2.5">
            <LinkButton href={tripHref} className="flex-1">Plan a trip</LinkButton>
            {total > 0 && (
              <LinkButton href={startHref} variant="outline" className="flex-1">
                <PlusIcon size={15} /> Start a guide
              </LinkButton>
            )}
          </div>
        )}
      </header>

      <main className="px-4 pb-6 flex flex-col gap-4">
        {city && total === 0 && (
          <EmptyState
            title={`No guides for ${city} yet`}
            body={`Know someone who's been? Ask them to make you one — on MyGuide or by WhatsApp. Or start your own and add places when you get there.`}
            action={
              <span className="flex flex-col items-center gap-3">
                <LinkButton href={startHref}>
                  <PlusIcon size={15} /> Start a guide for {city}
                </LinkButton>
                {user ? (
                  <AskForGuideButton city={askCity} label="Ask a friend who knows it" variant="outline" size="md" />
                ) : (
                  <Link href={`/signup?next=${encodeURIComponent(`/city?${new URLSearchParams(sp as Record<string, string>).toString()}`)}`} className="text-[13px] font-medium text-terracotta">
                    <SparkleIcon size={13} className="inline -mt-0.5" /> Sign up to ask a friend for a {city} guide
                  </Link>
                )}
              </span>
            }
          />
        )}

        {city && total > 0 && user && (
          <div className="rounded-2xl bg-terracotta-tint/50 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-[13px] leading-snug">Know someone who&apos;s been to {city}?</span>
            <AskForGuideButton city={askCity} label="Ask them" variant="primary" />
          </div>
        )}
        {mine.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">From people you follow</h2>
            {mine.map((g) => <GuideCard key={g.guide.id} data={g} />)}
          </section>
        )}
        {others.length > 0 && (
          <section className="flex flex-col gap-3">
            {mine.length > 0 && <h2 className="px-1 mt-2 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">More {city} guides</h2>}
            {others.map((g) => <GuideCard key={g.guide.id} data={g} />)}
          </section>
        )}
      </main>
    </AppShell>
  );
}
