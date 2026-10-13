"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideCity } from "@/lib/actions/admin";
import { cx } from "./ui";

const pill = "inline-flex items-center h-8 px-3 rounded-full text-[12.5px] font-semibold disabled:opacity-50";

/** Admin › Cities: Merge into the suggested city / Keep separate, or Undo a decision. */
export function CityDecisionButtons({ town, into, undo = false }: { town: string; into?: string | null; undo?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (target: string | null) =>
    start(async () => {
      const r = await decideCity(town, target);
      setMsg(r.ok ? (r.changed ? `Done · ${r.changed} place${r.changed === 1 ? "" : "s"} moved` : "Done") : r.error);
      router.refresh();
    });
  return (
    <span className="flex items-center gap-2 flex-wrap">
      {undo ? (
        <button type="button" disabled={pending} onClick={() => run(null)} className={cx(pill, "border border-line text-ink-muted")}>Undo</button>
      ) : (
        <>
          {into && (
            <button type="button" disabled={pending} onClick={() => run(into)} className={cx(pill, "bg-ink text-cream")}>
              Merge into {into}
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => run("")} className={cx(pill, "border border-line text-ink-muted")}>Keep separate</button>
        </>
      )}
      {pending && <span className="text-[12px] text-ink-faint">Saving…</span>}
      {!pending && msg && <span className="text-[12px] text-sage font-medium">{msg}</span>}
    </span>
  );
}
