"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pickIntoGuide } from "@/lib/actions/reuse";
import { CheckIcon, ChevronLeft } from "./Icons";
import { PlaceTile } from "./PlaceTile";
import { Button, Input, Spinner, cx } from "./ui";

export type PickItem = { id: string; name: string; category: string; photoUrl: string | null; photoMediaId: string | null; area: string; sub: string };
export type PickGroup = { label: string; items: PickItem[] };
type GuideOption = { id: string; title: string; city: string; placeCount: number };

/**
 * Tick places (a city's spots, or someone's guide) and put them in a new guide of your own or one
 * you have. Your copy keeps the recommender's words, credited; it's yours to add to and reorder.
 */
export function PickPlaces({
  title: heading,
  intro,
  groups,
  guides,
  city,
  preselectAll = false,
  suggestedTitle = "",
}: {
  title: string;
  intro: string;
  groups: PickGroup[];
  guides: GuideOption[];
  city: string;
  preselectAll?: boolean;
  suggestedTitle?: string;
}) {
  const router = useRouter();
  const all = useMemo(() => groups.flatMap((g) => g.items.map((p) => p.id)), [groups]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselectAll ? all : []));
  const [step, setStep] = useState<"pick" | "where">("pick");
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState(suggestedTitle);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setMany = (ids: string[], on: boolean) =>
    setPicked((s) => {
      const n = new Set(s);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });

  const sortedGuides = useMemo(() => {
    const same = (g: GuideOption) => !!city && g.city.trim().toLowerCase() === city.toLowerCase();
    return [...guides.filter(same), ...guides.filter((g) => !same(g))];
  }, [guides, city]);

  const n = picked.size;
  const canSave = n > 0 && (mode === "new" ? title.trim().length > 0 : !!guideId);
  const everything = all.length > 0 && all.every((id) => picked.has(id));

  const submit = () => {
    setError(null);
    startSaving(async () => {
      const res = await pickIntoGuide({
        placeIds: [...picked],
        city,
        ...(mode === "new" ? { newTitle: title.trim() } : { guideId: guideId ?? undefined }),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/g/${res.slug}/edit${res.created ? "?created=1" : ""}`);
    });
  };

  if (step === "pick") {
    return (
      <div className="flex flex-col flex-1">
        <div className="px-5 pt-4 pb-2">
          <h1 className="font-display text-[26px] leading-tight">{heading}</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">{intro}</p>
          {all.length > 1 && (
            <button type="button" onClick={() => setMany(all, !everything)} className="mt-2 text-[13px] font-semibold text-terracotta-deep">
              {everything ? "Clear all" : `Select all ${all.length}`}
            </button>
          )}
        </div>
        <div className="px-4 pb-28 flex flex-col gap-5">
          {groups.map((g) => {
            const ids = g.items.map((p) => p.id);
            const on = ids.every((id) => picked.has(id));
            return (
              <section key={g.label}>
                {groups.length > 1 && (
                  <div className="flex items-baseline justify-between px-1 pb-1.5 mb-2 border-b border-line">
                    <h2 className="font-display text-[19px]">{g.label}</h2>
                    <button type="button" onClick={() => setMany(ids, !on)} className="text-[12.5px] font-medium text-terracotta-deep">
                      {on ? "Clear" : `Select all ${g.items.length}`}
                    </button>
                  </div>
                )}
                <ul className="flex flex-col gap-2">
                  {g.items.map((p) => {
                    const ticked = picked.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={ticked}
                          onClick={() => toggle(p.id)}
                          className={cx("w-full flex items-center gap-3 rounded-2xl border bg-paper p-2.5 text-left", ticked ? "border-terracotta" : "border-line/80")}
                        >
                          <PlaceTile place={p} size={48} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-[14.5px] truncate">{p.name}</span>
                            <span className="block text-[12px] text-ink-muted truncate">{[p.category, p.area].filter(Boolean).join(" · ")}</span>
                            {p.sub && <span className="block text-[12px] text-ink/80 truncate">{p.sub}</span>}
                          </span>
                          <span className={cx("w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0", ticked ? "bg-terracotta border-terracotta text-white" : "border-line")}>
                            {ticked && <CheckIcon size={15} />}
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
          <span className="block text-[12.5px] text-ink-muted">{city ? `For ${city} · private until you publish it` : "Private until you publish it"}</span>
        </button>
        {mode === "new" && (
          <label className="block">
            <span className="block text-[12px] font-medium uppercase tracking-[0.04em] text-ink-muted mb-1.5">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={city ? `e.g. My ${city} trip` : "e.g. Weekend away with the boys"} autoFocus />
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

      <p className="text-[12.5px] leading-snug text-ink-muted">Their descriptions and tips come along, credited to them. Add your own notes any time.</p>

      {error && <p className="text-[12.5px] text-danger">{error}</p>}

      <Button size="lg" className="w-full" disabled={!canSave || saving} onClick={submit}>
        {saving ? <Spinner /> : mode === "new" ? "Create guide" : `Add ${n} place${n === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}
