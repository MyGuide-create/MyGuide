"use client";

import { useEffect, useState } from "react";
import { summarizeHours, type HoursSummary as Summary } from "@/lib/places/hours";
import { ClockIcon } from "./Icons";
import { cx } from "./ui";

/**
 * "Open now · closes 11 PM" with the full week underneath. Computed in the
 * browser after mount (time-dependent), so server and client HTML match.
 */
export function HoursSummary({ hours, tz, size = "sm" }: { hours: string[]; tz: string | null; size?: "sm" | "md" }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    const update = () => setSummary(summarizeHours(hours, tz));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, [hours, tz]);
  if (!hours.length) return null;
  const md = size === "md";
  return (
    <details className={cx("min-w-0", md ? "text-[13.5px]" : "text-[11px] text-ink-muted")}>
      <summary className={cx("cursor-pointer list-none inline-flex items-center", md ? "gap-2.5" : "gap-1")}>
        <ClockIcon size={md ? 17 : 12} className={md ? "text-terracotta shrink-0" : undefined} />
        {summary ? (
          <span className="inline-flex items-center gap-1.5">
            {summary.open !== null && <span className={cx("inline-block rounded-full", md ? "w-2 h-2" : "w-1.5 h-1.5", summary.open ? "bg-sage" : "bg-terracotta")} />}
            <span className={cx(summary.open === true && "text-sage font-medium", summary.open === false && "text-terracotta-deep")}>{summary.label}</span>
          </span>
        ) : (
          "Hours"
        )}
      </summary>
      <ul className={cx("mt-1.5 space-y-0.5", md ? "pl-[27px] text-[12.5px] text-ink-muted" : "pl-4")}>
        {hours.map((h, i) => (
          <li key={h} className={cx(summary?.todayIndex === i && "font-semibold text-ink")}>{h}</li>
        ))}
      </ul>
    </details>
  );
}
