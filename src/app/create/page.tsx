import { AppShell, TopBar } from "@/components/AppShell";
import { VoiceCreate } from "@/components/VoiceCreate";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create a guide" };

export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const sp = await searchParams;
  await requireUser(`/create${sp.mode === "type" ? "?mode=type" : ""}`);
  return (
    <AppShell nav={false}>
      <TopBar back="/" title="Create a guide" />
      <VoiceCreate initialMode={sp.mode === "type" ? "type" : "voice"} />
    </AppShell>
  );
}
