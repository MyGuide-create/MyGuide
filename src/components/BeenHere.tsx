"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { errorText } from "@/lib/errorText";
import { toggleReaction } from "@/lib/actions/saved";
import { beenNotForMe, vouchForPlace } from "@/lib/actions/vouch";
import { myPlacesHref } from "@/lib/stash";
import { CheckIcon, XIcon } from "./Icons";
import { Button, Input, Spinner, Textarea, cx } from "./ui";

/**
 * "Been here" on someone else's place (14 Oct 2026). Tapping it asks "Would you recommend it?":
 * yes makes it one of your spots (your own words, theirs stay theirs) so the city page shows you both
 * recommend it, and the friend hears you went; not really just marks it.
 */
export function BeenHere({
  placeId,
  placeName,
  ownerFirst,
  initial,
  count,
  signedIn,
  youHaveIt,
}: {
  placeId: string;
  placeName: string;
  ownerFirst: string;
  initial: boolean;
  count: number;
  signedIn: boolean;
  /** You already have this spot (My places or a guide): no "recommend it?" step. */
  youHaveIt: boolean;
}) {
  const path = usePathname();
  const [been, setBeen] = useState(initial);
  const [n, setN] = useState(count);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"ask" | "words" | "done">("ask");
  const [note, setNote] = useState("");
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ city: string } | null>(null);
  const [, start] = useTransition();

  const cls = cx(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
    been ? "border-sage bg-sage-tint text-sage" : "border-line bg-paper text-ink",
  );
  const label = (
    <>
      <CheckIcon size={14} />
      {been ? "Been here" : "Been here?"}
      {n > 0 && <span className="tabular-nums text-ink-muted font-normal">{n}</span>}
    </>
  );

  if (!signedIn) return <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} className={cls}>{label}</Link>;

  const tap = () => {
    const on = !been;
    setBeen(on);
    setN((c) => Math.max(0, c + (on ? 1 : -1)));
    start(async () => {
      try {
        await toggleReaction(placeId, "been");
      } catch {
        setBeen(!on);
      }
    });
    if (on && !youHaveIt && !done) {
      setStep("ask");
      setError(null);
      setOpen(true);
    }
  };

  const vouch = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await vouchForPlace(placeId, { note, tip });
      setDone({ city: r.city });
      setStep("done");
    } catch (e) {
      setError(errorText(e, "Couldn't add it."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={been} className={cls} onClick={tap}>
          {label}
        </button>
        {done && (
          <Link href={myPlacesHref(done.city)} className="text-[12.5px] font-medium text-sage">
            ✓ One of your spots now
          </Link>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Would you recommend it?">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full max-w-[480px] rounded-t-[28px] bg-cream px-5 pt-3 pb-8 safe-bottom max-h-[85dvh] overflow-y-auto fade-up">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" />
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-display text-[24px] leading-tight">
                {step === "done" ? "It's one of your spots now" : step === "words" ? "In your own words" : `You've been to ${placeName}!`}
              </h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="w-9 h-9 -mr-2 shrink-0 flex items-center justify-center rounded-full text-ink-muted">
                <XIcon size={18} />
              </button>
            </div>

            {step === "ask" && (
              <>
                <p className="text-[14px] text-ink-muted leading-relaxed">Would you recommend it? It becomes one of your spots too, and friends see you both recommend it.</p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <Button size="lg" onClick={() => setStep("words")}>Yes, I recommend it</Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      beenNotForMe(placeId).catch(() => {});
                    }}
                  >
                    Not really
                  </Button>
                </div>
              </>
            )}

            {step === "words" && (
              <>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">Optional — add them now or later from the place. {ownerFirst}&apos;s words stay on their spot.</p>
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">Description – what makes it special</p>
                    <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you love it" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">A tip</p>
                    <Input value={tip} onChange={(e) => setTip(e.target.value)} placeholder="What to order, where to sit, best time to go…" />
                  </div>
                </div>
                {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
                <Button size="lg" className="mt-4 w-full" onClick={vouch} disabled={busy}>
                  {busy ? <Spinner /> : null} {note.trim() || tip.trim() ? "Add to my spots" : "Add to my spots — words later"}
                </Button>
              </>
            )}

            {step === "done" && done && (
              <>
                <p className="text-[14px] text-ink-muted leading-relaxed">
                  It&apos;s recommended in My places{done.city ? ` under My ${done.city}` : ""}, and on the city page with {ownerFirst}&apos;s. {ownerFirst} will hear you went.
                </p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <Button size="lg" onClick={() => setOpen(false)}>Done</Button>
                  <Link href={myPlacesHref(done.city)} className="text-center text-[14px] font-semibold text-terracotta py-2">
                    See My places
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
