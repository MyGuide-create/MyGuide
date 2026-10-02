"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { combineForTrip } from "@/lib/actions/reuse";
import { CATEGORIES } from "@/lib/places/categories";
import { CheckIcon, ChevronLeft } from "./Icons";
import { Button, Chip, Input, Label, Spinner, cx } from "./ui";

export interface CombineGuide {
  id: string;
  title: string;
  owner: { username: string; displayName: string };
  placeCount: number;
  /** Creator lets others reuse their notes and photos. */
  notesShared: boolean;
  why: "saved" | "following" | "more";
  preselected: boolean;
}

export interface CombinePlace {
  id: string;
  guideId: string;
  key: string;
  name: string;
  category: string;
  area: string;
  hasNote: boolean;
  inTripGuide: boolean;
}

interface Merged {
  key: string;
  /** The copy we'll take — prefers one whose creator shares a note. */
  placeId: string;
  name: string;
  category: string;
  area: string;
  guideIds: string[];
  withNote: boolean;
  inTripGuide: boolean;
  order: number;
}

const catRank = (c: string) => {
  const i = (CATEGORIES as readonly string[]).indexOf(c);
  return i === -1 ? CATEGORIES.length : i;
};

const WHY: Record<CombineGuide["why"], string> = { saved: "You saved this", following: "You follow", more: "" };

export function CombineFlow({ tripId, city, guides, places, existing }: { tripId: string; city: string; guides: CombineGuide[]; places: CombinePlace[]; existing: { title: string; slug: string } | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"pick" | "review">("pick");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(guides.filter((g) => g.preselected).map((g) => g.id)));
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<string | null>(null);
  const [title, setTitle] = useState(`My ${city} trip`);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const guideById = useMemo(() => new Map(guides.map((g) => [g.id, g])), [guides]);

  const merged = useMemo(() => {
    const m = new Map<string, Merged>();
    places.forEach((p, i) => {
      if (!picked.has(p.guideId)) return;
      const g = guideById.get(p.guideId)!;
      const noteHere = g.notesShared && p.hasNote;
      const cur = m.get(p.key);
      if (!cur) {
        m.set(p.key, { key: p.key, placeId: p.id, name: p.name, category: p.category, area: p.area, guideIds: [p.guideId], withNote: noteHere, inTripGuide: p.inTripGuide, order: i });
      } else {
        if (!cur.guideIds.includes(p.guideId)) cur.guideIds.push(p.guideId);
        if (noteHere && !cur.withNote) {
          cur.placeId = p.id;
          cur.withNote = true;
        }
      }
    });
    return [...m.values()].sort((a, b) => catRank(a.category) - catRank(b.category) || b.guideIds.length - a.guideIds.length || a.order - b.order);
  }, [places, picked, guideById]);

  const cats = useMemo(() => [...new Set(merged.map((p) => p.category))], [merged]);
  const visible = cat ? merged.filter((p) => p.category === cat) : merged;
  const chosen = merged.filter((p) => !p.inTripGuide && !unticked.has(p.key));
  const placesPicked = places.filter((p) => picked.has(p.guideId)).length;
  const privateNotes = guides.filter((g) => picked.has(g.id) && !g.notesShared);

  const toggleGuide = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const togglePlace = (key: string) =>
    setUnticked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const setVisible = (on: boolean) =>
    setUnticked((s) => {
      const n = new Set(s);
      for (const p of visible) if (on) n.delete(p.key);
      else n.add(p.key);
      return n;
    });

  const submit = () => {
    setError(null);
    start(async () => {
      const r = await combineForTrip(tripId, chosen.map((p) => p.placeId), existing ? undefined : title);
      if (!r.ok) return setError(r.error);
      router.push(`/g/${r.slug}`);
    });
  };

  if (step === "pick") {
    return (
      <>
        <div className="px-4 pt-4 pb-40 flex flex-col gap-4">
          <div className="px-1">
            <h1 className="font-display text-[28px] leading-tight">Pick the guides to combine</h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              We&apos;ll merge their places into {existing ? <>your trip guide, <span className="font-medium text-ink">{existing.title}</span></> : "one private guide of your own"}. Next you choose which places to keep.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {guides.map((g) => {
              const on = picked.has(g.id);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleGuide(g.id)}
                    className={cx("w-full text-left flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors", on ? "border-terracotta bg-terracotta-tint/60" : "border-line/70 bg-paper hover:border-terracotta-soft")}
                  >
                    <span className={cx("w-6 h-6 rounded-full border flex items-center justify-center shrink-0", on ? "bg-terracotta border-terracotta text-white" : "border-line")}>{on && <CheckIcon size={14} />}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display text-[19px] leading-tight truncate">{g.title}</span>
                      <span className="block text-[12px] text-ink-muted truncate">
                        {[`@${g.owner.username}`, `${g.placeCount} ${g.placeCount === 1 ? "place" : "places"}`, WHY[g.why]].filter(Boolean).join(" · ")}
                      </span>
                      {!g.notesShared && <span className="block text-[11.5px] text-ink-faint">Places only — the creator keeps their notes</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <BottomBar>
          <Button className="w-full" disabled={!picked.size} onClick={() => { setCat(null); setStep("review"); window.scrollTo(0, 0); }}>
            {picked.size ? `Next: review ${placesPicked} ${placesPicked === 1 ? "place" : "places"} from ${picked.size} ${picked.size === 1 ? "guide" : "guides"}` : "Pick at least one guide"}
          </Button>
        </BottomBar>
      </>
    );
  }

  return (
    <>
      <div className="px-4 pt-3 pb-48 flex flex-col gap-4">
        <button type="button" onClick={() => setStep("pick")} className="self-start inline-flex items-center gap-1 text-[12.5px] text-ink-muted hover:text-terracotta">
          <ChevronLeft size={14} /> Change guides
        </button>
        <div className="px-1">
          <h1 className="font-display text-[28px] leading-tight">Keep what you&apos;ll actually go to</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {merged.length} {merged.length === 1 ? "place" : "places"}
            {merged.length < placesPicked ? ` (${placesPicked - merged.length} duplicates merged)` : ""}. Untick anything you&apos;ll skip — you can add more later from any place page.
          </p>
        </div>
        {privateNotes.length > 0 && (
          <p className="rounded-2xl bg-cream-deep/70 px-4 py-3 text-[12.5px] text-ink-muted">
            {privateNotes.map((g) => `@${g.owner.username}`).join(", ")} {privateNotes.length === 1 ? "keeps their" : "keep their"} notes and photos private — you&apos;ll get those places with their name and location only.
          </p>
        )}
        {!existing && (
          <div>
            <Label>Name your guide</Label>
            <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}
        {cats.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
            <Chip active={!cat} onClick={() => setCat(null)}>All</Chip>
            {cats.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-3 text-[12px] -mt-1">
          <button type="button" className="text-ink-muted hover:text-terracotta" onClick={() => setVisible(true)}>Select all</button>
          <button type="button" className="text-ink-muted hover:text-terracotta" onClick={() => setVisible(false)}>Clear</button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {visible.map((p, i) => {
            const head = i === 0 || visible[i - 1].category !== p.category ? p.category : null;
            const on = !p.inTripGuide && !unticked.has(p.key);
            const from = p.guideIds.map((id) => guideById.get(id)!);
            return (
              <li key={p.key}>
                {head && <p className="px-1 pt-3 pb-1 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">{head}</p>}
                <button
                  type="button"
                  disabled={p.inTripGuide}
                  aria-pressed={on}
                  onClick={() => togglePlace(p.key)}
                  className={cx("w-full text-left flex items-center gap-3 rounded-2xl border px-3.5 py-2.5", p.inTripGuide ? "border-line/50 bg-paper/50 opacity-70" : on ? "border-line bg-paper" : "border-line/50 bg-transparent")}
                >
                  <span className={cx("w-5 h-5 rounded-md border flex items-center justify-center shrink-0", on || p.inTripGuide ? "bg-terracotta border-terracotta text-white" : "border-line")}>{(on || p.inTripGuide) && <CheckIcon size={12} />}</span>
                  <span className="flex-1 min-w-0">
                    <span className={cx("block text-[14px] font-semibold truncate", !on && !p.inTripGuide && "text-ink-muted")}>{p.name}</span>
                    <span className="block text-[11.5px] text-ink-muted truncate">
                      {p.inTripGuide
                        ? "Already in your trip guide"
                        : [p.area, from.length > 1 ? `In ${from.length} guides` : `From @${from[0].owner.username}`, p.withNote ? "with note" : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {from.length > 1 && !p.inTripGuide && <span className="shrink-0 rounded-full bg-sage/15 px-2 py-0.5 text-[10.5px] font-semibold text-sage">×{from.length}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <BottomBar>
        {error && <p className="mb-2 text-center text-[12.5px] text-danger">{error}</p>}
        <Button className="w-full" disabled={!chosen.length || pending || (!existing && !title.trim())} onClick={submit}>
          {pending ? <Spinner /> : null}
          {chosen.length ? (existing ? `Add ${chosen.length} ${chosen.length === 1 ? "place" : "places"} to my trip guide` : `Make my guide · ${chosen.length} ${chosen.length === 1 ? "place" : "places"}`) : "Tick at least one place"}
        </Button>
        <p className="mt-1.5 text-center text-[11px] text-ink-faint">
          Private until you publish it. Creators&apos; notes stay credited to them.{existing && <> <Link href={`/g/${existing.slug}`} className="underline">Open trip guide</Link></>}
        </p>
      </BottomBar>
    </>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line px-4 pt-3 pb-3">{children}</div>
    </div>
  );
}
