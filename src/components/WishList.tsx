"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addWish, removeWish, sendGuideForWish } from "@/lib/actions/wishes";
import type { WishView } from "@/lib/wishes";
import { CheckIcon, PinIcon, PlusIcon, SparkleIcon, TrashIcon } from "./Icons";
import { Sheet } from "./ShareSheet";
import { Button, Input, LinkButton, Spinner, cx } from "./ui";

/** "Add a city" form for your own wish list. */
export function AddWishForm({ onAdded, compact }: { onAdded?: () => void; compact?: boolean }) {
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await addWish(city, note);
          if (!r.ok) return setError(r.error);
          setCity("");
          setNote("");
          onAdded?.();
        });
      }}
    >
      <div className="flex gap-2">
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="A city, e.g. Lisbon" aria-label="City" className={cx("flex-1 min-w-0", compact && "py-2.5 text-[14px]")} maxLength={60} required />
        <Button type="submit" disabled={pending || city.trim().length < 2} className="shrink-0">{pending ? <Spinner /> : <><PlusIcon size={15} /> Add</>}</Button>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you're into (optional): food, with kids, nightlife…" aria-label="What you're into" className={cx(compact ? "py-2.5 text-[13.5px]" : "text-[14px]")} maxLength={80} />
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </form>
  );
}

/** "Send my guide": grant a wish with a guide you've already published (asks which one if you have several). */
export function SendGuideButton({ wishId, guides, sent, wisherName }: { wishId: string; guides: Array<{ id: string; slug: string; title: string }>; sent: string[]; wisherName: string }) {
  const [sentIds, setSentIds] = useState(sent);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unsent = guides.filter((g) => !sentIds.includes(g.id));
  if (!guides.length) return null;
  if (!unsent.length) {
    return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-sage"><CheckIcon size={13} /> Sent</span>;
  }
  const send = (guideId: string) =>
    start(async () => {
      setError(null);
      const r = await sendGuideForWish(wishId, guideId);
      if (!r.ok) return setError(r.error ?? "Couldn't send it.");
      setSentIds((s) => [...s, guideId]);
      setChoosing(false);
    });
  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => (unsent.length === 1 ? send(unsent[0].id) : setChoosing(true))}>
        {pending ? <Spinner /> : "Send my guide"}
      </Button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
      {choosing && (
        <Sheet title="Which guide?" onClose={() => setChoosing(false)}>
          <p className="text-[13px] text-ink-muted mb-3">We&apos;ll share it with {wisherName} and let them know.</p>
          <ul className="flex flex-col gap-2">
            {unsent.map((g) => (
              <li key={g.id}>
                <button type="button" disabled={pending} onClick={() => send(g.id)} className="w-full text-left rounded-2xl border border-line bg-paper px-4 py-3 font-display text-[18px] hover:border-terracotta-soft">
                  {g.title}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

/** The made-for-this-wish guides, as small links. */
export function GrantedLinks({ granted }: { granted: WishView["granted"] }) {
  if (!granted.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {granted.map((g) => (
        <Link key={g.slug} href={`/g/${g.slug}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-sage hover:underline min-w-0">
          <SparkleIcon size={12} className="shrink-0" />
          <span className="truncate">{g.owner.displayName} made “{g.title}”</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Profile section: cities this person wants a guide to.
 * Owner adds/removes; visitors can make the guide (or send one they already have).
 */
export function WishList({ wishes, own, ownerName, ownerUsername, signedIn }: { wishes: WishView[]; own: boolean; ownerName: string; ownerUsername: string; signedIn: boolean }) {
  const [adding, setAdding] = useState(false);
  const [removing, startRemove] = useTransition();
  const first = ownerName.trim().split(/\s+/)[0] || ownerUsername;
  if (!own && !wishes.length) return null;
  return (
    <section id="wishes" className="rounded-[22px] border border-line bg-paper px-4 py-4 scroll-mt-20">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[22px] leading-none inline-flex items-center gap-2"><SparkleIcon size={17} className="text-terracotta" /> Wish list</h2>
        <Link href="/wishes" className="shrink-0 text-[12.5px] font-medium text-terracotta">Everyone&apos;s wishes →</Link>
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-muted leading-snug">
        {own
          ? "Cities you'd love a guide to. Anyone who sees your profile can make one for you — you'll get it the moment they publish."
          : `Cities ${first} wants a guide to. Know one? Make it for ${first} — it's sent to them when you publish.`}
      </p>

      {wishes.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line/70">
          {wishes.map((w) => (
            <li key={w.wish.id} className="py-2.5 flex items-start gap-3">
              <span className="mt-0.5 w-8 h-8 rounded-full bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><PinIcon size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold leading-tight">{w.wish.city}{w.wish.country ? <span className="font-normal text-ink-muted">, {w.wish.country}</span> : null}</div>
                {w.wish.note && <div className="text-[12.5px] text-ink-muted italic leading-snug">{w.wish.note}</div>}
                <GrantedLinks granted={w.granted} />
                {!own && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {signedIn ? (
                      <LinkButton href={`/create?wish=${w.wish.id}`} size="sm">Make this guide</LinkButton>
                    ) : (
                      <LinkButton href={`/signup?why=create&next=${encodeURIComponent(`/u/${ownerUsername}#wishes`)}`} size="sm">Make this guide</LinkButton>
                    )}
                    <SendGuideButton wishId={w.wish.id} guides={w.viewerGuides} sent={w.viewerSent} wisherName={first} />
                  </div>
                )}
              </div>
              {own && (
                <button
                  type="button"
                  aria-label={`Remove ${w.wish.city}`}
                  disabled={removing}
                  onClick={() => { if (confirm(`Remove ${w.wish.city} from your wish list?`)) startRemove(() => removeWish(w.wish.id)); }}
                  className="w-8 h-8 rounded-full border border-line text-ink-muted flex items-center justify-center shrink-0 hover:text-danger hover:border-danger/40"
                >
                  <TrashIcon size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {own && (
        <div className="mt-3">
          {adding || !wishes.length ? (
            <AddWishForm compact onAdded={() => setAdding(false)} />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}><PlusIcon size={14} /> Add a city</Button>
          )}
        </div>
      )}
    </section>
  );
}

/** One-tap "Add Lisbon to my wish list" (Search with no guides for a city). */
export function WishForCityButton({ city }: { city: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <span className="inline-flex items-center gap-1 text-[13px] font-medium text-sage"><CheckIcon size={14} /> On your wish list</span>;
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await addWish(city); if (r.ok) setDone(true); else setError(r.error); })}>
        {pending ? <Spinner /> : <><SparkleIcon size={14} /> Add {city} to my wish list</>}
      </Button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}
