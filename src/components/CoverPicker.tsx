"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlaceCoverOption } from "@/app/api/covers/places/route";
import { clearCover, setExternalCover, updateGuideMeta, type CoverChoice } from "@/lib/actions/guides";
import type { UnsplashPhoto } from "@/lib/covers/unsplash";
import { CameraIcon, PinIcon, SearchIcon } from "./Icons";
import { PhotoPicker } from "./PhotoPicker";
import { Sheet } from "./ShareSheet";
import { Button, Input, Spinner, cx } from "./ui";

export interface CoverFields {
  coverMediaId: string | null;
  coverUrl: string | null;
  coverSource: string | null;
  coverCredit: string | null;
  coverCreditUrl: string | null;
}

type Tab = "search" | "places" | "mine";

const EMPTY: CoverFields = { coverMediaId: null, coverUrl: null, coverSource: null, coverCredit: null, coverCreditUrl: null };

/** Bottom sheet for choosing a guide cover: search free photos, use a photo of one of the guide's places, or upload your own. */
export function CoverPicker({
  guide,
  onClose,
  onChange,
}: {
  guide: { id: string; title: string; city: string; country: string; coverMediaId?: string | null; coverUrl?: string | null; publishedAt?: Date | null };
  onClose: () => void;
  onChange: (fields: CoverFields) => void;
}) {
  const [tab, setTab] = useState<Tab>("search");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasCover = !!(guide.coverMediaId || guide.coverUrl);

  const apply = async (key: string, fn: () => Promise<CoverFields>) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await fn());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set that photo.");
    } finally {
      setBusy(null);
    }
  };

  const choose = (key: string, choice: CoverChoice) => apply(key, () => setExternalCover(guide.id, choice));
  const pickMedia = (mediaId: string) =>
    apply(`m:${mediaId}`, async () => {
      await updateGuideMeta(guide.id, { coverMediaId: mediaId });
      return { ...EMPTY, coverMediaId: mediaId };
    });

  return (
    <Sheet title="Cover photo" onClose={onClose}>
      <div className="flex gap-1 rounded-full bg-cream-deep/70 p-1 mb-4" role="tablist">
        {([
          ["search", "Search"],
          ["places", "From places"],
          ["mine", "Upload"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cx("flex-1 rounded-full px-2 py-2 text-[12.5px] font-medium transition-colors", tab === id ? "bg-paper text-ink shadow-sm" : "text-ink-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-[13px] text-danger bg-danger-tint rounded-xl px-3 py-2">{error}</p>}

      {tab === "search" && <SearchTab initial={guide.city || guide.title} busy={busy} onPick={(p) => choose(`u:${p.id}`, { kind: "unsplash", photoId: p.id })} />}
      {tab === "places" && <PlacesTab guideId={guide.id} busy={busy} onPickMedia={pickMedia} onPickGoogle={(o) => choose(`g:${o.ref}`, { kind: "google", placeId: o.placeId, ref: o.ref })} />}
      {tab === "mine" && (
        <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="text-[13.5px] text-ink-muted mb-4">Take a photo or pick one from your library.</p>
          <PhotoPicker onUploaded={(id) => pickMedia(id)} className="mx-auto rounded-full bg-terracotta text-white px-5 py-2.5 text-[14px] font-medium justify-center">
            <CameraIcon size={16} /> Choose photo
          </PhotoPicker>
        </div>
      )}

      {/* Published guides must keep a cover; they can only swap it. */}
      {hasCover && !guide.publishedAt && (
        <div className="mt-5 text-center">
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => apply("clear", async () => { await clearCover(guide.id); return EMPTY; })}>
            Remove photo, use the title card
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function SearchTab({ initial, busy, onPick }: { initial: string; busy: string | null; onPick: (p: UnsplashPhoto) => void }) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<UnsplashPhoto[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/covers/unsplash?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { enabled?: boolean; results?: UnsplashPhoto[] };
      setEnabled(data.enabled !== false);
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial.trim()) queueMicrotask(() => void run(initial));
  }, [initial, run]);

  if (!enabled) {
    return <p className="rounded-2xl bg-cream-deep/60 px-4 py-6 text-center text-[13.5px] text-ink-muted">Photo search isn&apos;t switched on yet. Use a photo from your places or your own for now.</p>;
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2 mb-3"
      >
        <div className="relative flex-1">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dubai skyline, Beirut food…" className="pl-10" enterKeyHint="search" aria-label="Search photos" />
        </div>
        <Button type="submit" size="md" disabled={loading}>{loading ? <Spinner /> : "Search"}</Button>
      </form>
      {results && results.length === 0 && !loading && <p className="py-6 text-center text-[13.5px] text-ink-muted">No photos found. Try a different word, like the city or a dish.</p>}
      <div className="grid grid-cols-2 gap-2.5">
        {(results ?? []).map((p) => (
          <button key={p.id} type="button" disabled={!!busy} onClick={() => onPick(p)} className="group text-left disabled:opacity-60">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-cream-deep">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.alt} loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform group-active:scale-[0.98]" />
              {busy === `u:${p.id}` && <div className="absolute inset-0 flex items-center justify-center bg-ink/30 text-white"><Spinner /></div>}
            </div>
            <div className="mt-1 truncate text-[10.5px] text-ink-faint">{p.author}</div>
          </button>
        ))}
      </div>
      {results && results.length > 0 && <p className="mt-3 text-center text-[11px] text-ink-faint">Free photos from Unsplash. The photographer is credited on your cover.</p>}
    </div>
  );
}

function PlacesTab({
  guideId,
  busy,
  onPickMedia,
  onPickGoogle,
}: {
  guideId: string;
  busy: string | null;
  onPickMedia: (mediaId: string) => void;
  onPickGoogle: (o: Extract<PlaceCoverOption, { kind: "google" }>) => void;
}) {
  const [options, setOptions] = useState<PlaceCoverOption[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/covers/places?guide=${encodeURIComponent(guideId)}`)
      .then((r) => r.json())
      .then((d: { options?: PlaceCoverOption[] }) => live && setOptions(d.options ?? []))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, [guideId]);

  if (!options) return <div className="py-10 flex justify-center text-ink-muted"><Spinner /></div>;
  if (!options.length) {
    return (
      <p className="rounded-2xl bg-cream-deep/60 px-4 py-6 text-center text-[13.5px] text-ink-muted">
        <PinIcon size={18} className="mx-auto mb-2" />
        Add a few places to this guide first, then their photos will show up here.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {options.map((o) => {
        const key = o.kind === "media" ? `m:${o.mediaId}` : `g:${o.ref}`;
        return (
          <button key={key} type="button" disabled={!!busy} onClick={() => (o.kind === "media" ? onPickMedia(o.mediaId) : onPickGoogle(o))} className="group text-left disabled:opacity-60">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-cream-deep">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.thumb} alt={o.label} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
              {o.kind === "media" && <span className="absolute top-1.5 left-1.5 rounded-full bg-paper/90 px-1.5 py-0.5 text-[9.5px] font-medium">Your photo</span>}
              {busy === key && <div className="absolute inset-0 flex items-center justify-center bg-ink/30 text-white"><Spinner /></div>}
            </div>
            <div className="mt-1 truncate text-[11px] text-ink">{o.label}</div>
            {o.kind === "google" && <div className="truncate text-[10px] text-ink-faint">{o.author} · Google Maps</div>}
          </button>
        );
      })}
    </div>
  );
}
