import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { ProfileForm } from "@/components/ProfileForm";
import { Avatar, Button } from "@/components/ui";
import { logOut } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth";
import { getFollowStats, listFollowing } from "@/lib/guides";
import { hasAnthropicKey } from "@/lib/ai";
import { hasGoogleKey } from "@/lib/places";

export const dynamic = "force-dynamic";
export const metadata = { title: "You" };

export default async function MePage() {
  const user = await requireUser("/me");
  const [stats, following] = await Promise.all([getFollowStats(user.id), listFollowing(user.id)]);
  return (
    <AppShell>
      <TopBar title="You" right={<Link href={`/u/${user.username}`} className="text-[13px] font-medium text-terracotta px-2">View profile</Link>} />
      <div className="px-5 pt-4 pb-8 flex flex-col gap-8">
        <div>
          <div className="text-[12.5px] text-ink-muted">@{user.username} · {user.email}</div>
          <div className="mt-1 text-[12.5px] text-ink-muted">{stats.followers} followers · {stats.following} following</div>
        </div>
        <ProfileForm user={user} />

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

        <section className="rounded-2xl border border-line/70 bg-paper/70 px-4 py-3 text-[12px] text-ink-muted leading-relaxed">
          <div className="font-medium text-ink mb-1">Integrations</div>
          <div>Google Maps: {hasGoogleKey() ? "live Places data" : "demo mode (mock places) — add GOOGLE_MAPS_API_KEY to go live"}</div>
          <div>AI: {hasAnthropicKey() ? "Claude is structuring places and search" : "built-in heuristics — add ANTHROPIC_API_KEY for smarter parsing"}</div>
        </section>

        <form action={logOut}>
          <Button type="submit" variant="ghost" className="border border-line w-full">Log out</Button>
        </form>
      </div>
    </AppShell>
  );
}
