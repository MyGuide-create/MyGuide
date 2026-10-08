"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { readUserError } from "@/lib/userError";
import { isOffline, OFFLINE_TEXT, reportError } from "@/lib/errorText";

/** Shown instead of Next's "This page couldn't load" when a page breaks. Plain words, and a way out. */
export default function ErrorPage({ error, retry, reset }: { error: unknown; retry?: () => void; reset: () => void }) {
  const path = usePathname() ?? "/";
  const mine = readUserError(error);
  const offline = !mine && isOffline(error);
  useEffect(() => {
    if (!mine && !offline) reportError(error, "A page couldn't load");
  }, [error, mine, offline]);

  const body = mine?.message ?? (offline ? OFFLINE_TEXT : "Something on our side went wrong. Try again — it usually works the second time. If it keeps happening, tell us and we’ll fix it.");
  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="w-full max-w-[480px] min-h-dvh px-6 py-24 text-center flex flex-col items-center">
        <p className="font-display text-[32px] leading-tight">{offline ? "No connection." : "That didn’t load."}</p>
        <p className="mt-3 text-[14px] text-ink-muted leading-relaxed">{body}</p>
        <div className="mt-7 flex flex-col gap-2.5 w-full max-w-[280px]">
          <button type="button" onClick={() => (retry ?? reset)()} className="h-12 rounded-full bg-terracotta text-white text-[15px] font-semibold">
            Try again
          </button>
          <Link href="/" className="h-12 rounded-full border border-line bg-paper text-[15px] font-medium inline-flex items-center justify-center">
            Go home
          </Link>
          <Link href={`/feedback?from=${encodeURIComponent(path)}`} className="mt-1 text-[13.5px] font-medium text-terracotta">
            Tell us what happened
          </Link>
        </div>
      </div>
    </div>
  );
}
