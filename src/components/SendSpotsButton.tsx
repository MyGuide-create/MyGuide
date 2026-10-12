"use client";

import { useState, useTransition } from "react";
import { sendSpotsForWishes } from "@/lib/actions/spots";
import { CheckIcon } from "./Icons";
import { Spinner, cx } from "./ui";

/** "Send your 6 spots" to people who wished for a city: one tap, no guide needed. */
export function SendSpotsButton({ wishIds, label, dark = false, className }: { wishIds: string[]; label: string; dark?: boolean; className?: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () => {
    setError(null);
    start(async () => {
      const res = await sendSpotsForWishes(wishIds);
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  };
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending || sent}
        onClick={send}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors",
          dark ? "h-11 px-[18px] text-[14px]" : "h-10 px-3.5 text-[13px]",
          sent ? "bg-sage text-white" : dark ? "bg-terracotta text-white" : "border border-terracotta text-terracotta-deep bg-transparent",
          className,
        )}
      >
        {pending ? <Spinner /> : sent ? <><CheckIcon size={14} /> Sent</> : label}
      </button>
      {error && <span className={cx("text-[12px]", dark ? "text-cream-deep" : "text-danger")}>{error}</span>}
    </span>
  );
}
