import { AppShell, TopBar } from "@/components/AppShell";
import { FeedbackForm } from "@/components/FeedbackForm";

export const metadata = { title: "Send feedback" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  return (
    <AppShell>
      <TopBar back="/" title="Send feedback" />
      <div className="px-5 pt-4 pb-8 flex flex-col gap-4">
        <p className="text-[13.5px] text-ink-muted leading-relaxed">MyGuide is in its pilot — every note helps. Screenshots are welcome too: send them to Hisham on WhatsApp and mention what you wrote here.</p>
        <FeedbackForm from={from} />
      </div>
    </AppShell>
  );
}
