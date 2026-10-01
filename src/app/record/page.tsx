import { AppShell } from "@/components/AppShell";
import { RecordFlow } from "@/components/RecordFlow";
import { requireUser } from "@/lib/auth";
import { listGuidesByOwner } from "@/lib/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record a place" };

export default async function RecordPage() {
  const user = await requireUser("/record");
  const cards = await listGuidesByOwner(user.id, user.id);
  const guides = cards.map((c) => ({ id: c.guide.id, slug: c.guide.slug, title: c.guide.title, placeCount: c.placeCount }));
  return (
    <AppShell nav={false}>
      <RecordFlow guides={guides} />
    </AppShell>
  );
}
