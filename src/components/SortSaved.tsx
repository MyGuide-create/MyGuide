"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fileSavedPlaces } from "@/lib/actions/fileSaved";
import { errorText } from "@/lib/errorText";
import { CheckIcon, ChevronLeft } from "./Icons";
import { PlaceTile } from "./PlaceTile";
import { Button, Input, Spinner, cx } from "./ui";

type SavedPlace = { id: string; name: string; category: string; photoUrl: string | null; photoMediaId: string | null; city: string; area: string };
type GuideOption = { id: string; title: string; city: string; placeCount: number };

/** Remembers "Keep a copy in My spots". A new key: the old one (mg.keepCopyInSaved, off by default) is ignored once, as the default is now on. */
const KEEP_KEY = "mg.keepCopyInMyPlaces";

export function SortSaved({ places, guides, preTicked }: { places: SavedPlace[]; guides: GuideOption[]; /** From the "Make them a guide?" nudge: these are ticked and we start at step 2. */ preTicked?: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preTicked ?? []));
  const [step, setStep] = useState<"pick" | "where">(preTicked?.length ? "where" : "pick");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState("");
  const [guideId, setGuideId] = useState<string | null>(null);
  // Remember the person's last choice for "Keep a copy" (on by default: places in a guide stay in My spots).
  // Read after hydration (the page can open straight on step 2, where the switch is).
  const [keepCopy, setKeepCopy] = useState(true);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        if (localStorage.getItem(KEEP_KEY) === "0") setKeepCopy(false);
      } catch {
        /* ignore */
      }
    });
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const toggleKeep = () => {
    setKeepCopy((v) => {
      try {
        localStorage.setItem(KEEP_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  // Group by city, biggest first; places with no city last.
  const groups = useMemo(() => {
    const m = new Map<string, SavedPlace[]>();
    for (const p of places) m.set(p.city || "", [...(m.get(p.city || "") ?? []), p]);
    return [...m.entries()].sort((a, b) => (!a[0] ? 1 : !b[0] ? -1 : b[1].length - a[1].length));
  }, [places]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setGroup = (ids: string[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const pickedCity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of places) if (picked.has(p.id) && p.city) counts.set(p.city, (counts.get(p.city) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }, [places, picked]);
  const sortedGuides = useMemo(() => {
    const same = (g: GuideOption) => !!pickedCity && g.city.trim().toLowerCase() === pickedCity.toLowerCase();
    return [...guides.filter(same), ...guides.filter((g) => !same(g))];
  }, [guides, pickedCity]);

  const n = picked.size;
  const canSave = n > 0 && (mode === "new" ? title.trim().length > 0 : !!guideId);

  const submit = () => {
    setError(null);
    startSaving(async () => {
      try {
        const res = await fileSavedPlaces({
          placeIds: [...picked],
          ...(mode === "new" ? { newTitle: title.trim() } : { guideId: guideId ?? undefined }),
          keepCopy,
        });
        router.replace(`/g/${res.slug}/edit${res.created ? "?created=1" : ""}`);
      } catch (e) {
        setError(errorText(e, "Couldn't move those places."));
      }
    });
  };

  if (step === "pick") {
    return (
      <div className="flex flex-col flex-1">
        <div className="px-5 pt-4 pb-2">
          <h1 className="font-display text-[26px] leading-tight">Pick the places</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">Tick the ones that belong together, then choose a guide for them.</p>
        </div>
        <div className="px-4 pb-28 flex flex-col gap-5">
          {groups.map(([city, items]) => {
            const ids = items.map((p) => p.id);
            const all = ids.every((id) => picked.has(id));
            return (
              <section key={city || "_none"}>
                <div className="flex items-baseline justify-between px-1 pb-1.5 mb-2 border-b border-line">
                  <h2 className="font-display text-[20px]">{city || "Other places"}</h2>
                  <button type="button" onClick={() => setGroup(ids, !all)} className="text-[13px] font-medium text-terracotta-deep">
                    {all ? "Clear" : `Select all ${items.length}`}
                  </button>
                </div>
                <ul className="flex flex-col gap-2">
                  {items.map((p) => {
                    const on = picked.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggle(p.id)}
                          className={cx("w-full flex items-center gap-3 rounded-2xl border bg-paper p-2.5 text-left", on ? "border-terracotta" : "border-line/80")}
                        >
                          <PlaceTile place={p} size={48} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-[14.5px] truncate">{p.name}</span>
                            <span className="block text-[12px] text-ink-muted truncate">{[p.category, p.area].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className={cx("w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0", on ? "bg-terracotta border-terracotta text-white" : "border-line")}>
                            {on && <CheckIcon size={15} />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="fixed bottom-0 inset-x-0 flex justify-center pointer-events-none">
          <div className="w-full max-w-[480px] px-5 pb-6 pt-3 bg-gradient-to-t from-cream via-cream to-transparent pointer-events-auto">
            <Button className="w-full" size="lg" disabled={n === 0} onClick={() => setStep("where")}>
              {n === 0 ? "Tick some places" : `Next · ${n} place${n === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 px-5 pt-4 pb-8 gap-5">
      <div className="flex items-center gap-2.5">
        <button type="button" aria-label="Back" onClick={() => setStep("pick")} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
          <ChevronLeft size={17} />
        </button>
        <h1 className="font-display text-[24px] leading-tight">Where should {n === 1 ? "it" : `these ${n}`} go?</h1>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cx("rounded-2xl border p-3.5 text-left", mode === "new" ? "border-terracotta bg-terracotta-tint/40" : "border-line bg-paper")}
        >
          <span className="block font-semibold text-[15px]">A new guide</span>
          <span className="block text-[12.5px] text-ink-muted">{pickedCity ? `For ${pickedCity}` : "Starts with these places"}</span>
        </button>
        {mode === "new" && (
          <label className="block">
            <span className="block text-[12px] font-medium uppercase tracking-[0.04em] text-ink-muted mb-1.5">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={pickedCity ? `e.g. My favourite spots in ${pickedCity}` : "e.g. Weekend away with the boys"} autoFocus />
          </label>
        )}
        {guides.length > 0 && (
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={cx("rounded-2xl border p-3.5 text-left", mode === "existing" ? "border-terracotta bg-terracotta-tint/40" : "border-line bg-paper")}
          >
            <span className="block font-semibold text-[15px]">One of my guides</span>
            <span className="block text-[12.5px] text-ink-muted">Add them to a guide you already have</span>
          </button>
        )}
        {mode === "existing" && (
          <ul className="flex flex-col gap-2">
            {sortedGuides.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setGuideId(g.id)}
                  className={cx("w-full flex items-center gap-2.5 rounded-2xl border bg-paper p-2.5 text-left", guideId === g.id ? "border-terracotta" : "border-line")}
                >
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-terracotta-soft to-terracotta shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold truncate">{g.title}</span>
                    <span className="block text-[11.5px] text-ink-muted">{[g.city, `${g.placeCount} place${g.placeCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  {guideId === g.id && <CheckIcon size={17} className="text-terracotta shrink-0" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" role="switch" aria-checked={keepCopy} onClick={toggleKeep} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-left">
        <span>
          <span className="block text-[14px] font-semibold">Keep them in My spots</span>
          <span className="block text-[12px] text-ink-muted">{keepCopy ? "They stay in My spots too." : "Off: they move out of My spots into the guide."}</span>
        </span>
        <span className={cx("relative w-11 h-6 rounded-full shrink-0 transition-colors", keepCopy ? "bg-terracotta" : "bg-line")}>
          <span className={cx("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", keepCopy ? "left-[22px]" : "left-0.5")} />
        </span>
      </button>

      {error && <p className="text-[12.5px] text-danger">{error}</p>}

      <Button size="lg" className="w-full" disabled={!canSave || saving} onClick={submit}>
        {saving ? <Spinner /> : mode === "new" ? "Create guide" : `Add ${n} place${n === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
