"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorText } from "@/lib/errorText";
import { importToMyPlaces } from "@/lib/actions/guides";
import { lookupPhotoSpots, type PhotoPlaceSuggestion } from "@/lib/actions/photoPlaces";
import { groupPhotos, type PhotoPoint } from "@/lib/photoSpots";
import { myPlacesHref } from "@/lib/stash";
import { mapLimit } from "@/lib/utils";
import { CameraIcon, CheckIcon } from "./Icons";
import { Button, Spinner, cx } from "./ui";

type Stage = "intro" | "reading" | "looking" | "results" | "saving";
const MIN_CHOICES = [2, 3, 5] as const;

/** Location + date from one photo, read on the phone (the photo itself never leaves it). */
async function readPoint(file: File): Promise<PhotoPoint | null> {
  try {
    const exifr = (await import("exifr")).default;
    const d = (await exifr.parse(file, { tiff: true, gps: true, exif: true, xmp: false, icc: false, iptc: false, jfif: false, ihdr: false })) as
      | { latitude?: number; longitude?: number; DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const lat = d?.latitude;
    const lng = d?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
    const when = d?.DateTimeOriginal ?? d?.CreateDate;
    const t = when instanceof Date && !isNaN(when.getTime()) ? when.getTime() / 1000 : file.lastModified / 1000;
    return { lat, lng, t };
  } catch {
    return null;
  }
}

const monthYear = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

export function PhotoPlacesFlow() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [counts, setCounts] = useState({ photos: 0, located: 0, spots: 0, homeLike: 0, looked: 0, empty: 0 });
  const [results, setResults] = useState<PhotoPlaceSuggestion[]>([]);
  const [minPhotos, setMinPhotos] = useState<number>(2);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const choose = () => {
    setError("");
    input.current?.click();
  };

  const onFiles = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (input.current) input.current.value = "";
    if (!files.length) return;
    setStage("reading");
    setProgress({ done: 0, total: files.length });
    let done = 0;
    const points = (
      await mapLimit(files, 4, async (f) => {
        const p = await readPoint(f);
        done++;
        if (done % 10 === 0 || done === files.length) setProgress({ done, total: files.length });
        return p;
      })
    ).filter((p): p is PhotoPoint => !!p);
    const { spots, homeLike } = groupPhotos(points);
    setCounts({ photos: files.length, located: points.length, spots: spots.length, homeLike, looked: 0, empty: 0 });
    if (!points.length) {
      setResults([]);
      setStage("results");
      return;
    }
    // Look up spots with 2+ photos (busiest first); if there are none, every spot.
    const multi = spots.filter((s) => s.photos >= 2);
    const toLook = multi.length ? multi : spots;
    setStage("looking");
    try {
      const res = await lookupPhotoSpots(toLook.slice(0, 80));
      setResults(res.suggestions);
      setCounts((c) => ({ ...c, looked: res.looked, empty: res.empty }));
      setMinPhotos(multi.length ? 2 : 1);
      setPicked(new Set());
      setStage("results");
    } catch (e) {
      setError(errorText(e, "Couldn't look up those places."));
      setStage("intro");
    }
  };

  const shown = useMemo(() => results.filter((r) => r.photos >= minPhotos), [results, minPhotos]);
  const byCity = useMemo(() => {
    const m = new Map<string, PhotoPlaceSuggestion[]>();
    for (const r of shown) {
      const k = r.city || "Other places";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shown]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** "Not it? It might be X": swap the guess for one of the other places right there. */
  const swap = (id: string, altId: string) => {
    setResults((rs) =>
      rs.map((r) => {
        if (r.providerId !== id) return r;
        const alt = r.alts.find((a) => a.providerId === altId);
        if (!alt) return r;
        return { ...r, providerId: alt.providerId, name: alt.name, category: alt.category, photoUrl: null, area: r.area, have: false, alts: [{ providerId: r.providerId, name: r.name, category: r.category }, ...r.alts.filter((a) => a.providerId !== altId)] };
      }),
    );
    setPicked((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      n.add(altId);
      return n;
    });
  };

  const save = async () => {
    const chosen = results.filter((r) => picked.has(r.providerId));
    if (!chosen.length) return;
    setStage("saving");
    setError("");
    try {
      const res = await importToMyPlaces({ places: chosen.map((r) => ({ name: r.name, providerId: r.providerId, cityHint: r.city })), share: true });
      const qs = new URLSearchParams({ imported: String(res.added) });
      if (res.skipped) qs.set("already", String(res.skipped));
      if (res.city) qs.set("city", res.city);
      const href = myPlacesHref(res.city);
      const [path, hash] = href.split("#");
      router.replace(`${path.split("?")[0]}?${qs.toString()}${hash ? `#${hash}` : ""}`);
    } catch (e) {
      setError(errorText(e, "Couldn't add those places."));
      setStage("results");
    }
  };

  const fileInput = (
    <input ref={input} type="file" accept="image/*,.heic,.heif" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
  );

  if (stage === "intro")
    return (
      <div className="px-5 pt-4 pb-10 flex flex-col gap-5">
        {fileInput}
        <div className="flex flex-col gap-2">
          <span className="inline-flex self-start rounded-full bg-sage-tint px-2.5 py-0.5 text-[11px] font-semibold text-sage">Team test</span>
          <h1 className="font-display text-[30px] leading-tight">Places from your photos</h1>
          <p className="text-[15px] text-ink-muted leading-relaxed">
            Pick photos and MyGuide finds the restaurants, cafés, gyms and spots where you took them. You choose which ones to recommend.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5 text-[14px] leading-relaxed">
          <li className="rounded-2xl bg-paper border border-line/80 p-3.5">
            <b>Pick a lot.</b> In the photo picker, open an album like <i>Recents</i>, tap <i>Select</i>, then drag across rows to select many at once. A few hundred is a good start.
          </li>
          <li className="rounded-2xl bg-paper border border-line/80 p-3.5">
            <b>Keep the location on.</b> If the picker shows <i>Options</i> at the top, check that <i>Location</i> is switched on.
          </li>
          <li className="rounded-2xl bg-paper border border-line/80 p-3.5">
            <b>Private.</b> Your photos never leave your phone. Only the rough centre of each spot is sent to look up what&apos;s there.
          </li>
        </ul>
        {error && <p className="text-[14px] text-terracotta">{error}</p>}
        <Button size="lg" onClick={choose} className="w-full">
          <CameraIcon size={18} /> Choose photos
        </Button>
      </div>
    );

  if (stage === "reading" || stage === "looking")
    return (
      <div className="px-5 pt-16 pb-10 flex flex-col items-center gap-4 text-center">
        <Spinner />
        {stage === "reading" ? (
          <>
            <p className="font-display text-[22px]">Reading where your photos were taken</p>
            <p className="text-[14px] text-ink-muted">
              {progress.done.toLocaleString()} of {progress.total.toLocaleString()} photos
            </p>
            <div className="w-full max-w-[280px] h-1.5 rounded-full bg-cream-deep overflow-hidden">
              <div className="h-full bg-terracotta transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="font-display text-[22px]">Finding the places</p>
            <p className="text-[14px] text-ink-muted">
              {counts.located.toLocaleString()} photos with a location, grouped into {counts.spots.toLocaleString()} spots.
            </p>
          </>
        )}
      </div>
    );

  // Results (and saving).
  if (!counts.located)
    return (
      <div className="px-5 pt-8 pb-10 flex flex-col gap-4">
        {fileInput}
        <h1 className="font-display text-[26px] leading-tight">None of those photos had a location</h1>
        <p className="text-[15px] text-ink-muted leading-relaxed">
          We read {counts.photos.toLocaleString()} photo{counts.photos === 1 ? "" : "s"} and none said where they were taken. Either location was off on the camera, or your
          phone removed it when handing the photos to the browser. If the picker has <i>Options</i> at the top, switch <i>Location</i> on and try again.
        </p>
        <p className="text-[13px] text-ink-muted">Worth knowing for the test: tell Claude this happened, and on which phone.</p>
        <Button size="lg" onClick={choose} className="w-full">
          Try again
        </Button>
      </div>
    );

  return (
    <div className="pb-32">
      {fileInput}
      <div className="px-5 pt-4 flex flex-col gap-2">
        <h1 className="font-display text-[28px] leading-tight">Looks like you&apos;ve been to these</h1>
        <p className="text-[13.5px] text-ink-muted leading-relaxed">
          {counts.photos.toLocaleString()} photos · {counts.located.toLocaleString()} with a location · {counts.spots.toLocaleString()} spots
          {counts.homeLike ? ` (${counts.homeLike} that look like home or work left out)` : ""} · checked {counts.looked} · {results.length} places found
          {counts.empty ? ` · ${counts.empty} spots with nothing nearby` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[13px]">
          <span className="text-ink-muted pr-0.5">Photos at a spot:</span>
          {[1, ...MIN_CHOICES].filter((n, i, a) => a.indexOf(n) === i).map((n) => (
            <button
              key={n}
              onClick={() => setMinPhotos(n)}
              className={cx("rounded-full px-3 py-1 border whitespace-nowrap", minPhotos === n ? "bg-ink text-cream border-ink" : "bg-paper border-line text-ink")}
            >
              {n === 1 ? "Any" : `${n}+`}
            </button>
          ))}
        </div>
        <button onClick={choose} className="self-start text-[13px] font-semibold text-terracotta">
          Choose different photos
        </button>
      </div>

      {!shown.length ? (
        <p className="px-5 pt-8 text-[14px] text-ink-muted">No places with {minPhotos}+ photos. Try a lower number above, or choose more photos.</p>
      ) : (
        byCity.map(([city, rows]) => (
          <section key={city} className="px-4 pt-6">
            <h2 className="px-1 pb-2 font-display text-[21px]">
              {city} <span className="text-[13px] font-sans text-ink-muted">{rows.length}</span>
            </h2>
            <div className="flex flex-col gap-2">
              {rows.map((r) => {
                const on = picked.has(r.providerId);
                return (
                  <div key={r.providerId} className={cx("rounded-2xl border bg-paper p-3 flex gap-3", on ? "border-terracotta" : "border-line/80")}>
                    <button
                      onClick={() => !r.have && toggle(r.providerId)}
                      disabled={r.have}
                      aria-label={on ? `Untick ${r.name}` : `Tick ${r.name}`}
                      className={cx(
                        "mt-0.5 w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center",
                        r.have ? "border-line bg-cream-deep" : on ? "bg-terracotta border-terracotta text-white" : "border-line",
                      )}
                    >
                      {(on || r.have) && <CheckIcon size={14} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => !r.have && toggle(r.providerId)} className="text-left w-full">
                        <span className="block font-semibold text-[15px] leading-snug">{r.name}</span>
                        <span className="block text-[12.5px] text-ink-muted truncate">{[r.category, r.area].filter(Boolean).join(" · ")}</span>
                        <span className="block text-[12.5px] text-ink-muted">
                          {r.photos} photo{r.photos === 1 ? "" : "s"} · {r.days} visit{r.days === 1 ? "" : "s"} · {monthYear(r.first)}
                          {monthYear(r.first) !== monthYear(r.last) ? `–${monthYear(r.last)}` : ""}
                          {r.have ? " · already in your places" : ""}
                        </span>
                      </button>
                      {!r.have && r.alts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 text-[12px]">
                          <span className="text-ink-muted">Not it?</span>
                          {r.alts.slice(0, 2).map((a) => (
                            <button key={a.providerId} onClick={() => swap(r.providerId, a.providerId)} className="rounded-full bg-cream-deep px-2.5 py-0.5 text-ink">
                              {a.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {r.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0 bg-cream-deep" loading="lazy" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 bg-cream/95 backdrop-blur border-t border-line/70 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[520px] flex flex-col gap-1.5">
          {error && <p className="text-[13px] text-terracotta">{error}</p>}
          <Button size="lg" className="w-full" disabled={!picked.size || stage === "saving"} onClick={save}>
            {stage === "saving" ? "Adding…" : picked.size ? `Recommend ${picked.size} place${picked.size === 1 ? "" : "s"}` : "Tick the places you'd recommend"}
          </Button>
        </div>
      </div>
    </div>
  );
}
