"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Back arrows return you to the screen you came from (like a native app), instead of a fixed page.
 * We keep a small trail of in-app screens in sessionStorage; when there's no in-app screen to go
 * back to (opened from a shared link, fresh tab) the arrow falls back to its `href`.
 */
const KEY = "mg_trail";
const MAX = 30;
/** Screens it makes no sense to step back into (one-off flows) — fall back to `href` instead. */
const SKIP = [/^\/create/, /^\/record/, /^\/welcome/, /^\/login/, /^\/signup/, /^\/g\/[^/]+\/edit/];

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function write(trail: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {}
}
const pathOnly = (u: string) => u.split("?")[0];

/** Mounted once per page (in AppShell): records each screen visited. */
export function NavTrail() {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();
  useEffect(() => {
    const here = pathname + (qs ? `?${qs}` : "");
    const trail = read();
    const last = trail[trail.length - 1];
    if (last && pathOnly(last) === pathname) trail[trail.length - 1] = here; // same screen, new filters
    else if (trail.length >= 2 && pathOnly(trail[trail.length - 2]) === pathname) trail.pop(); // went back
    else trail.push(here);
    write(trail);
  }, [pathname, qs]);
  return null;
}

/**
 * Leaving a one-off flow (Add a place, Import, intro…): the last real screen before it, skipping
 * the flows themselves — so closing Import after Add a place goes home, not back into Add a place
 * (which used to bounce between the two). `fallback` when there's no such screen.
 */
export function exitTarget(fallback: string): string {
  const trail = read();
  for (let i = trail.length - 2; i >= 0; i--) {
    if (!SKIP.some((r) => r.test(pathOnly(trail[i])))) return trail[i];
  }
  return fallback;
}

/** Close a flow: replace it (so the phone's back gesture doesn't land in it again) with the screen before it. */
export function useExitFlow() {
  const router = useRouter();
  return (fallback = "/") => router.replace(exitTarget(fallback));
}

export function BackButton({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      aria-label="Back"
      className={className}
      onClick={(e) => {
        const trail = read();
        const prev = trail[trail.length - 2];
        if (!prev) return; // opened from a link: follow href
        e.preventDefault();
        // The screen before is a flow (Add a place → Import): go to the one before the flows instead.
        if (SKIP.some((r) => r.test(pathOnly(prev)))) router.push(exitTarget(href));
        else router.back();
      }}
    >
      {children}
    </Link>
  );
}
