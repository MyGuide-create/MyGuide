import type { ReactNode } from "react";
import { AppShell, TopBar } from "./AppShell";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <AppShell>
      <TopBar back="/me" title={title} />
      <article className="px-5 pt-4 pb-10 text-[13.5px] leading-relaxed text-ink [&_h2]:font-display [&_h2]:text-[21px] [&_h2]:mt-6 [&_h2]:mb-1.5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        <p className="text-[12px] text-ink-faint">Last updated {updated} · Pilot version</p>
        {children}
      </article>
    </AppShell>
  );
}
