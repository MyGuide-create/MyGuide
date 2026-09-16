"use client";

import { useState, useTransition } from "react";
import { toggleFollow } from "@/lib/actions/social";
import { Button } from "./ui";

export function FollowButton({ userId, initial, next, size = "sm" }: { userId: string; initial: boolean; next?: string; size?: "sm" | "md" }) {
  const [following, setFollowing] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Button
      size={size}
      variant={following ? "ghost" : "outline"}
      className={following ? "border border-line text-ink-muted" : ""}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setFollowing((f) => !f);
          try {
            const r = await toggleFollow(userId, next);
            setFollowing(r.following);
          } catch {
            setFollowing((f) => !f);
          }
        })
      }
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
