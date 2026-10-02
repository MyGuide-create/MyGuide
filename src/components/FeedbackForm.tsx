"use client";

import { useState, useTransition } from "react";
import { sendFeedback } from "@/lib/actions/account";
import { Button, Spinner, Textarea } from "./ui";

export function FeedbackForm({ from }: { from?: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sent" | string>("idle");
  const [pending, start] = useTransition();
  if (state === "sent") {
    return <p className="rounded-2xl bg-sage-tint px-4 py-3 text-[13.5px]">Thank you — that goes straight to Hisham.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Something broken, confusing, or an idea? Tell us what you were doing and what happened." maxLength={4000} />
      {state !== "idle" && <p className="text-[12.5px] text-danger">{state}</p>}
      <Button
        disabled={pending || text.trim().length < 3}
        onClick={() =>
          start(async () => {
            const r = await sendFeedback(text, from);
            setState(r.ok ? "sent" : r.error ?? "Couldn't send that.");
          })
        }
      >
        {pending ? <Spinner /> : "Send feedback"}
      </Button>
    </div>
  );
}
