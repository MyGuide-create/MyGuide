import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { ConnectionsList } from "@/components/ConnectionsList";
import { EmptyState, cx } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getFollowStats, getUserByUsername, listConnections } from "@/lib/guides";

/** Followers / Following list for a profile, with tabs to switch between them. */
export async function ConnectionsView({ username, kind }: { username: string; kind: "followers" | "following" }) {
  const profile = await getUserByUsername(username);
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const own = viewer?.id === profile.id;
  const stats = await getFollowStats(profile.id, viewer?.id);
  const locked = profile.profileVisibility === "private" && !own && !stats.viewerFollows;
  const rows = locked ? [] : await listConnections(profile.id, kind, viewer?.id);
  const base = `/u/${profile.username}`;

  const tab = (k: "followers" | "following", label: string, count: number) => (
    <Link
      href={`${base}/${k}`}
      replace
      aria-current={kind === k ? "page" : undefined}
      className={cx("flex-1 text-center pb-2.5 text-[14px] font-medium border-b-2 transition-colors", kind === k ? "border-terracotta text-ink" : "border-transparent text-ink-muted")}
    >
      <span className="tabular-nums">{count}</span> {label}
    </Link>
  );

  return (
    <AppShell>
      <TopBar back={base} title={`@${profile.username}`} />
      <div className="px-5 pt-3 flex border-b border-line/70">
        {tab("followers", "followers", stats.followers)}
        {tab("following", "following", stats.following)}
      </div>
      <main className="px-4 pt-3 pb-6">
        {locked ? (
          <EmptyState title="This account is private" body={`Follow @${profile.username} to see who they follow and who follows them.`} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={kind === "followers" ? "No followers yet" : "Not following anyone yet"}
            body={own ? (kind === "followers" ? "Share a guide and people can follow you from it." : "Find creators from the search or the feed.") : undefined}
          />
        ) : (
          <ConnectionsList rows={rows} showFollow={!!viewer} next={`${base}/${kind}`} followsYou={own && kind === "followers"} />
        )}
      </main>
    </AppShell>
  );
}
