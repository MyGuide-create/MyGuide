import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState, LinkButton, Tag } from "@/components/ui";
import { interpretSearch } from "@/lib/ai";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { listFeedCities, peopleToFollow, searchGuides, searchPeople, searchPlaces, suggestedCreators, topPlaceCategories } from "@/lib/guides";
import { PersonRow } from "@/components/PersonRow";
import { WishForCityButton } from "@/components/WishList";
import { SparkleIcon } from "@/components/Icons";
import { listAllWishes } from "@/lib/wishes";
import { PlaceTile } from "@/components/PlaceTile";
import { placeArea } from "@/lib/places/neighbourhood";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const CATEGORY_PHRASES: Record<string, (city: string) => string> = {
  "Food & Drinks": (c) => `Where to eat in ${c}`,
  Nightlife: (c) => `Bars in ${c}`,
  "Scenic Spots": (c) => `Best views in ${c}`,
  Entertainment: (c) => `Things to do in ${c}`,
  "Sports & Wellness": (c) => `Wellness in ${c}`,
  Beauty: (c) => `Hair and nails in ${c}`,
  Spiritual: (c) => `Temples in ${c}`,
  Shopping: (c) => `Shopping in ${c}`,
  Nature: (c) => `Beaches and nature in ${c}`,
  Stay: (c) => `Where to stay in ${c}`,
};

/** "Try searching" examples built from what's actually on MyGuide, so every one returns something. */
async function buildExamples(cities: string[], signedIn: boolean): Promise<string[]> {
  const out: string[] = [];
  for (const city of cities.slice(0, 2)) {
    out.push(`Guides to ${city}`);
    for (const c of await topPlaceCategories(city, 2)) {
      const phrase = CATEGORY_PHRASES[c];
      if (phrase) out.push(phrase(city));
    }
  }
  const creators = (await suggestedCreators(null, 3)).filter((u) => u.guideCount > 0);
  for (const u of creators.slice(0, 2)) out.push(`Guides by ${u.username}`);
  if (signedIn && cities[0]) out.push(`Guides to ${cities[0]} by people I'm following`);
  return [...new Set(out)].slice(0, 5);
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const user = await getCurrentUser();
  // "See all" on the People section: just the people, no guide search.
  const allPeople = sp.people === "all";
  const here = `/search?q=${encodeURIComponent(q)}${allPeople ? "&people=all" : ""}`;
  const intent = q && !allPeople ? await interpretSearch(q) : null;
  // A city search ("Paris") is about places: people only show on a whole-word name match, and below the guides.
  const placeSearch = !!(intent && (intent.city || intent.country) && !intent.byUsername);
  const people = q ? await searchPeople(q, user?.id, allPeople ? 50 : 3, { wholeWord: placeSearch }) : { hits: [], total: 0 };
  const [results, placeHits] = intent ? await Promise.all([searchGuides(intent, user?.id), searchPlaces(intent, user?.id)]) : [[], []];
  const cities = q ? [] : await listFeedCities();
  const examples = q ? [] : await buildExamples(cities, !!user);
  const wanted = q ? [] : (await listAllWishes(user?.id)).slice(0, 3);
  const suggested = q ? null : await peopleToFollow(user?.id, 8);

  const peopleSection = people.hits.length > 0 && (
    <section>
      <div className="flex items-baseline justify-between px-1 mb-2">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">People</h2>
        {people.total > people.hits.length && (
          <Link href={`/search?q=${encodeURIComponent(q)}&people=all`} className="text-[12.5px] font-medium text-terracotta">See all {people.total} →</Link>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {people.hits.map((h) => <PersonRow key={h.user.id} hit={h} signedIn={!!user} next={here} />)}
      </ul>
    </section>
  );

  return (
    <AppShell>
      <TopBar title="Search" avatarUser={user ? toPublicUser(user) : null} />
      <div className="px-4 pt-3">
        <SearchBar key={q} initial={q} />
      </div>

      {!q && (
        <div className="px-5 pt-5 flex flex-col gap-5">
          {examples.length > 0 && (
          <div>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Try searching</h2>
            <div className="flex flex-col gap-1.5">
              {examples.map((e) => (
                <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="text-[15px] font-display leading-snug text-ink hover:text-terracotta">“{e}”</Link>
              ))}
            </div>
          </div>
          )}
          <Link href="/wishes" className="block rounded-2xl border border-terracotta-soft bg-terracotta-tint/50 px-4 py-3 hover:border-terracotta">
            <span className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[14.5px] font-semibold"><SparkleIcon size={16} className="text-terracotta" /> Wanted guides</span>
              <span className="text-[12.5px] font-medium text-terracotta">See all →</span>
            </span>
            <span className="block mt-1 text-[12.5px] text-ink-muted leading-snug">
              {wanted.length
                ? wanted.map((w) => `${w.city} (${w.people.length})`).join(" · ")
                : "Cities people want a guide to. Add yours, or make one for someone."}
            </span>
          </Link>
          {cities.length > 0 && (
            <div>
              <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Cities with guides</h2>
              <div className="flex flex-wrap gap-2">
                {cities.map((c) => (
                  <Link key={c} href={`/search?q=${encodeURIComponent(`guides to ${c}`)}`} className="rounded-full border border-line px-[15px] py-[7px] text-[12.5px] font-medium text-ink-muted hover:border-terracotta-soft hover:text-ink">{c}</Link>
                ))}
              </div>
            </div>
          )}
          {suggested && suggested.hits.length > 0 && (
            <section className="pb-6">
              <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">People to follow</h2>
              <ul className="flex flex-col gap-2 -mx-1">
                {suggested.hits.map((h) => <PersonRow key={h.user.id} hit={h} signedIn={!!user} next="/search" />)}
              </ul>
            </section>
          )}
        </div>
      )}

      {q && allPeople && (
        <main className="px-4 pt-4 pb-6 flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">People matching “{q}”</h2>
            <Link href={`/search?q=${encodeURIComponent(q)}`} className="text-[12.5px] font-medium text-terracotta">Guides too →</Link>
          </div>
          {people.hits.length === 0 ? (
            <EmptyState title="Nobody by that name yet" body="Try part of their name or their @username." />
          ) : (
            <ul className="flex flex-col gap-2">
              {people.hits.map((h) => <PersonRow key={h.user.id} hit={h} signedIn={!!user} next={here} />)}
            </ul>
          )}
        </main>
      )}

      {q && intent && (
        <main className="px-4 pt-4 pb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted px-1">
            <span>Showing</span>
            <Tag tone={intent.scope === "following" ? "sage" : "neutral"}>{intent.scope === "following" ? "people I follow" : "public guides"}</Tag>
            {intent.city && <Tag tone="terracotta">{intent.city}</Tag>}
            {!intent.city && intent.country && <Tag tone="terracotta">{intent.country}</Tag>}
            {intent.category && <Tag>{intent.category}</Tag>}
            {intent.byUsername && <Tag>by @{intent.byUsername}</Tag>}
            {intent.keywords.slice(0, 3).map((k) => <Tag key={k}>“{k}”</Tag>)}
          </div>
          {intent.scope === "following" && !user && (
            <EmptyState title="Sign up to search your people" body="“By people I'm following” needs to know who you follow." action={<LinkButton href={`/signup?why=following&next=${encodeURIComponent(`/search?q=${q}`)}`} size="sm">Sign up</LinkButton>} />
          )}
          {!placeSearch && peopleSection}
          {placeHits.length > 0 && (
            <section>
              <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Places</h2>
              <ul className="flex flex-col gap-2">
                {placeHits.map((h) => (
                  <li key={h.place.id}>
                    <Link href={`/g/${h.guide.slug}/p/${h.place.id}`} className="flex gap-3 items-center rounded-2xl border border-line/70 bg-paper p-2.5 hover:border-terracotta-soft">
                      <PlaceTile place={h.place} size={52} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-[14px] truncate">{h.place.name}</span>
                        <span className="block text-[11.5px] text-ink-muted truncate">{[h.place.category, placeArea(h.place)].filter(Boolean).join(" · ")}</span>
                        <span className="block text-[11.5px] text-ink-faint truncate">in {h.guide.title} · {h.owner.displayName}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {results.length > 0 && (placeHits.length > 0 || people.hits.length > 0) && <h2 className="px-1 -mb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">Guides</h2>}
          {results.length === 0 && placeHits.length === 0 && people.hits.length === 0 && (user || intent.scope !== "following") && (
            <EmptyState
              title="No guides match yet"
              body={intent.city ? `Nobody has published a ${intent.city} guide${intent.scope === "following" ? " that you follow" : ""} yet. Add it to your wish list — people who know ${intent.city} can make one for you.` : "Try a city name, or say what you're looking for."}
              action={
                intent.city ? (
                  <span className="flex flex-col items-center gap-2.5">
                    {user ? <WishForCityButton city={intent.city} /> : <LinkButton href={`/signup?next=${encodeURIComponent(`/search?q=${q}`)}`} size="sm">Sign up to wish for a {intent.city} guide</LinkButton>}
                    <Link href={`/wishes?city=${encodeURIComponent(intent.city)}`} className="text-[12.5px] font-medium text-terracotta">Who else wants one →</Link>
                  </span>
                ) : (
                  <LinkButton href="/create" size="sm">Create a guide</LinkButton>
                )
              }
            />
          )}
          {results.map((g) => <GuideCard key={g.guide.id} data={g} />)}
          {placeSearch && peopleSection}
        </main>
      )}
    </AppShell>
  );
}
