import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { ChatIcon, ForkIcon, LockIcon, PinIcon, PlusIcon, ShareIcon, UserIcon } from "@/components/Icons";
import { Avatar, Button, EmptyState, LinkButton } from "@/components/ui";
import { respondToFollowRequest } from "@/lib/actions/social";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, notifications, places, users } from "@/lib/db/schema";
import { listSharedWithUser } from "@/lib/guides";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity" };

export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const db = await getDb();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(60);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const guideIds = [...new Set(rows.map((r) => r.guideId).filter((x): x is string => !!x))];
  const placeIds = [...new Set(rows.map((r) => r.placeId).filter((x): x is string => !!x))];
  const [actors, guideRows, placeRows] = await Promise.all([
    actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : Promise.resolve([]),
    guideIds.length ? db.select().from(guides).where(inArray(guides.id, guideIds)) : Promise.resolve([]),
    placeIds.length ? db.select().from(places).where(inArray(places.id, placeIds)) : Promise.resolve([]),
  ]);
  const actorMap = new Map(actors.map((a) => [a.id, toPublicUser(a)]));
  const guideMap = new Map(guideRows.map((g) => [g.id, g]));
  const placeMap = new Map(placeRows.map((p) => [p.id, p]));
  const shared = await listSharedWithUser(user.id);

  // Opening the Notification Centre is itself "seeing" them — mark everything read now
  // so the bell badge clears immediately, instead of waiting for a separate action.
  // `rows` (already fetched) keeps the pre-read state for this render, so unread items
  // still get their highlighted treatment the first time they're seen.
  const unreadIds = rows.filter((r) => !r.readAt).map((r) => r.id);
  if (unreadIds.length > 0) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), inArray(notifications.id, unreadIds)));
  }

  return (
    <AppShell>
      <TopBar title="Activity" avatarUser={toPublicUser(user)} />
      <main className="px-4 pt-3 pb-6 flex flex-col gap-3">
        {rows.length === 0 && (
          <EmptyState title="Nothing here yet" body="New guides and places from people you follow, guides shared with you, and new followers all land here." action={<LinkButton href="/" size="sm" variant="outline">Browse the feed</LinkButton>} />
        )}
        {rows.map((n) => {
          const actor = n.actorId ? actorMap.get(n.actorId) : undefined;
          const rawGuide = n.guideId ? guideMap.get(n.guideId) : undefined;
          const followerUpdate = n.type === "guide_published" || n.type === "places_added";
          // Follower updates only make sense while the guide is still public.
          const guide = followerUpdate && rawGuide && (rawGuide.visibility !== "public" || !rawGuide.publishedAt) ? undefined : rawGuide;
          const addedPlace = n.type === "places_added" && n.placeId ? placeMap.get(n.placeId) : undefined;
          const who = <Link href={`/u/${actor?.username ?? ""}`} className="font-semibold">{actor?.displayName ?? "Someone"}</Link>;
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
                  {n.type === "follow_request" && (
                    <>
                      <Link href={`/u/${actor?.username ?? ""}`} className="font-semibold">{actor?.displayName ?? "Someone"}</Link> asked to follow you.
                    </>
                  )}
                  {n.type === "follow_accepted" && (
                    <>
                      <Link href={`/u/${actor?.username ?? ""}`} className="font-semibold">{actor?.displayName ?? "Someone"}</Link> accepted your follow request.
                    </>
                  )}
                  {n.type === "place_comment" && guide && (
                    <>
                      <Link href={`/u/${actor?.username ?? ""}`} className="font-semibold">{actor?.displayName ?? "Someone"}</Link> commented on {n.placeId && placeMap.get(n.placeId) ? <span className="font-medium">{placeMap.get(n.placeId)!.name}</span> : "a place"} in <span className="font-display text-[16px]">“{guide.title}”</span>.
                    </>
                  )}
                  {n.type === "guide_published" && guide && (
                    <>
                      {who} published a new guide: <span className="font-display text-[16px]">“{guide.title}”</span>{guide.city ? ` · ${guide.city}` : ""}
                    </>
                  )}
                  {n.type === "places_added" && guide && (
                    <>
                      {who} added {n.count === 1 && addedPlace ? <span className="font-medium">{addedPlace.name}</span> : <>{n.count} {n.count === 1 ? "place" : "places"}</>} to <span className="font-display text-[16px]">“{guide.title}”</span>.
                    </>
                  )}
                  {n.type === "guide_shared" && !guide && <span className="text-ink-muted">A shared guide that has since been deleted.</span>}
                  {followerUpdate && !guide && <span className="text-ink-muted">A guide that&apos;s no longer available.</span>}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    {n.type === "guide_shared" && <ShareIcon size={12} />}
                    {n.type === "new_follower" && <UserIcon size={12} />}
                    {(n.type === "follow_request" || n.type === "follow_accepted") && <LockIcon size={12} />}
                    {n.type === "place_comment" && <ChatIcon size={12} />}
                    {n.type === "guide_published" && <PlusIcon size={12} />}
                    {n.type === "places_added" && <PinIcon size={12} />}
                    {timeAgo(n.createdAt)}
                  </span>
                  {guide && n.type !== "place_comment" && n.type !== "places_added" && <Link href={`/g/${guide.slug}`} className="font-medium text-terracotta">Open guide →</Link>}
                  {guide && n.type === "places_added" && (
                    <Link href={n.count === 1 && addedPlace ? `/g/${guide.slug}/p/${addedPlace.id}` : `/g/${guide.slug}`} className="font-medium text-terracotta">{n.count === 1 && addedPlace ? "See the place →" : "See what's new →"}</Link>
                  )}
                  {guide && n.type === "place_comment" && <Link href={`/g/${guide.slug}${n.placeId ? `#place-${n.placeId}` : ""}`} className="font-medium text-terracotta">Open guide →</Link>}
                  {(n.type === "new_follower" || n.type === "follow_accepted") && actor && <Link href={`/u/${actor.username}`} className="font-medium text-terracotta">View profile →</Link>}
                </div>
                {n.type === "follow_request" && actor && (
                  <div className="mt-2 flex gap-2">
                    <form action={respondToFollowRequest.bind(null, actor.id, true)}>
                      <Button size="sm" type="submit">Accept</Button>
                    </form>
                    <form action={respondToFollowRequest.bind(null, actor.id, false)}>
                      <Button size="sm" variant="ghost" type="submit" className="border border-line text-ink-muted">Decline</Button>
                    </form>
                  </div>
                )}
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
