import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { ProfileForm } from "@/components/ProfileForm";
import { Avatar, Button } from "@/components/ui";
import { logOut } from "@/lib/actions/auth";
import { respondToFollowRequest } from "@/lib/actions/social";
import { requireUser } from "@/lib/auth";
import { getFollowStats, listFollowRequests, listFollowing } from "@/lib/guides";
import { hasAnthropicKey } from "@/lib/ai";
import { hasGoogleKey } from "@/lib/places";
import { ChatIcon, HeartIcon, ListIcon, PinIcon, SparkleIcon } from "@/components/Icons";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { PushToggle } from "@/components/PushToggle";
import { BlockButton } from "@/components/BlockButton";
import { pushPublicKey } from "@/lib/push";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { blocks, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { toPublicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "You" };

export default async function MePage() {
  const user = await requireUser("/me");
  const [stats, following, requests] = await Promise.all([getFollowStats(user.id), listFollowing(user.id), listFollowRequests(user.id)]);
  const db = await getDb();
  const blockedRows = await db.select({ u: users }).from(blocks).innerJoin(users, eq(users.id, blocks.blockedId)).where(eq(blocks.blockerId, user.id));
  const blocked = blockedRows.map((b) => toPublicUser(b.u));
  const admin = isAdmin(user);
  return (
    <AppShell>
      <TopBar title="You" right={<Link href={`/u/${user.username}`} className="text-[13px] font-medium text-terracotta px-2">View profile</Link>} />
      <div className="px-5 pt-4 pb-8 flex flex-col gap-8">
        <div>
          <div className="text-[12.5px] text-ink-muted">@{user.username} · {user.email}</div>
          <div className="mt-1 text-[12.5px] text-ink-muted"><Link href={`/u/${user.username}/followers`} className="hover:underline">{stats.followers} {stats.followers === 1 ? "follower" : "followers"}</Link> · <Link href={`/u/${user.username}/following`} className="hover:underline">{stats.following} following</Link></div>
        </div>
        <nav className="grid grid-cols-2 gap-2 text-[13px] font-medium">
          <Link href="/saved" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft"><HeartIcon size={16} className="text-terracotta" /> Favourites</Link>
          <Link href="/trips" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft"><PinIcon size={16} className="text-terracotta" /> Trips</Link>
          <Link href="/stats" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft"><ListIcon size={16} className="text-terracotta" /> Guide stats</Link>
          <Link href="/feedback?from=/me" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft"><ChatIcon size={16} className="text-terracotta" /> Send feedback</Link>
          <Link href="/welcome?tour=1" className="col-span-2 inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft"><SparkleIcon size={16} className="text-terracotta" /> How MyGuide works</Link>
          {admin && <Link href="/admin" className="col-span-2 rounded-2xl border border-terracotta-soft bg-terracotta-tint/50 px-3.5 py-3">Pilot dashboard (admin)</Link>}
        </nav>

        <PushToggle publicKey={pushPublicKey()} />

        <ProfileForm user={user} />

        <div>
          <h2 className="font-display text-[22px] mb-3">Account privacy</h2>
          <PrivacyToggle initial={user.profileVisibility === "private" ? "private" : "public"} />
        </div>

        {requests.length > 0 && (
          <section>
            <h2 className="font-display text-[22px] mb-3">Follow requests</h2>
            <ul className="flex flex-col gap-2">
              {requests.map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-2xl bg-paper border border-line/70 px-3 py-2.5">
                  <Link href={`/u/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar user={u} size={32} />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium truncate">{u.displayName}</span>
                      <span className="block text-[12px] text-ink-muted truncate">@{u.username}</span>
                    </span>
                  </Link>
                  <form action={respondToFollowRequest.bind(null, u.id, true)}>
                    <Button size="sm" type="submit">Accept</Button>
                  </form>
                  <form action={respondToFollowRequest.bind(null, u.id, false)}>
                    <Button size="sm" variant="ghost" type="submit" className="border border-line text-ink-muted">Decline</Button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {following.length > 0 && (
          <section>
            <h2 className="font-display text-[22px] mb-3">People you follow</h2>
            <ul className="flex flex-col gap-2">
              {following.map((u) => (
                <li key={u.id}>
                  <Link href={`/u/${u.username}`} className="flex items-center gap-3 rounded-2xl bg-paper border border-line/70 px-3 py-2.5">
                    <Avatar user={u} size={32} />
                    <span className="text-[13.5px] font-medium">{u.displayName}</span>
                    <span className="text-[12px] text-ink-muted">@{u.username}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {process.env.NODE_ENV !== "production" && (
        <section className="rounded-2xl border border-line/70 bg-paper/70 px-4 py-3 text-[12px] text-ink-muted leading-relaxed">
          <div className="font-medium text-ink mb-1">Integrations</div>
          <div>Google Maps: {hasGoogleKey() ? "live Places data" : "demo mode (mock places) — add GOOGLE_MAPS_API_KEY to go live"}</div>
          <div>AI: {hasAnthropicKey() ? "Claude is structuring places and search" : "built-in heuristics — add ANTHROPIC_API_KEY for smarter parsing"}</div>
        </section>
        )}

        {blocked.length > 0 && (
          <section>
            <h2 className="font-display text-[22px] mb-3">Blocked</h2>
            <ul className="flex flex-col gap-2">
              {blocked.map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-2xl bg-paper border border-line/70 px-3 py-2.5">
                  <Avatar user={u} size={32} />
                  <span className="flex-1 text-[13.5px] font-medium">{u.displayName}</span>
                  <BlockButton userId={u.id} name={u.displayName} initial next="/me" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <form action={logOut}>
          <Button type="submit" variant="ghost" className="border border-line w-full">Log out</Button>
        </form>

        <div className="flex flex-col gap-3 pt-2 border-t border-line/70">
          <div className="flex gap-4 text-[12.5px] text-ink-muted">
            <Link href="/terms" className="hover:text-terracotta">Terms</Link>
            <Link href="/privacy" className="hover:text-terracotta">Privacy</Link>
          </div>
          <DeleteAccountForm username={user.username} />
        </div>
      </div>
    </AppShell>
  );
}
