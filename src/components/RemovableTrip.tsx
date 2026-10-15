"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { removeTrip } from "@/lib/actions/trips";
import { errorText } from "@/lib/errorText";
import { XIcon } from "./Icons";
import { cx } from "./ui";

/**
 * A trip card with an ✕ in the corner to delete it (15 Oct 2026). Asks once on the card itself,
 * then the card goes and the page refreshes (Home then shows your next trip, if any).
 */
export function RemovableTrip({ tripId, city, tone = "light", className, children }: { tripId: string; city: string; tone?: "light" | "dark"; className?: string; children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "gone">("idle");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const dark = tone === "dark";

  if (state === "gone") return null;

  const remove = () =>
    start(async () => {
      setError("");
      try {
        await removeTrip(tripId);
        setState("gone");
        router.refresh();
      } catch (e) {
        setError(errorText(e, "Couldn't delete that trip."));
      }
    });

  return (
    <div className={cx("relative", className)}>
      {children}
      {state === "idle" && (
        <button
          type="button"
          aria-label={`Delete your ${city} trip`}
          onClick={() => setState("confirm")}
          className={cx(
            "absolute right-1.5 top-1.5 w-8 h-8 rounded-full flex items-center justify-center",
            dark ? "text-cream/60 hover:text-cream" : "text-ink-faint hover:text-ink",
          )}
        >
          <XIcon size={15} />
        </button>
      )}
      {state === "confirm" && (
        <div
          className={cx(
            "absolute inset-0 rounded-[inherit] flex items-center gap-2 px-3",
            dark ? "bg-ink text-cream" : "bg-paper text-ink border border-line/70",
          )}
          style={{ borderRadius: "inherit" }}
        >
          <span className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">
            Delete your {city} trip?
            {error && <span className="block text-[12px] font-normal text-terracotta">{error}</span>}
          </span>
          <button
            type="button"
            onClick={() => setState("idle")}
            disabled={pending}
            className={cx("rounded-full px-3 py-1.5 text-[13px] font-semibold", dark ? "text-cream/80" : "text-ink-muted")}
          >
            Keep
          </button>
          <button type="button" onClick={remove} disabled={pending} className="rounded-full bg-danger px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60">
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}
