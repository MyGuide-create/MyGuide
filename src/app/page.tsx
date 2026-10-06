import Link from "next/link";
import { AppShell, Wordmark } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { Avatar, EmptyState, LinkButton, cx } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { listFeed, listFeedCities, peopleToFollow } from "@/lib/guides";
import { PersonRow } from "@/components/PersonRow";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const scope = sp.scope === "following" ? "following" : "public";
  const city = typeof sp.city === "string" ? sp.city : undefined;
  const user = await getCurrentUser();
  const [feed, cities, suggested] = await Promise.all([
    listFeed({ viewerId: user?.id, scope, city }),
    listFeedCities(),
    // Only the Following tab nudges, and only until you follow a few people.
    user && scope === "following" ? peopleToFollow(user.id, 6) : Promise.resolve(null),
  ]);

  const showNudge = !!suggested && suggested.followingCount < 3 && suggested.hits.length > 0;

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
        {user && (
          <Link href="/trips" className="mt-4 flex items-center justify-between rounded-2xl bg-sage-tint/70 px-4 py-2.5 text-[13px]">
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
        {showNudge && suggested && (
          <section className="rounded-2xl bg-cream-deep/40 p-3">
            <h2 className="font-display text-[20px] px-1">People to follow</h2>
            <p className="px-1 mt-0.5 mb-2.5 text-[12.5px] text-ink-muted">Follow a few creators and their guides show up here.</p>
            <ul className="flex flex-col gap-2">
              {suggested.hits.map((h) => <PersonRow key={h.user.id} hit={h} signedIn next="/?scope=following" />)}
            </ul>
          </section>
        )}
        {feed.length === 0 && scope === "following" && !showNudge && (
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

        {sp.deleted === "1" && <p className="rounded-2xl bg-sage-tint px-4 py-3 text-[13px]">Your account has been deleted. Thanks for trying MyGuide.</p>}

        <p className="mt-4 text-center text-[12px] text-ink-faint">
          Something broken or an idea? <Link href="/feedback?from=/" className="text-terracotta font-medium">Tell us</Link>
        </p>
      </main>
    </AppShell>
  );
}
