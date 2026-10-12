import { AppShell } from "@/components/AppShell";
import { RecordFlow } from "@/components/RecordFlow";
import { requireUser } from "@/lib/auth";
import { listGuidesByOwner } from "@/lib/guides";
import { isStash } from "@/lib/stash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a place" };

/** + → Add a place. Saves to My places; `?guide=<slug>` (one of your guides) saves straight into that guide. */
export default async function RecordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const guideParam = typeof sp.guide === "string" ? sp.guide : "";
  const user = await requireUser(guideParam ? `/record?guide=${encodeURIComponent(guideParam)}` : "/record");
  const cards = await listGuidesByOwner(user.id, user.id);
  const guides = cards.map((c) => ({ id: c.guide.id, slug: c.guide.slug, title: c.guide.title, placeCount: c.placeCount, city: c.guide.city }));
  const from = guideParam ? cards.find((c) => (c.guide.slug === guideParam || c.guide.id === guideParam) && c.guide.ownerId === user.id && !isStash(c.guide)) : undefined;
  return (
    <AppShell nav={false}>
      <RecordFlow guides={guides} intoGuide={from ? { id: from.guide.id, slug: from.guide.slug, title: from.guide.title } : null} />
    </AppShell>
  );
}
