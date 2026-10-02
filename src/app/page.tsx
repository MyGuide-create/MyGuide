import Link from "next/link";
import { AppShell, Wordmark } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { MicIcon, SearchIcon } from "@/components/Icons";
import { Avatar, EmptyState, LinkButton, cx } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { listFeed, listFeedCities, suggestedCreators } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const scope = sp.scope === "following" ? "following" : "public";
  const city = typeof sp.city === "string" ? sp.city : undefined;
  const user = await getCurrentUser();
  const [feed, cities, creators] = await Promise.all([
    listFeed({ viewerId: user?.id, scope, city }),
    listFeedCities(),
    suggestedCreators(user?.id, 8),
  ]);

  const tab = (s: "public" | "following", label: string) => (
    <Link
      href={s === "public" ? (city ? `/?city=${encodeURIComponent(city)}` : "/") : `/?scope=following${city ? `&city=${encodeURIComponent(city)}` : ""}`}
      className={cx(
        "px-1 pb-2 text-[14px] font-medium border-b-2 transition-colors",
        scope === s ? "border-terracotta text-ink" : "border-transparent text-ink-muted",
      )}
    >
      {label}
    </Link>
  );

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <Wordmark />
          {user ? (
            <Link href="/me" aria-label="Your profile"><Avatar user={user} size={34} /></Link>
          ) : (
            <LinkButton href="/login" size="sm" variant="outline">Log in</LinkButton>
          )}
        </div>
        <p className="mt-3 font-display text-[30px] leading-[1.05]">
          {user ? `Where next, ${user.displayName.split(" ")[0]}?` : "Guides from people whose taste you trust."}
        </p>
        <Link
          href="/search"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] text-ink-faint"
        >
          <SearchIcon size={18} className="text-ink-muted" />
          <span className="flex-1">“Search a city, place or person…”</span>
          <span className="w-8 h-8 rounded-full bg-terracotta text-white flex items-center justify-center"><MicIcon size={16} /></span>
        </Link>
        {user && (
          <Link href="/trips" className="mt-2.5 flex items-center justify-between rounded-2xl bg-sage-tint/70 px-4 py-2.5 text-[13px]">
            <span><b className="font-semibold">Going somewhere?</b> Plan a trip and we&apos;ll gather the guides.</span>
            <span className="text-sage font-medium shrink-0 ml-2">Plan →</span>
          </Link>
        )}
      </header>

      <div className="px-5 flex gap-5 border-b border-line/70">
        {tab("public", "Everyone")}
        {tab("following", "Following")}
      </div>

      {cities.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-3">
          <Link href={scope === "following" ? "/?scope=following" : "/"} className={cx("shrink-0 rounded-full px-[15px] py-[7px] text-[12.5px] font-medium", !city ? "bg-terracotta text-white" : "border border-line text-ink-muted")}>
            All cities
          </Link>
          {cities.map((c) => (
            <Link
              key={c}
              href={`/?${scope === "following" ? "scope=following&" : ""}city=${encodeURIComponent(c)}`}
              className={cx("shrink-0 rounded-full px-[15px] py-[7px] text-[12.5px] font-medium whitespace-nowrap", city === c ? "bg-terracotta text-white" : "border border-line text-ink-muted")}
            >
              {c}
            </Link>
          ))}
        </div>
      )}

      <main className="px-4 pb-6 flex flex-col gap-4">
        {feed.length === 0 && scope === "following" && (
          <EmptyState
            title={user ? "Nothing from your people yet" : "Log in to see your people"}
            body={user ? "Follow a few creators and their public guides will show up here." : "Following shows guides from creators you follow."}
            action={user ? undefined : <LinkButton href="/login?next=%2F%3Fscope%3Dfollowing&why=following" size="sm">Log in</LinkButton>}
          />
        )}
        {feed.length === 0 && scope === "public" && (
          <EmptyState title="No guides here yet" body="Be the first to publish a guide for this city." action={<LinkButton href="/create" size="sm">Create a guide</LinkButton>} />
        )}
        {feed.map((g) => (
          <GuideCard key={g.guide.id} data={g} />
        ))}

        {creators.length > 0 && (
          <section className="mt-2">
            <h2 className="font-display text-[22px] mb-3">People to follow</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
              {creators.map((c) => (
                <Link key={c.id} href={`/u/${c.username}`} className="shrink-0 w-[120px] rounded-2xl bg-paper border border-line/80 p-3 flex flex-col items-center text-center">
                  <Avatar user={c} size={44} />
                  <div className="mt-2 text-[13px] font-medium truncate w-full">{c.displayName}</div>
                  <div className="text-[11px] text-ink-muted">{c.guideCount} guide{c.guideCount === 1 ? "" : "s"}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {sp.deleted === "1" && <p className="rounded-2xl bg-sage-tint px-4 py-3 text-[13px]">Your account has been deleted. Thanks for trying MyGuide.</p>}

        <p className="mt-4 text-center text-[12px] text-ink-faint">
          Something broken or an idea? <Link href="/feedback?from=/" className="text-terracotta font-medium">Tell us</Link>
        </p>
      </main>
    </AppShell>
  );
}
