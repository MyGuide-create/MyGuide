import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { GuideCard } from "@/components/GuideCard";
import { LockIcon } from "@/components/Icons";
import { Avatar, EmptyState, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getFollowStats, getUserByUsername, listGuidesByOwner } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = await getUserByUsername(username);
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const own = viewer?.id === profile.id;
  const [cards, stats] = await Promise.all([listGuidesByOwner(profile.id, viewer?.id), getFollowStats(profile.id, viewer?.id)]);
  const published = cards.filter((c) => c.guide.publishedAt);
  const drafts = cards.filter((c) => !c.guide.publishedAt);
  // listGuidesByOwner already hides guides from a locked private profile, but the page still
  // needs to tell "private and you can't see it yet" apart from "genuinely nothing published".
  const locked = profile.profileVisibility === "private" && !own && !stats.viewerFollows;

  return (
    <AppShell>
      <TopBar back="/" title={`@${profile.username}`} right={own ? <Link href="/me" className="text-[13px] font-medium text-terracotta px-2">Settings</Link> : undefined} />
      <div className="px-5 pt-4">
        <div className="flex items-center gap-4">
          <Avatar user={profile} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-[28px] leading-none truncate inline-flex items-center gap-1.5">
              {profile.displayName}
              {profile.profileVisibility === "private" && <LockIcon size={16} className="text-ink-faint shrink-0" />}
            </h1>
            <div className="mt-1.5 text-[12.5px] text-ink-muted flex gap-3">
              <span><b className="text-ink font-semibold">{published.length}</b> guide{published.length === 1 ? "" : "s"}</span>
              <Link href={`/u/${profile.username}/followers`} className="hover:underline"><b className="text-ink font-semibold">{stats.followers}</b> {stats.followers === 1 ? "follower" : "followers"}</Link>
              <Link href={`/u/${profile.username}/following`} className="hover:underline"><b className="text-ink font-semibold">{stats.following}</b> following</Link>
            </div>
          </div>
        </div>
        {profile.bio && <p className="mt-3 text-[13.5px] leading-relaxed italic">{profile.bio}</p>}
        <div className="mt-4">
          {own ? (
            <LinkButton href="/create" size="sm">Create a guide</LinkButton>
          ) : (
            <FollowButton userId={profile.id} initial={stats.viewerRequested ? "pending" : stats.viewerFollows} next={`/u/${profile.username}`} size="md" />
          )}
        </div>
      </div>

      <main className="px-4 mt-6 flex flex-col gap-4 pb-6">
        {locked ? (
          <EmptyState
            title="This account is private"
            body={`Follow @${profile.username} to see their guides once they approve.`}
          />
        ) : (
          <>
            {own && drafts.length > 0 && (
              <>
                <h2 className="font-display text-[22px] px-1">Drafts</h2>
                {drafts.map((c) => <GuideCard key={c.guide.id} data={c} showOwner={false} />)}
                <h2 className="font-display text-[22px] px-1 mt-2">Published</h2>
              </>
            )}
            {published.length === 0 && (
              <EmptyState title={own ? "No guides yet" : `${profile.displayName.split(" ")[0]} hasn't published a guide yet`} body={own ? "Say the places you love and we'll build the first one." : undefined} action={own ? <LinkButton href="/create" size="sm">Create by voice</LinkButton> : undefined} />
            )}
            {published.map((c) => <GuideCard key={c.guide.id} data={c} showOwner={false} />)}
          </>
        )}
      </main>
    </AppShell>
  );
}
