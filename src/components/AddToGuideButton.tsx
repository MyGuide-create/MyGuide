"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addPlaceToMyGuide } from "@/lib/actions/reuse";
import { PlusIcon, XIcon } from "./Icons";
import { Spinner, cx } from "./ui";

interface Targets {
  trip: { guideId: string | null; title: string } | null;
  guides: { id: string; title: string; city: string }[];
}

/** "Add to my guide" on someone else's place: into this city's trip guide or any guide of yours. */
export function AddToGuideButton({ placeId, signedIn, signupHref, targets, notesShared, className }: { placeId: string; signedIn: boolean; signupHref: string; targets: Targets | null; notesShared: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ title: string; slug: string; added: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const cls = cx("inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-[12.5px] font-medium hover:border-terracotta-soft hover:text-terracotta", className);

  if (!signedIn || !targets) {
    return (
      <Link href={signupHref} className={cls}>
        <PlusIcon size={14} /> Add to my guide
      </Link>
    );
  }

  const add = (target: string) => {
    setBusy(target);
    setError(null);
    start(async () => {
      const r = await addPlaceToMyGuide(placeId, target);
      setBusy(null);
      if (!r.ok) return setError(r.error);
      setDone({ title: r.title, slug: r.slug, added: r.added });
    });
  };

  const row = "w-full text-left flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 hover:border-terracotta-soft disabled:opacity-60";

  return (
    <>
      <button type="button" className={cls} onClick={() => { setOpen(true); setDone(null); setError(null); }}>
        <PlusIcon size={14} /> Add to my guide
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Add to my guide">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/40" />
          <div className="relative w-full max-w-[480px] rounded-t-[28px] bg-cream px-5 pt-3 pb-8 safe-bottom max-h-[80dvh] overflow-y-auto fade-up">
            <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-3" />
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-[24px]">Add to my guide</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-full text-ink-muted"><XIcon size={18} /></button>
            </div>
            <p className="text-[12.5px] text-ink-muted mb-3">
              {notesShared ? "The creator's note comes with it, credited to them." : "The creator keeps their notes private, so you'll get the place's name and location."}
            </p>
            {done ? (
              <div className="rounded-2xl bg-sage/10 px-4 py-3.5 text-[13.5px]">
                {done.added ? "Added to " : "Already in "}
                <span className="font-semibold">{done.title}</span>.{" "}
                <Link href={`/g/${done.slug}`} className="font-medium text-terracotta">Open it →</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {targets.trip && (
                  <button type="button" className={cx(row, "border-terracotta-soft")} disabled={!!busy} onClick={() => add("trip")}>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{targets.trip.title}</span>
                      <span className="block text-[11.5px] text-ink-muted">{targets.trip.guideId ? "Your trip guide" : "New private trip guide"}</span>
                    </span>
                    {busy === "trip" ? <Spinner /> : <PlusIcon size={16} className="text-terracotta shrink-0" />}
                  </button>
                )}
                {targets.guides.map((g) => (
                  <button key={g.id} type="button" className={row} disabled={!!busy} onClick={() => add(g.id)}>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium truncate">{g.title}</span>
                      {g.city && <span className="block text-[11.5px] text-ink-muted">{g.city}</span>}
                    </span>
                    {busy === g.id ? <Spinner /> : <PlusIcon size={16} className="text-ink-faint shrink-0" />}
                  </button>
                ))}
                {error && <p className="text-[12.5px] text-danger">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
