import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { PhotoPlacesFlow } from "@/components/PhotoPlacesFlow";
import { isAdmin } from "@/lib/admin";
import { requireUser, toPublicUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Places from your photos" };

/**
 * Team test (14 Oct 2026, admins only): pick photos, the phone reads where they were taken, MyGuide finds
 * the places there, you tick the ones to recommend. Only admins (ADMIN_USERNAMES) can open it.
 */
export default async function PhotoPlacesPage() {
  const user = await requireUser("/photo-places");
  if (!isAdmin(user)) notFound();
  return (
    <AppShell nav={false}>
      <TopBar back="/me" title="Photo places" avatarUser={toPublicUser(user)} />
      <PhotoPlacesFlow />
    </AppShell>
  );
}
