"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { errorText } from "@/lib/errorText";
import { toggleReaction } from "@/lib/actions/saved";
import { beenNotForMe, vouchForPlace } from "@/lib/actions/vouch";
import { FollowPill } from "./FollowPill";
import { myPlacesHref } from "@/lib/stash";
import { CheckIcon, RecommendIcon, XIcon } from "./Icons";
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
  variant = "chip",
  refreshOnDone = false,
}: {
  placeId: string;
  placeName: string;
  ownerFirst: string;
  initial: boolean;
  count: number;
  signedIn: boolean;
  /** You already have this spot (My spots or a guide): no "recommend it?" step. */
  youHaveIt: boolean;
  /** "chip": "Been here?" on a place page. "icon": a small ✓ on a city page row (14 Oct 2026). "bar": in a Home post's action row (17 Oct 2026). */
  variant?: "chip" | "icon" | "bar";
  /** Reload the page once it's yours (My spots: the saved row moves into your own spots). */
  refreshOnDone?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [been, setBeen] = useState(initial);
  const [n, setN] = useState(count);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"ask" | "words" | "done">("ask");
  const [note, setNote] = useState("");
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ city: string; followOwner: string | null } | null>(null);
  const [, start] = useTransition();

  const cls = cx(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
    been ? "border-sage bg-sage-tint text-sage" : "border-line bg-paper text-ink",
  );
  const label = (
    <>
      <CheckIcon size={14} />
      {been ? (youHaveIt || done ? "Recommended" : "Been here") : "Recommend"}
      {n > 0 && <span className="tabular-nums text-ink-muted font-normal">{n}</span>}
    </>
  );

  const barCls = cx(
    "inline-flex items-center gap-1.5 h-8 rounded-full border pl-2 pr-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
    been ? "border-sage-soft bg-sage-tint text-sage" : "border-line text-ink",
  );
  const barBody = (
    <>
      <RecommendIcon size={18} filled={been} />
      {been ? (youHaveIt || done ? "Recommended" : "Been here") : "Recommend"}
    </>
  );

  const iconCls = cx(
    "w-9 h-9 -m-1.5 flex items-center justify-center rounded-full",
    been ? "text-sage" : "text-ink-faint hover:text-sage",
  );
  const iconBody = (
    <span className={cx("w-[22px] h-[22px] rounded-full border-[1.6px] flex items-center justify-center", been ? "bg-sage border-sage text-white" : "border-current")}>
      <CheckIcon size={13} />
    </span>
  );
  if (!signedIn)
    return (
      <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} className={variant === "icon" ? iconCls : variant === "bar" ? barCls : cls} aria-label="Recommend">
        {variant === "icon" ? iconBody : variant === "bar" ? barBody : label}
      </Link>
    );

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

  /** Close the sheet; on a city page row, refresh once it's yours so the row shows ✓ Yours. */
  const close = () => {
    setOpen(false);
    if (done && (variant !== "chip" || refreshOnDone)) router.refresh();
  };

  const vouch = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await vouchForPlace(placeId, { note, tip });
      setDone({ city: r.city, followOwner: r.followOwner });
      setStep("done");
    } catch (e) {
      setError(errorText(e, "Couldn't add it."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <button type="button" aria-pressed={been} aria-label={been ? "Recommended (tap to undo)" : "Recommend"} title="Recommend" className={iconCls} onClick={tap}>
          {iconBody}
        </button>
      ) : variant === "bar" ? (
        <button type="button" aria-pressed={been} title="Been here? Recommend it too" className={barCls} onClick={tap}>
          {barBody}
        </button>
      ) : (
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
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Recommend it?">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full max-w-[480px] rounded-t-[28px] bg-cream px-5 pt-3 pb-8 safe-bottom max-h-[85dvh] overflow-y-auto fade-up">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" />
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-display text-[24px] leading-tight">
                {step === "done" ? "It's one of your spots now" : step === "words" ? "In your own words" : `Recommend ${placeName}?`}
              </h2>
              <button type="button" aria-label="Close" onClick={close} className="w-9 h-9 -mr-2 shrink-0 flex items-center justify-center rounded-full text-ink-muted">
                <XIcon size={18} />
              </button>
            </div>

            {step === "ask" && (
              <>
                <p className="text-[14px] text-ink-muted leading-relaxed">Been and loved it? It becomes one of your spots too, and friends see you both recommend it.</p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <Button size="lg" onClick={() => setStep("words")}>Yes, recommend it</Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      beenNotForMe(placeId).catch(() => {});
                    }}
                  >
                    I&apos;ve been, but no
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
                  It&apos;s recommended in My spots{done.city ? ` under My ${done.city}` : ""}, and on the city page with {ownerFirst}&apos;s. {ownerFirst} will hear you went.
                </p>
                {done.followOwner && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-paper border border-line/80 px-3.5 py-2.5">
                    <span className="text-[13px] leading-snug">Follow {ownerFirst} to see their next spots on Home.</span>
                    <FollowPill userId={done.followOwner} signedIn next={path} />
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2.5">
                  <Button size="lg" onClick={close}>Done</Button>
                  <Link href={myPlacesHref(done.city)} className="text-center text-[14px] font-semibold text-terracotta py-2">
                    See My spots
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
