import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCard } from "@/components/GuideCard";
import { ChatIcon, ForkIcon, LockIcon, PinIcon, PlusIcon, ShareIcon, SparkleIcon, UserIcon } from "@/components/Icons";
import { Avatar, Button, EmptyState, LinkButton } from "@/components/ui";
import { respondToFollowRequest } from "@/lib/actions/social";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { follows, guideRequests, guides, notifications, places, users } from "@/lib/db/schema";
import { pendingAsksFor } from "@/lib/requests";
import { listSharedWithUser } from "@/lib/guides";
import { timeAgo } from "@/lib/utils";
import { PushToggle } from "@/components/PushToggle";
import { FollowButton } from "@/components/FollowButton";
import { hiddenUserIds } from "@/lib/blocks";
import { pushPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity" };

export default async function NotificationsPage() {
  const user = await requireUser("/notifications");
  const db = await getDb();
  const rows = await db.select().from(notifications).where(eq(notifications.userId, user.id)).orderBy(desc(notifications.createdAt)).limit(60);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const guideIds = [...new Set(rows.map((r) => r.guideId).filter((x): x is string => !!x))];
  const placeIds = [...new Set(rows.map((r) => r.placeId).filter((x): x is string => !!x))];
  const [actors, guideRows, placeRows, myFollows, theirFollows, hidden] = await Promise.all([
    actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : Promise.resolve([]),
    guideIds.length ? db.select().from(guides).where(inArray(guides.id, guideIds)) : Promise.resolve([]),
    placeIds.length ? db.select().from(places).where(inArray(places.id, placeIds)) : Promise.resolve([]),
    // Who I already follow / have asked to follow (for "Follow back")…
    actorIds.length ? db.select().from(follows).where(and(eq(follows.followerId, user.id), inArray(follows.followingId, actorIds))) : Promise.resolve([]),
    // …and where each person stands with me (a follow request may since have been accepted or declined).
    actorIds.length ? db.select().from(follows).where(and(eq(follows.followingId, user.id), inArray(follows.followerId, actorIds))) : Promise.resolve([]),
    hiddenUserIds(user.id),
  ]);
  const myStatus = new Map(myFollows.map((f) => [f.followingId, f.status === "pending" ? ("pending" as const) : ("accepted" as const)]));
  const theirStatus = new Map(theirFollows.map((f) => [f.followerId, f.status]));
  const actorMap = new Map(actors.map((a) => [a.id, toPublicUser(a)]));
  const guideMap = new Map(guideRows.map((g) => [g.id, g]));
  const placeMap = new Map(placeRows.map((p) => [p.id, p]));
  const shared = await listSharedWithUser(user.id);
  const requestIds = [...new Set(rows.map((r) => r.requestId).filter((x): x is string => !!x))];
  const [reqRows, asks] = await Promise.all([
    requestIds.length ? db.select().from(guideRequests).where(inArray(guideRequests.id, requestIds)) : Promise.resolve([]),
    pendingAsksFor(user.id),
  ]);
  const reqMap = new Map(reqRows.map((q) => [q.id, q]));

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
        <PushToggle publicKey={pushPublicKey()} compact />
        {asks.length > 0 && (
          <section className="rounded-2xl border border-terracotta-soft bg-terracotta-tint/40 p-3">
            <h2 className="px-1 font-display text-[20px] inline-flex items-center gap-2"><SparkleIcon size={16} className="text-terracotta" /> Guide requests</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {asks.map(({ req: q, requester }) => (
                <li key={q.id}>
                  <Link href={`/ask/${q.token}`} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2.5 hover:bg-cream-deep/40">
                    <Avatar user={requester} size={34} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] leading-snug"><b className="font-semibold">{requester.displayName}</b> wants a <b className="font-semibold">{q.city}</b> guide</span>
                      {q.note ? <span className="block text-[12px] text-ink-muted italic truncate">“{q.note}”</span> : <span className="block text-[12px] text-ink-muted">{q.status === "making" ? "You’re working on it" : "Tap to make it or send one"}</span>}
                    </span>
                    <span className="text-[12.5px] font-semibold text-terracotta shrink-0">{q.status === "making" ? "Continue →" : "Reply →"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {rows.length === 0 && (
          <EmptyState title="Nothing here yet" body="New guides and places from people you follow, guides shared with you, and new followers all land here." action={<LinkButton href="/" size="sm" variant="outline">Browse the feed</LinkButton>} />
        )}
        {rows.filter((n) => !(n.type === "user_joined" && n.actorId && hidden.has(n.actorId))).map((n) => {
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
                  {n.type === "wish_granted" && rawGuide && (
                    <>
                      {who} made you a guide from your wish list: <span className="font-display text-[16px]">“{rawGuide.title}”</span>{rawGuide.city ? ` · ${rawGuide.city}` : ""}
                    </>
                  )}
                  {n.type === "wish_granted" && !rawGuide && <span className="text-ink-muted">A guide made for your wish list that has since been deleted.</span>}
                  {n.type === "user_joined" && (
                    <>
                      {who} joined MyGuide.{" "}
                      <span className="text-ink-muted">{actor ? `@${actor.username}` : ""}</span>
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
                  {n.type === "guide_used" && rawGuide && (
                    <>
                      {who} used {n.count} {n.count === 1 ? "place" : "places"} from <span className="font-display text-[16px]">“{rawGuide.title}”</span> in their own guide, with your notes credited.
                    </>
                  )}
                  {n.type === "guide_request" && (
                    <>
                      {who} asked you for a <b className="font-semibold">{reqMap.get(n.requestId ?? "")?.city ?? ""}</b> guide.
                      {reqMap.get(n.requestId ?? "")?.note ? <span className="block text-[12.5px] text-ink-muted italic">“{reqMap.get(n.requestId ?? "")!.note}”</span> : null}
                    </>
                  )}
                  {n.type === "request_joined" && (
                    <>
                      {who} joined MyGuide from your {reqMap.get(n.requestId ?? "")?.city ?? ""} ask. You now follow each other.
                    </>
                  )}
                  {n.type === "request_declined" && (
                    <>
                      {who} can&apos;t help with {reqMap.get(n.requestId ?? "")?.city ?? "that city"}. <span className="text-ink-muted">Ask someone else from your wish list.</span>
                    </>
                  )}
                  {n.type === "collab_invite" && rawGuide && (
                    <>
                      {who} invited you to edit <span className="font-display text-[16px]">“{rawGuide.title}”</span> with them.
                    </>
                  )}
                </p>
                <div className="mt-1.5 flex items-center gap-3 text-[11.5px] text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    {n.type === "guide_shared" && <ShareIcon size={12} />}
                    {(n.type === "new_follower" || n.type === "user_joined") && <UserIcon size={12} />}
                    {(n.type === "follow_request" || n.type === "follow_accepted") && <LockIcon size={12} />}
                    {n.type === "place_comment" && <ChatIcon size={12} />}
                    {n.type === "guide_published" && <PlusIcon size={12} />}
                    {n.type === "places_added" && <PinIcon size={12} />}
                    {n.type === "guide_used" && <ForkIcon size={12} />}
                    {(n.type === "wish_granted" || n.type === "guide_request" || n.type === "request_declined") && <SparkleIcon size={12} />}
                    {n.type === "request_joined" && <UserIcon size={12} />}
                    {timeAgo(n.createdAt)}
                  </span>
                  {n.type === "wish_granted" && rawGuide && <Link href={`/g/${rawGuide.slug}`} className="font-medium text-terracotta">Open your guide →</Link>}
                  {n.type === "guide_request" && reqMap.get(n.requestId ?? "") && <Link href={`/ask/${reqMap.get(n.requestId ?? "")!.token}`} className="font-medium text-terracotta">Reply →</Link>}
                  {n.type === "request_joined" && actor && <Link href={`/u/${actor.username}`} className="font-medium text-terracotta">View profile →</Link>}
                  {n.type === "request_declined" && <Link href={`/u/${user.username}#wishes`} className="font-medium text-terracotta">Your wish list →</Link>}
                  {n.type === "collab_invite" && rawGuide && <Link href={`/g/${rawGuide.slug}/edit`} className="font-medium text-terracotta">Start editing →</Link>}
                  {guide && n.type !== "place_comment" && n.type !== "places_added" && n.type !== "collab_invite" && n.type !== "guide_used" && n.type !== "wish_granted" && <Link href={`/g/${guide.slug}`} className="font-medium text-terracotta">Open guide →</Link>}
                  {guide && n.type === "places_added" && (
                    <Link href={n.count === 1 && addedPlace ? `/g/${guide.slug}/p/${addedPlace.id}` : `/g/${guide.slug}`} className="font-medium text-terracotta">{n.count === 1 && addedPlace ? "See the place →" : "See what's new →"}</Link>
                  )}
                  {guide && n.type === "place_comment" && <Link href={`/g/${guide.slug}${n.placeId ? `#place-${n.placeId}` : ""}`} className="font-medium text-terracotta">Open guide →</Link>}
                  {n.type === "guide_used" && actor && <Link href={`/u/${actor.username}`} className="font-medium text-terracotta">View profile →</Link>}
                  {(n.type === "new_follower" || n.type === "follow_accepted" || n.type === "user_joined") && actor && <Link href={`/u/${actor.username}`} className="font-medium text-terracotta">View profile →</Link>}
                </div>
                {n.type === "follow_request" && actor && theirStatus.get(actor.id) === "accepted" && (
                  <p className="mt-1.5 text-[12px] text-sage font-medium">You accepted — they can see your guides now.</p>
                )}
                {n.type === "follow_request" && actor && theirStatus.get(actor.id) === "pending" && (
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
              {actor && !hidden.has(actor.id) && theirStatus.get(actor.id) === "accepted" && (n.type === "new_follower" || n.type === "follow_request") && (
                <div className="shrink-0 self-center">
                  <FollowButton userId={actor.id} initial={myStatus.get(actor.id) ?? "none"} next="/notifications" followsYou />
                </div>
              )}
              {actor && !hidden.has(actor.id) && n.type === "user_joined" && (
                <div className="shrink-0 self-center">
                  <FollowButton userId={actor.id} initial={myStatus.get(actor.id) ?? "none"} next="/notifications" followsYou={theirStatus.get(actor.id) === "accepted"} />
                </div>
              )}
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
