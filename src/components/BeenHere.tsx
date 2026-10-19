"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { errorText } from "@/lib/errorText";
import { beenNotForMe, vouchForPlace } from "@/lib/actions/vouch";
import { FollowPill } from "./FollowPill";
import { myPlacesHref } from "@/lib/stash";
import { CheckIcon, RecommendIcon, XIcon } from "./Icons";
import { Button, Input, Spinner, Textarea, cx } from "./ui";

/**
 * Vouch for someone else's place (19 Oct 2026: Save / Vouch). Two words in the app: Save = "I want
 * to try it" (only you see it), Vouch = "I've been and I stand by it" (friends see it). "Been here"
 * is never a button on its own any more; it's only ever asked as a question.
 * - "chip": the place page, "Vouch for it".
 * - "bar": a Home post's action row, "Vouch".
 * - "icon": a small ✓ (kept for old rows).
 * - "madeit": a saved spot in My spots, "Vouch" (plus "Not for me? Remove from Saved" in the sheet).
 * No "Been here?" step (19 Oct 2026): tapping goes straight to vouching, words optional.
 * Vouching makes it one of your spots (your own words, theirs stay theirs), and the friend hears you went.
 */
export function BeenHere({
  placeId,
  placeName,
  ownerFirst,
  signedIn,
  youHaveIt,
  variant = "chip",
  refreshOnDone = false,
}: {
  placeId: string;
  placeName: string;
  ownerFirst: string;
  /** Unused since 19 Oct 2026 ("been" is never shown); kept so callers don't change. */
  initial?: boolean;
  count?: number;
  signedIn: boolean;
  /** You already vouch for this spot: nothing to ask. */
  youHaveIt: boolean;
  variant?: "chip" | "icon" | "bar" | "madeit";
  /** Reload the page once it's yours (My spots: the saved row moves into your own spots). */
  refreshOnDone?: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"words" | "done">("words");
  const [note, setNote] = useState("");
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ city: string; followOwner: string | null } | null>(null);
  const [, start] = useTransition();
  const vouched = youHaveIt || !!done;

  const cls = cx(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
    vouched ? "border-sage bg-sage-tint text-sage" : "border-line bg-paper text-ink",
  );
  const label = (
    <>
      <CheckIcon size={14} />
      {vouched ? "You vouch for it" : "Vouch for it"}
    </>
  );

  const barCls = cx(
    "inline-flex items-center gap-1.5 h-8 rounded-full border pl-2 pr-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors",
    vouched ? "border-sage-soft bg-sage-tint text-sage" : "border-line text-ink",
  );
  const barBody = (
    <>
      <RecommendIcon size={18} filled={vouched} />
      {vouched ? "Vouched" : "Vouch"}
    </>
  );

  const iconCls = cx("w-9 h-9 -m-1.5 flex items-center justify-center rounded-full", vouched ? "text-sage" : "text-ink-faint hover:text-sage");
  const iconBody = (
    <span className={cx("w-[22px] h-[22px] rounded-full border-[1.6px] flex items-center justify-center", vouched ? "bg-sage border-sage text-white" : "border-current")}>
      <CheckIcon size={13} />
    </span>
  );
  const madeCls = "shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold border border-terracotta-soft bg-paper text-terracotta-deep";

  if (!signedIn)
    return (
      <Link href={`/signup?why=save&next=${encodeURIComponent(path)}`} className={variant === "icon" ? iconCls : variant === "bar" ? barCls : variant === "madeit" ? madeCls : cls} aria-label="Vouch">
        {variant === "icon" ? iconBody : variant === "bar" ? barBody : variant === "madeit" ? "Vouch" : label}
      </Link>
    );

  const tap = () => {
    if (vouched) return;
    setStep("words");
    setError(null);
    setOpen(true);
  };

  /** Close the sheet; refresh once something changed so rows move to where they now belong. */
  const close = () => {
    setOpen(false);
    if (done && (variant !== "chip" || refreshOnDone)) router.refresh();
  };

  const notForMe = () => {
    setOpen(false);
    start(async () => {
      try {
        await beenNotForMe(placeId);
        if (variant === "madeit" || refreshOnDone) router.refresh();
      } catch {
        /* nothing shown either way */
      }
    });
  };

  const vouch = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await vouchForPlace(placeId, { note, tip });
      setDone({ city: r.city, followOwner: r.followOwner });
      setStep("done");
    } catch (e) {
      setError(errorText(e, "Couldn't vouch for it."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <button type="button" aria-pressed={vouched} aria-label={vouched ? "You vouch for it" : "Vouch"} title="Vouch" className={iconCls} onClick={tap}>
          {iconBody}
        </button>
      ) : variant === "bar" ? (
        <button type="button" aria-pressed={vouched} title="Been and loved it? Vouch for it" className={barCls} onClick={tap}>
          {barBody}
        </button>
      ) : variant === "madeit" ? (
        <button type="button" className={madeCls} onClick={tap}>
          Vouch
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={vouched} className={cls} onClick={tap}>
            {label}
          </button>
          {done && (
            <Link href={myPlacesHref(done.city)} className="text-[12.5px] font-medium text-sage">
              In My spots →
            </Link>
          )}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Vouch for ${placeName}`}>
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full max-w-[480px] rounded-t-[28px] bg-cream px-5 pt-3 pb-8 safe-bottom max-h-[85dvh] overflow-y-auto fade-up">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" />
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="font-display text-[24px] leading-tight">
                {step === "done" ? "You vouch for it" : `Vouch for ${placeName}`}
              </h2>
              <button type="button" aria-label="Close" onClick={close} className="w-9 h-9 -mr-2 shrink-0 flex items-center justify-center rounded-full text-ink-muted">
                <XIcon size={18} />
              </button>
            </div>

            {step === "words" && (
              <>
                <p className="text-[13.5px] text-ink-muted leading-relaxed">Been and loved it? It joins your spots and friends see you vouch for it. Your words are optional{ownerFirst ? `; ${ownerFirst}'s stay on their spot` : ""}.</p>
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
                  {busy ? <Spinner /> : null} Vouch
                </Button>
                {variant === "madeit" && (
                  <button type="button" onClick={notForMe} className="mt-3 w-full text-center text-[13px] text-ink-muted underline underline-offset-2">
                    Not for me? Remove from Saved
                  </button>
                )}
              </>
            )}

            {step === "done" && done && (
              <>
                <p className="text-[14px] text-ink-muted leading-relaxed">
                  It&apos;s in My spots{done.city ? ` under My ${done.city}` : ""}, and friends see you vouch for it{ownerFirst ? ` with ${ownerFirst}` : ""}.{ownerFirst ? ` ${ownerFirst} will hear you went.` : ""}
                </p>
                {done.followOwner && ownerFirst && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-paper border border-line/80 px-3.5 py-2.5">
                    <span className="text-[13px] leading-snug">Follow {ownerFirst} to see their next spots on Explore.</span>
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
