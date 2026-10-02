import Link from "next/link";
import { AppShell, Wordmark } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { Avatar, Button } from "@/components/ui";
import { finishOnboarding } from "@/lib/actions/account";
import { requireUser } from "@/lib/auth";
import { listFeed, suggestedCreators } from "@/lib/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const user = await requireUser("/welcome");
  const [people, feed] = await Promise.all([suggestedCreators(user.id, 8), listFeed({ viewerId: user.id, limit: 1 })]);
  const creators = people.filter((p) => p.guideCount > 0);
  const example = feed[0];
  const done = finishOnboarding.bind(null, next);

  return (
    <AppShell nav={false}>
      <div className="px-6 pt-14 pb-10 flex-1 flex flex-col">
        <Wordmark />
        <h1 className="mt-6 font-display text-[36px] leading-[1.02]">Welcome, {user.displayName.split(" ")[0]}.</h1>
        <p className="mt-2 text-[14px] text-ink-muted leading-relaxed">
          MyGuide is city guides from people whose taste you trust. Follow a few people and their guides show up in your Following tab — and you&apos;ll get an alert when they add something new.
        </p>

        {creators.length > 0 && (
          <section className="mt-7">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2.5">People to follow</h2>
            <ul className="flex flex-col gap-2">
              {creators.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-paper px-3 py-2.5">
                  <Avatar user={c} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{c.displayName}</div>
                    <div className="text-[12px] text-ink-muted truncate">
                      {c.guideCount} guide{c.guideCount === 1 ? "" : "s"}
                      {c.bio ? ` · ${c.bio}` : ""}
                    </div>
                  </div>
                  <FollowButton userId={c.id} initial="none" next="/welcome" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {example && (
          <p className="mt-6 text-[13px] text-ink-muted">
            Not sure where to start? Have a look at{" "}
            <Link href={`/g/${example.guide.slug}`} className="text-terracotta font-medium">{example.guide.title}</Link>.
          </p>
        )}

        <section className="mt-7 rounded-2xl bg-cream-deep/60 px-4 py-3.5 text-[13px] leading-relaxed">
          <div className="font-semibold mb-1">Three things to try</div>
          <ul className="list-disc pl-4 space-y-0.5 text-ink-muted">
            <li>Tap the heart on a place to add it to your Favourites.</li>
            <li>Tap + to make your own guide — just say the places you love.</li>
            <li>Going somewhere? Plan a trip and we&apos;ll pull together guides for that city.</li>
          </ul>
        </section>

        <form action={done} className="mt-8">
          <Button type="submit" size="lg" className="w-full">Continue</Button>
        </form>
      </div>
    </AppShell>
  );
}
