"use client";

import { useState, useTransition } from "react";
import { toggleFollow, type FollowStatus } from "@/lib/actions/social";
import { Button } from "./ui";

export function FollowButton({ userId, initial, next, size = "sm" }: { userId: string; initial: FollowStatus | boolean; next?: string; size?: "sm" | "md" }) {
  const initialStatus: FollowStatus = typeof initial === "boolean" ? (initial ? "accepted" : "none") : initial;
  const [status, setStatus] = useState<FollowStatus>(initialStatus);
  const [pending, start] = useTransition();
  const label = status === "accepted" ? "Following" : status === "pending" ? "Requested" : "Follow";
  return (
    <Button
      size={size}
      variant={status === "none" ? "outline" : "ghost"}
      className={status !== "none" ? "border border-line text-ink-muted" : ""}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const prev = status;
          setStatus(status === "none" ? "pending" : "none"); // optimistic; corrected below
          try {
            const r = await toggleFollow(userId, next);
            setStatus(r.status);
          } catch {
            setStatus(prev);
          }
        })
      }
    >
      {label}
    </Button>
  );
}
