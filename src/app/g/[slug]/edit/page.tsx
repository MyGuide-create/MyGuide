import { notFound, redirect } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideEditor } from "@/components/GuideEditor";
import { requireUser } from "@/lib/auth";
import { getGuideBySlug, getGuideDetail, isCollaborator } from "@/lib/guides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit guide" };

export default async function EditGuidePage({ params, searchParams }: PageProps<"/g/[slug]/edit">) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/g/${slug}/edit`);
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();
  if (guide.ownerId !== user.id && !(await isCollaborator(guide.id, user.id))) redirect(`/g/${slug}`);
  const detail = await getGuideDetail(guide, user);
  return (
    <AppShell nav={false} className="pb-24">
      <TopBar back={`/g/${slug}`} title="Edit guide" />
      <GuideEditor detail={detail} justForked={sp.forked === "1"} justCreated={sp.created === "1"} viewerId={user.id} />
    </AppShell>
  );
}
