import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideView } from "@/components/GuideView";
import { LinkButton } from "@/components/ui";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { canViewGuide, countGuidePlaces, getGuideBySlug, getGuideDetail, getUserById } from "@/lib/guides";
import { appUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/g/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) return { title: "Guide" };
  // Private guides and drafts: name the tab, but no preview card and keep them out of search engines.
  if (guide.visibility !== "public" || !guide.publishedAt) return { title: guide.title, robots: { index: false } };
  const base = await origin();
  const [owner, count] = await Promise.all([getUserById(guide.ownerId), countGuidePlaces(guide.id)]);
  const byline = [owner ? `by ${owner.displayName}` : null, `${count} ${count === 1 ? "place" : "places"}`, guide.city].filter(Boolean).join(" · ");
  const description = guide.description ? `${byline} — ${guide.description}` : `${byline} on MyGuide`;
  const rel = guide.coverMediaId ? `/api/media/${guide.coverMediaId}` : guide.coverUrl;
  const image = rel
    ? rel.startsWith("http") ? rel : `${base}${rel}`
    : `${base}/api/og?${new URLSearchParams({ title: guide.title, sub: byline })}`;
  const url = `${base}/g/${guide.slug}`;
  return {
    title: guide.title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "MyGuide", title: guide.title, description, url, images: [{ url: image, alt: guide.title }] },
    twitter: { card: "summary_large_image", title: guide.title, description, images: [image] },
  };
}

async function origin(): Promise<string> {
  const configured = appUrl();
  if (configured) return configured;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function GuidePage({ params, searchParams }: PageProps<"/g/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : null;
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();
  const user = await getCurrentUser();
  if (!(await canViewGuide(guide, user?.id, key))) {
    return (
      <AppShell>
        <TopBar back="/" title="Private guide" />
        <div className="px-6 py-16 text-center">
          <p className="font-display text-[28px]">This guide is private.</p>
          <p className="mt-2 text-[13.5px] text-ink-muted">Ask the creator to share it with you, or use the link they sent.</p>
          {!user && <div className="mt-6"><LinkButton href={`/login?next=${encodeURIComponent(`/g/${slug}${key ? `?key=${key}` : ""}`)}`}>Log in</LinkButton></div>}
        </div>
      </AppShell>
    );
  }
  const detail = await getGuideDetail(guide, user);
  const base = await origin();
  const shareUrl = `${base}/g/${guide.slug}${guide.visibility === "private" ? `?key=${guide.shareToken}` : ""}`;
  return (
    <AppShell>
      <TopBar back={user ? `/u/${detail.owner.username}` : "/"} transparent title={null} avatarUser={user ? toPublicUser(user) : null} />
      <div className="-mt-14">
        <GuideView detail={detail} viewerId={user?.id ?? null} viewer={user ? toPublicUser(user) : null} shareUrl={shareUrl} shareKey={key} />
      </div>
    </AppShell>
  );
}
