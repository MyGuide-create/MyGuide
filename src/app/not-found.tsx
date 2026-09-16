import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <AppShell>
      <div className="px-6 py-24 text-center">
        <p className="font-display text-[32px]">Off the map.</p>
        <p className="mt-2 text-[13.5px] text-ink-muted">We couldn&apos;t find that page or guide.</p>
        <div className="mt-6"><LinkButton href="/">Back to the feed</LinkButton></div>
      </div>
    </AppShell>
  );
}
