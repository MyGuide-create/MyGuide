"use client";

import { useState, useTransition } from "react";
import { reportContent } from "@/lib/actions/account";
import { Sheet } from "./ShareSheet";
import { Button, Spinner, Textarea, cx } from "./ui";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "spam", label: "Spam or advertising" },
  { value: "offensive", label: "Offensive or inappropriate" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "wrong", label: "Wrong or misleading information" },
  { value: "other", label: "Something else" },
];

/** "Report" link that opens a short sheet: pick a reason, optional details, send. */
export function ReportButton({
  targetType,
  targetId,
  label = "Report",
  className,
}: {
  targetType: "guide" | "user" | "comment";
  targetId: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const what = targetType === "user" ? "this person" : targetType === "comment" ? "this comment" : "this guide";

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setDone(false); }} className={cx("text-[12px] text-ink-faint hover:text-danger", className)}>
        {label}
      </button>
      {open && (
        <Sheet title={done ? "Thanks for telling us" : `Report ${what}`} onClose={() => setOpen(false)}>
          {done ? (
            <div className="flex flex-col gap-4">
              <p className="text-[13.5px] text-ink-muted leading-relaxed">We&apos;ll take a look. If someone is bothering you, you can also block them from their profile.</p>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                {REASONS.map((r) => (
                  <label key={r.value} className={cx("flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-[13.5px] cursor-pointer", reason === r.value ? "border-terracotta bg-terracotta-tint/60" : "border-line bg-paper")}>
                    <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[var(--color-terracotta)]" />
                    {r.label}
                  </label>
                ))}
              </div>
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Anything else we should know? (optional)" maxLength={1000} />
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await reportContent({ targetType, targetId, reason, details });
                    setDone(true);
                  })
                }
              >
                {pending ? <Spinner /> : "Send report"}
              </Button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
