import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { ForkIcon, ShareIcon, UserIcon } from "@/components/Icons";
import { Avatar, EmptyState, LinkButton } from "@/components/ui";
import { markNotificationsRead } from "@/lib/actions/guides";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, notifications, users } from "@/lib/db/schema";
import { listSharedWithUser } from "@/lib/guides";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const db = await getDb();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(60);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const guideIds = [...new Set(rows.map((r) => r.guideId).filter((x): x is string => !!x))];
  const [actors, guideRows] = await Promise.all([
    actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : Promise.resolve([]),
    guideIds.length ? db.select().from(guides).where(inArray(guides.id, guideIds)) : Promise.resolve([]),
  ]);
  const actorMap = new Map(actors.map((a) => [a.id, toPublicUser(a)]));
  const guideMap = new Map(guideRows.map((g) => [g.id, g]));
  const unread = rows.some((r) => !r.readAt);
  const shared = await listSharedWithUser(user.id);
  void and;

  return (
    <AppShell>
      <TopBar title="Notification Centre" />
      {unread && (
        <form action={markNotificationsRead} className="px-5 pt-3">
          <button type="submit" className="text-[12.5px] font-medium text-terracotta">Mark all as read</button>
        </form>
      )}
      <main className="px-4 pt-3 pb-6 flex flex-col gap-3">
        {rows.length === 0 && (
          <EmptyState title="Nothing here yet" body="When someone shares a guide with you, it lands here. Publishing alone never pings anyone." action={<LinkButton href="/" size="sm" variant="outline">Browse the feed</LinkButton>} />
        )}
        {rows.map((n) => {
          const actor = n.actorId ? actorMap.get(n.actorId) : undefined;
          const guide = n.guideId ? guideMap.get(n.guideId) : undefined;
          return (
            <div key={n.id} className={`rounded-2xl border px-3.5 py-3 flex gap-3 items-start ${n.readAt ? "border-line/70 bg-paper/60" : "border-terracotta-soft bg-paper"}`}>
              {actor ? <Link href={`/u/${actor.username}`}><Avatar user={actor} size={38} /></Link> : <div className="w-[38px] h-[38px] rounded-full bg-cream-deep" />}
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] leading-snug">
                  {n.type === "guide_shared" && guide && (
                    <>
                      <Link href={`/u/${actor?.username ?? ""}`} className="font-semibold">{actor?.displayName ?? "Someone"}</Link> shared <span className="font-display text-[16px]">“{guide.title}”</span> with you.
                    </>
                  )}
                  {n.type === "new_follower" && (
                    <>
                      <Link href={`/u/${actor?.username ?? ""}`} className="font-semibold">{actor?.displayName ?? "Someone"}</Link> started following you.
                    </>
                  )}
                  {n.type === "guide_shared" && !guide && <span className="text-ink-muted">A shared guide that has since been deleted.</span>}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-ink-muted">
                  <span className="inline-flex items-center gap-1">{n.type === "guide_shared" ? <ShareIcon size={12} /> : <UserIcon size={12} />} {timeAgo(n.createdAt)}</span>
                  {guide && <Link href={`/g/${guide.slug}`} className="font-medium text-terracotta">Open guide →</Link>}
                  {n.type === "new_follower" && actor && <Link href={`/u/${actor.username}`} className="font-medium text-terracotta">View profile →</Link>}
                </div>
              </div>
            </div>
          );
        })}

        {shared.length > 0 && (
          <section className="mt-4">
            <h2 className="font-display text-[22px] px-1 mb-3 inline-flex items-center gap-2"><ForkIcon size={18} className="text-sage" /> Shared with you</h2>
            <div className="flex flex-col gap-4">
              {shared.map((c) => <GuideCard key={c.guide.id} data={c} />)}
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
