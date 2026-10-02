"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockUser, unblockUser } from "@/lib/actions/account";
import { Spinner, cx } from "./ui";

export function BlockButton({ userId, name, initial, next, className }: { userId: string; name: string; initial: boolean; next: string; className?: string }) {
  const [blocked, setBlocked] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!blocked && !confirm(`Block ${name}? You won't see each other's guides or comments, and any follows between you are removed.`)) return;
        start(async () => {
          if (blocked) await unblockUser(userId, next);
          else await blockUser(userId, next);
          setBlocked(!blocked);
          router.refresh();
        });
      }}
      className={cx("text-[12px] text-ink-faint hover:text-danger inline-flex items-center gap-1", className)}
    >
      {pending && <Spinner className="w-3 h-3" />}
      {blocked ? "Unblock" : "Block"}
    </button>
  );
}
