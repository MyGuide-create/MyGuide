import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { GuideCard } from "@/components/GuideCard";
import { HeartIcon, LockIcon } from "@/components/Icons";
import { Avatar, EmptyState, LinkButton } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getFollowStats, getUserByUsername, listGuidesByOwner } from "@/lib/guides";
import { hiddenUserIds, viewerBlocked } from "@/lib/blocks";
import { BlockButton } from "@/components/BlockButton";
import { ReportButton } from "@/components/ReportButton";
import { WishList } from "@/components/WishList";
import { listWishesFor } from "@/lib/wishes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await getUserByUsername(username);
  if (!profile) return { title: "Profile" };
  const title = `${profile.displayName} (@${profile.username})`;
  return { title, description: profile.bio?.trim() || `${profile.displayName}'s guides on MyGuide`, openGraph: { title, siteName: "MyGuide" } };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const draftSaved = (await searchParams).draft === "saved";
  const profile = await getUserByUsername(username);
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const own = viewer?.id === profile.id;
  const iBlocked = !!viewer && !own && (await viewerBlocked(viewer.id, profile.id));
  const hiddenFromMe = !!viewer && !own && (await hiddenUserIds(viewer.id)).has(profile.id);
  const [cards, stats, wishes] = await Promise.all([listGuidesByOwner(profile.id, viewer?.id), getFollowStats(profile.id, viewer?.id), listWishesFor(profile, viewer?.id)]);
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
        {(profile.instagram || profile.website) && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] font-medium">
            {profile.instagram && (
              <a href={`https://instagram.com/${profile.instagram}`} target="_blank" rel="noopener noreferrer" className="text-terracotta hover:underline">@{profile.instagram} on Instagram</a>
            )}
            {profile.website && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-terracotta hover:underline">{profile.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>
            )}
          </div>
        )}
        <div className="mt-4">
          {own ? (
            <div className="flex gap-2">
              <LinkButton href="/create" size="sm">Create a guide</LinkButton>
              <LinkButton href="/saved" size="sm" variant="outline"><HeartIcon size={14} /> Favourites</LinkButton>
            </div>
          ) : (
            !hiddenFromMe && (
              <div className="flex items-center gap-3">
                <FollowButton userId={profile.id} initial={stats.viewerRequested ? "pending" : stats.viewerFollows} next={`/u/${profile.username}`} size="md" followsYou={stats.followsViewer} />
                {stats.followsViewer && <span className="text-[12px] font-medium text-ink-muted rounded-full bg-cream-deep px-2.5 py-1">Follows you</span>}
              </div>
            )
          )}
        </div>
      </div>

      <main className="px-4 mt-6 flex flex-col gap-4 pb-6">
        {hiddenFromMe ? (
          <EmptyState title={iBlocked ? "You've blocked this person" : "Not available"} body={iBlocked ? "Unblock them to see their guides again." : "You can't see this person's guides."} />
        ) : locked ? (
          <EmptyState
            title="This account is private"
            body={`Follow @${profile.username} to see their guides once they approve.`}
          />
        ) : (
          <>
            {wishes && <WishList wishes={wishes} own={own} ownerName={profile.displayName} ownerUsername={profile.username} signedIn={!!viewer} />}
            {own && drafts.length > 0 && (
              <>
                <h2 id="drafts" className="font-display text-[22px] px-1 scroll-mt-20">Drafts</h2>
                {draftSaved && <p className="-mt-1 px-1 text-[12.5px] text-sage font-medium">Draft saved. Only you can see it — open it any time to keep going, then publish.</p>}
                {drafts.map((c) => <GuideCard key={c.guide.id} data={c} showOwner={false} />)}
                <h2 className="font-display text-[22px] px-1 mt-2">Published</h2>
              </>
            )}
            {published.length === 0 && (
              <EmptyState title={own ? "No guides yet" : `${profile.displayName.split(" ")[0]} hasn't published a guide yet`} body={own ? "Add the places you love, or paste a list you already have." : undefined} action={own ? <LinkButton href="/create" size="sm">Create a guide</LinkButton> : undefined} />
            )}
            {published.map((c) => <GuideCard key={c.guide.id} data={c} showOwner={false} />)}
          </>
        )}
        {viewer && !own && (
          <div className="mt-4 flex justify-center gap-5">
            <BlockButton userId={profile.id} name={profile.displayName} initial={iBlocked} next={`/u/${profile.username}`} />
            <ReportButton targetType="user" targetId={profile.id} />
          </div>
        )}
      </main>
    </AppShell>
  );
}
