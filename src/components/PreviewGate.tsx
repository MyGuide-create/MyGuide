import Link from "next/link";
import { AppShell } from "./AppShell";

/** Shown instead of a preview page to signed-in people who aren't admins, so it's clear why. */
export function PreviewNotAllowed({ username }: { username: string }) {
  return (
    <AppShell>
      <div className="px-6 pt-16 flex flex-col gap-3">
        <h1 className="font-display text-[30px] leading-tight">This is a preview</h1>
        <p className="text-[14.5px] text-ink-muted leading-relaxed">
          Only admins can open it. You&apos;re signed in as <span className="font-semibold text-ink">@{username}</span>.
        </p>
        <Link href="/" className="mt-2 text-[14px] font-medium text-terracotta-deep">Go to Home</Link>
      </div>
    </AppShell>
  );
}
