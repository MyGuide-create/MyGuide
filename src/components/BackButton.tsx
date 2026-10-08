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
        if (!prev || SKIP.some((r) => r.test(pathOnly(prev)))) return; // follow href
        e.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
