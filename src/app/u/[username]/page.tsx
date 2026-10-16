import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { FollowButton } from "@/components/FollowButton";
import { LockIcon } from "@/components/Icons";
import { Avatar, EmptyState, LinkButton } from "@/components/ui";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { AskForGuideButton } from "@/components/AskForGuide";
import { getFollowStats, getUserByUsername, listGuidesByOwner } from "@/lib/guides";
import { loadRecommendations, mergeSpots, ownSpotKeys, type Recommendation } from "@/lib/citySpots";
import { CityTileImage } from "@/components/CityImage";
import { GuideCover } from "@/components/GuideCover";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
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
  const [cards, stats, wishes, recs] = await Promise.all([
    listGuidesByOwner(profile.id, viewer?.id),
    getFollowStats(profile.id, viewer?.id),
    listWishesFor(profile, viewer?.id),
    loadRecommendations({ viewerId: viewer?.id, ownerIds: [profile.id] }),
  ]);
  // The spots they recommend (published guides and places recommended on their own), per city — what others see.
  const byCity = new Map<string, Recommendation[]>();
  for (const r of recs) if (r.city) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r]);
  const spotCities = [...byCity.entries()].map(([city, list]) => ({ city, spots: mergeSpots(list) })).sort((a, b) => b.spots.length - a.spots.length);
  const spotCount = spotCities.reduce((n, c) => n + c.spots.length, 0);
  // Shared taste (15 Oct 2026): places you both recommend / have.
  const shared = viewer && !own ? new Set(spotCities.flatMap((c) => c.spots.map((s) => s.key))) : null;
  const commonCount = shared && viewer ? [...(await ownSpotKeys(viewer.id)).values()].flatMap((k) => [...k]).filter((k) => shared.has(k)).length : 0;
  const published = cards.filter((c) => c.guide.publishedAt);
  const drafts = cards.filter((c) => !c.guide.publishedAt);
  // listGuidesByOwner already hides guides from a locked private profile, but the page still
  // needs to tell "private and you can't see it yet" apart from "genuinely nothing published".
  const countryOf = new Map(recs.filter((r) => r.place.country).map((r) => [r.city, r.place.country]));
  const cityPhotos = await cityPhotosFor(
    spotCities.map((c) => c.city),
    new Map(spotCities.filter((c) => countryOf.get(c.city)).map((c) => [cityPhotoKey(c.city), countryOf.get(c.city)!])),
  );
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
              <span><b className="text-ink font-semibold">{spotCount}</b> spot{spotCount === 1 ? "" : "s"}</span>
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
              <LinkButton href="/stats" size="sm" variant="outline">Stats</LinkButton>
            </div>
          ) : (
            !hiddenFromMe && (
              <div className="flex items-center gap-3">
                <FollowButton userId={profile.id} initial={stats.viewerRequested ? "pending" : stats.viewerFollows} next={`/u/${profile.username}`} size="md" followsYou={stats.followsViewer} />
                {stats.followsViewer && <span className="text-[12px] font-medium text-ink-muted rounded-full bg-cream-deep px-2.5 py-1">Follows you</span>}
              </div>
            )
          )}
          {!own && !hiddenFromMe && commonCount > 0 && (
            <p className="mt-2.5 text-[13px] text-sage font-medium">
              You both recommend {commonCount} place{commonCount === 1 ? "" : "s"}
              {!stats.viewerFollows && commonCount >= 2 ? " — your taste matches" : ""}
            </p>
          )}
          {!own && !hiddenFromMe && (
            viewer ? (
              <AskForGuideButton person={toPublicUser(profile)} className="mt-2.5" />
            ) : (
              <LinkButton href={`/signup?next=${encodeURIComponent(`/u/${profile.username}`)}`} size="sm" variant="outline" className="mt-2.5">Ask {profile.displayName.split(" ")[0]} for spots</LinkButton>
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
            {/* Cities first (16 Oct 2026): the spots they recommend, city by city, as photo tiles. */}
            {spotCities.length > 0 ? (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="font-display text-[22px]">{own ? "Your cities" : `${profile.displayName.split(" ")[0]}\u2019s cities`}</h2>
                  {own && <span className="text-[12px] text-ink-muted">What friends see</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {spotCities.map((c) => (
                    <Link key={c.city} href={`/city?${new URLSearchParams({ name: c.city, friend: profile.username }).toString()}`} className="flex flex-col gap-1.5 min-w-0">
                      <CityTileImage photo={cityPhotos.get(cityPhotoKey(c.city))} city={c.city} className="h-[128px]" />
                      <span className="px-0.5 text-[12.5px] text-ink-muted truncate">
                        <b className="font-semibold text-ink">{c.spots.length} spot{c.spots.length === 1 ? "" : "s"}</b>
                        {" · "}
                        {c.spots.slice(0, 2).map((x) => x.place.name).join(", ")}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : (
              own && (
                <EmptyState
                  title="No recommended spots yet"
                  body="Recommend places from My spots and they show here, city by city, for friends."
                  action={<LinkButton href="/my-places" size="sm">Go to My spots</LinkButton>}
                />
              )
            )}

            {(published.length > 0 || (own && drafts.length > 0)) && (
              <section className="flex flex-col gap-2.5 pt-2">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="font-display text-[22px]">Guides</h2>
                  {own && <Link href="/create" className="text-[13px] font-semibold text-terracotta-deep">+ New guide</Link>}
                </div>
                {own && draftSaved && <p className="px-1 text-[12.5px] text-sage font-medium">Draft saved. Only you can see it. Open it any time to keep going, then publish.</p>}
                <ul id="drafts" className="flex flex-col rounded-2xl border border-line bg-paper divide-y divide-line overflow-hidden scroll-mt-20">
                  {[...(own ? drafts : []), ...published].map((c) => (
                    <li key={c.guide.id}>
                      <Link href={`/g/${c.guide.slug}`} className="flex items-center gap-3 px-3 py-2.5">
                        <GuideCover guide={c.guide} ownerUsername={c.owner.username} bare thumb className="w-14 h-14 rounded-xl shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-[14.5px] truncate">{c.guide.title}</span>
                          <span className="block text-[12.5px] text-ink-muted truncate">
                            {[c.coverCity, `${c.placeCount} spot${c.placeCount === 1 ? "" : "s"}`, !c.guide.publishedAt ? "Draft" : own && c.guide.visibility !== "public" ? "Private" : ""].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span aria-hidden className="text-ink-faint">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!own && spotCities.length === 0 && published.length === 0 && (
              <EmptyState title={`${profile.displayName.split(" ")[0]} hasn't shared any spots yet`} />
            )}

            {wishes && <WishList wishes={wishes} own={own} ownerName={profile.displayName} ownerUsername={profile.username} signedIn={!!viewer} />}
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
