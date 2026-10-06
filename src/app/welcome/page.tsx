import { and, eq } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { WelcomeFlow, type WelcomePerson, type WelcomeSample } from "@/components/WelcomeFlow";
import { finishOnboarding } from "@/lib/actions/account";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { follows } from "@/lib/db/schema";
import type { FollowStatus } from "@/lib/follow";
import { listFeed, suggestedCreators } from "@/lib/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Welcome" };

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const tour = sp.tour === "1";
  const user = await requireUser(tour ? "/welcome?tour=1" : "/welcome");
  const db = await getDb();
  const [creators, feed, mine] = await Promise.all([
    // Everyone on MyGuide for now (pilot-sized): creators with the most guides first, then the rest.
    suggestedCreators(user.id, 200),
    listFeed({ viewerId: user.id, limit: 12 }),
    db.select({ id: follows.followingId, status: follows.status }).from(follows).where(and(eq(follows.followerId, user.id))),
  ]);
  const myStatus = new Map(mine.map((f) => [f.id, (f.status === "pending" ? "pending" : "accepted") as FollowStatus]));

  const people: WelcomePerson[] = creators
    .map((c) => ({ id: c.id, username: c.username, displayName: c.displayName, avatarMediaId: c.avatarMediaId, guideCount: c.guideCount, status: myStatus.get(c.id) ?? "none" }));

  // Two real guides from different people for the first slide's illustration.
  const samples: WelcomeSample[] = [];
  for (const card of feed) {
    if (samples.some((s) => s.owner.id === card.owner.id)) continue;
    const g = card.guide;
    samples.push({
      guide: { id: g.id, title: g.title, city: g.city, country: g.country, coverMediaId: g.coverMediaId, coverUrl: g.coverUrl },
      owner: { id: card.owner.id, username: card.owner.username, displayName: card.owner.displayName, avatarMediaId: card.owner.avatarMediaId },
      placeCount: card.placeCount,
    });
    if (samples.length === 2) break;
  }

  return (
    <AppShell nav={false}>
      <WelcomeFlow
        firstName={user.displayName.split(" ")[0]}
        askUsername={sp.new === "1"}
        currentUsername={user.username}
        tour={tour}
        exitHref="/me"
        people={people}
        samples={samples}
        finish={finishOnboarding.bind(null, next)}
      />
    </AppShell>
  );
}
