import { AppShell, TopBar } from "@/components/AppShell";
import { VoiceCreate } from "@/components/VoiceCreate";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create a guide" };

export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const sp = await searchParams;
  // Land on the typed "name your guide" page by default — it has the voice
  // option right there via "Or say your places instead". Pass ?mode=voice to
  // deep-link straight into the voice flow instead.
  await requireUser(`/create${sp.mode === "voice" ? "?mode=voice" : ""}`);
  return (
    <AppShell nav={false}>
      <TopBar back="/" title="Create a guide" />
      <VoiceCreate initialMode={sp.mode === "voice" ? "voice" : "type"} />
    </AppShell>
  );
}
