import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { SearchBar } from "@/components/SearchBar";
import { EmptyState, LinkButton, Tag } from "@/components/ui";
import { interpretSearch } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { listFeedCities, searchGuides } from "@/lib/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search" };

const EXAMPLES = ["Show me public guides to Athens", "Guides to Mexico City by people I'm following", "Where to eat in Tokyo", "Wellness in Dubai", "Guides by yara"];

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const user = await getCurrentUser();
  const intent = q ? await interpretSearch(q) : null;
  const results = intent ? await searchGuides(intent, user?.id) : [];
  const cities = q ? [] : await listFeedCities();

  return (
    <AppShell>
      <TopBar title="Search" />
      <div className="px-4 pt-3">
        <SearchBar key={q} initial={q} />
      </div>

      {!q && (
        <div className="px-5 pt-5 flex flex-col gap-5">
          <div>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Try saying</h2>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((e) => (
                <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="text-[15px] font-display leading-snug text-ink hover:text-terracotta">“{e}”</Link>
              ))}
            </div>
          </div>
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
        </div>
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
            <EmptyState title="Log in to search your people" body="“By people I'm following” needs to know who you follow." action={<LinkButton href={`/login?next=${encodeURIComponent(`/search?q=${q}`)}`} size="sm">Log in</LinkButton>} />
          )}
          {results.length === 0 && (user || intent.scope !== "following") && (
            <EmptyState title="No guides match yet" body={intent.city ? `Nobody has published a ${intent.city} guide${intent.scope === "following" ? " that you follow" : ""}. Maybe that's you?` : "Try a city name, or say what you're looking for."} action={<LinkButton href="/create" size="sm">Create a guide</LinkButton>} />
          )}
          {results.map((g) => <GuideCard key={g.guide.id} data={g} />)}
        </main>
      )}
    </AppShell>
  );
}
