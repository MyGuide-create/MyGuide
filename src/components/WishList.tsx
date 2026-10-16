"use client";

import Link from "next/link";
import { AskForGuideButton } from "./AskForGuide";
import type { AskView } from "@/lib/requests";
import { STATUS_LABEL } from "@/lib/requestStatus";
import { SendSpotsButton } from "./SendSpotsButton";
import { useState, useTransition } from "react";
import { addWish, removeWish, sendGuideForWish } from "@/lib/actions/wishes";
import type { WishView } from "@/lib/wishes";
import { CheckIcon, PinIcon, PlusIcon, SparkleIcon, TrashIcon, WhatsAppIcon } from "./Icons";
import { Sheet } from "./ShareSheet";
import { Avatar, Button, Input, LinkButton, Spinner, cx } from "./ui";

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

/**
 * What a visitor can do for someone's wish: send their spots there (one tap) or, with none yet,
 * add some first (Add a place, which then offers to send them).
 */
export function WishSpotsActions({ w, firstName, signedIn, next, wide }: { w: Pick<WishView, "wish" | "viewerSpots" | "viewerSentSpots">; firstName: string; signedIn: boolean; next: string; wide?: boolean }) {
  const city = w.wish.city;
  if (!signedIn) return <LinkButton href={`/signup?why=ask&next=${encodeURIComponent(next)}`} size="sm" className={wide ? "w-full" : undefined}>Send {firstName} your spots</LinkButton>;
  if (w.viewerSentSpots) {
    return (
      <span className="inline-flex items-center gap-2 text-[12.5px]">
        <span className="inline-flex items-center gap-1 font-medium text-sage"><CheckIcon size={13} /> Spots sent</span>
        <Link href={`/record?wish=${w.wish.id}`} className="font-medium text-terracotta">Add more</Link>
      </span>
    );
  }
  if (w.viewerSpots > 0) {
    return (
      <>
        <SendSpotsButton wishIds={[w.wish.id]} label={`Send your ${w.viewerSpots} spot${w.viewerSpots === 1 ? "" : "s"}`} className={wide ? "w-full" : undefined} />
        <Link href={`/record?wish=${w.wish.id}`} className="text-[12.5px] font-medium text-terracotta">Add more</Link>
      </>
    );
  }
  return <LinkButton href={`/record?wish=${w.wish.id}`} size="sm" className={wide ? "w-full" : undefined}>Add {city} spots</LinkButton>;
}

/** "Yara sent 6 spots · See them" under a wish. */
export function SpotsFromLinks({ spotsFrom }: { spotsFrom: WishView["spotsFrom"] }) {
  if (!spotsFrom.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-0.5">
      {spotsFrom.map((x) => (
        <Link key={x.user.id} href={`/city?${new URLSearchParams({ name: x.city, friend: x.user.username }).toString()}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-sage hover:underline min-w-0">
          <PinIcon size={12} className="shrink-0" />
          <span className="truncate">{x.user.displayName} sent {x.count} spot{x.count === 1 ? "" : "s"}</span>
        </Link>
      ))}
    </div>
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
 * Profile section: cities this person is going to and wants spots for.
 * Owner adds/removes and asks friends; visitors send their spots (or add some first), or a guide they've made.
 */
export function WishList({ wishes, own, ownerName, ownerUsername, signedIn }: { wishes: WishView[]; own: boolean; ownerName: string; ownerUsername: string; signedIn: boolean }) {
  const [adding, setAdding] = useState(false);
  const [removing, startRemove] = useTransition();
  const first = ownerName.trim().split(/\s+/)[0] || ownerUsername;
  if (!own && !wishes.length) return null;
  return (
    <section id="wishes" className="rounded-[22px] border border-line bg-paper px-4 py-4 scroll-mt-20">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[22px] leading-none inline-flex items-center gap-2"><SparkleIcon size={17} className="text-terracotta" /> Asking for spots</h2>
        <Link href="/wishes" className="shrink-0 text-[12.5px] font-medium text-terracotta">Who else is asking →</Link>
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-muted leading-snug">
        {own
          ? "Cities you're going to. Ask friends who know them — on MyGuide or by WhatsApp — and their spots come straight to you."
          : `Cities ${first} is going to. Been? Send ${first} your spots.`}
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
                <SpotsFromLinks spotsFrom={w.spotsFrom} />
                {own && <AskStatus asks={(w.asks ?? []).filter((a) => !(a.status === "done" && !a.guideSlug && w.spotsFrom.some((x) => x.user.id === a.recipient?.id)))} city={w.wish.city} />}
                {own && w.granted.length === 0 && w.spotsFrom.length === 0 && (
                  <AskForGuideButton city={{ city: w.wish.city, country: w.wish.country }} label={(w.asks ?? []).length ? "Ask someone else" : "Ask a friend"} className="mt-2" />
                )}
                {!own && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <WishSpotsActions w={w} firstName={first} signedIn={signedIn} next={`/u/${ownerUsername}#wishes`} />
                    <SendGuideButton wishId={w.wish.id} guides={w.viewerGuides} sent={w.viewerSent} wisherName={first} />
                    {signedIn && w.granted.length === 0 && w.spotsFrom.length === 0 && (
                      <AskForGuideButton variant="ghost" forWish={{ id: w.wish.id, city: w.wish.city, country: w.wish.country, userId: w.wish.userId, name: ownerName }} label="Know someone? Pass it on" />
                    )}
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

/** Who you asked for this city, and where each ask stands. */
function AskStatus({ asks, city }: { asks: AskView[]; city?: string }) {
  if (!asks.length) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-1">
      {asks.map((a) => (
        <li key={a.id} className="flex items-center gap-2 text-[12.5px]">
          {a.recipient ? <Avatar user={a.recipient} size={20} /> : <span className="w-5 h-5 rounded-full bg-[#25D366]/15 text-[#128C4B] flex items-center justify-center"><WhatsAppIcon size={11} /></span>}
          <span className="font-medium truncate">{a.recipient ? a.recipient.displayName.split(" ")[0] : "Link sent"}</span>
          <span className={a.status === "done" ? "text-sage font-medium" : a.status === "declined" ? "text-ink-faint" : "text-ink-muted"}>
            · {a.recipient ? STATUS_LABEL[a.status] : "not opened yet"}
          </span>
          {a.status === "done" && a.guideSlug && <Link href={`/g/${a.guideSlug}`} className="text-terracotta font-medium">Open guide</Link>}
          {a.status === "done" && !a.guideSlug && a.recipient && city && (
            <Link href={`/city?${new URLSearchParams({ name: city, friend: a.recipient.username }).toString()}`} className="text-terracotta font-medium">See spots</Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One-tap "Add Lisbon to my wish list" (Search with no guides for a city). */
export function WishForCityButton({ city }: { city: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <span className="inline-flex items-center gap-1 text-[13px] font-medium text-sage"><CheckIcon size={14} /> Asking for spots</span>;
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await addWish(city); if (r.ok) setDone(true); else setError(r.error); })}>
        {pending ? <Spinner /> : <><SparkleIcon size={14} /> Ask friends for {city} spots</>}
      </Button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}

/**
 * "Ask for spots" on a city page (16 Oct 2026): one tap puts the city on your list so friends who
 * know it can send their spots; then you can also ask someone directly.
 */
export function AskForSpots({ city, country, asked: initiallyAsked }: { city: string; country?: string; asked: boolean }) {
  const [asked, setAsked] = useState(initiallyAsked);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (asked)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
        <span className="inline-flex items-center gap-1 font-medium text-sage"><CheckIcon size={14} /> Asking for {city} spots</span>
        <AskForGuideButton city={{ city, country: country ?? "" }} label="Ask someone directly" variant="ghost" size="sm" />
      </div>
    );
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await addWish(city); if (r.ok) setAsked(true); else setError(r.error); })}>
        {pending ? <Spinner /> : <><SparkleIcon size={14} /> Ask friends for {city} spots</>}
      </Button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </span>
  );
}
