"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFollow } from "@/lib/actions/social";
import type { FollowStatus } from "@/lib/follow";
import { cx } from "./ui";

/**
 * Small "Follow" next to someone you don't follow yet, on things filled in from everyone on
 * MyGuide (Home "New on MyGuide", city page "More from MyGuide", wish rows). Logged out → sign up.
 */
export function FollowPill({ userId, signedIn, next, className }: { userId: string; signedIn: boolean; next: string; className?: string }) {
  const [status, setStatus] = useState<FollowStatus>("none");
  const [pending, start] = useTransition();
  const cls = cx(
    "shrink-0 inline-flex items-center h-7 px-2.5 rounded-full text-[12px] font-semibold transition-colors",
    status === "none" ? "border border-terracotta text-terracotta-deep" : "border border-line text-ink-muted",
    className,
  );
  if (!signedIn) {
    return (
      <Link href={`/signup?why=follow&next=${encodeURIComponent(next)}`} className={cls}>
        Follow
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      className={cls}
      onClick={() =>
        start(async () => {
          const prev = status;
          setStatus(status === "none" ? "pending" : "none");
          try {
            setStatus((await toggleFollow(userId)).status);
          } catch {
            setStatus(prev);
          }
        })
      }
    >
      {status === "accepted" ? "Following" : status === "pending" ? "Requested" : "Follow"}
    </button>
  );
}
