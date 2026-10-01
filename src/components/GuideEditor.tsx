"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { GuideDetail } from "@/lib/guides";
import type { Place, PlaceTip } from "@/lib/db/schema";
import { addPlace, deleteGuide, publishGuide, removePlace, reorderPlaces, replacePlace, updateGuideMeta, updatePlace } from "@/lib/actions/guides";
import { CATEGORIES } from "@/lib/places/categories";
import type { PlaceSuggestion } from "@/lib/places/types";
import { CoverPicker } from "./CoverPicker";
import { GuideCover } from "./GuideCover";
import { CameraIcon, ChevronDown, ChevronUp, ForkIcon, GlobeIcon, LockIcon, PinIcon, SparkleIcon, TrashIcon } from "./Icons";
import { NoteEditor } from "./NoteEditor";
import { PhotoPicker } from "./PhotoPicker";
import { PlaceSearch } from "./PlaceSearch";
import { TipsEditor } from "./TipsEditor";
import { PlaceTile } from "./PlaceTile";
import { Sheet } from "./ShareSheet";
import { Button, Input, Label, Spinner, Tag, Textarea, cx } from "./ui";

export function GuideEditor({ detail, justForked, justCreated }: { detail: GuideDetail; justForked?: boolean; justCreated?: boolean }) {
  const router = useRouter();
  const [guide, setGuide] = useState(detail.guide);
  const [places, setPlaces] = useState<Place[]>(detail.places);
  const [adding, setAdding] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = detail.owner;
  const isDraft = !guide.publishedAt;

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setSaving(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(null);
    }
  }, []);

  const saveMeta = (patch: Parameters<typeof updateGuideMeta>[1]) => run("guide", async () => {
    await updateGuideMeta(guide.id, patch);
    setGuide((g) => ({ ...g, ...(patch as Partial<typeof g>) }));
  });

  const onAdd = async ({ providerId, name }: { providerId?: string; name: string }) => {
    setAdding(true);
    try {
      const p = await addPlace(guide.id, { providerId, name, cityHint: guide.city || undefined });
      setPlaces((ps) => [...ps, p]);
      if (!guide.city && p.city) setGuide((g) => ({ ...g, city: p.city, country: p.country }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that place.");
    } finally {
      setAdding(false);
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= places.length) return;
    const next = [...places];
    [next[i], next[j]] = [next[j], next[i]];
    setPlaces(next);
    void run("order", () => reorderPlaces(guide.id, next.map((p) => p.id)));
  };

  const remove = (p: Place) => {
    if (!confirm(`Remove ${p.name} from this guide?`)) return;
    setPlaces((ps) => ps.filter((x) => x.id !== p.id));
    void run("remove", () => removePlace(guide.id, p.id));
  };

  const patchPlace = (id: string, patch: Parameters<typeof updatePlace>[2]) =>
    run("place", async () => {
      await updatePlace(guide.id, id, patch);
      setPlaces((ps) => ps.map((p) => (p.id === id ? { ...p, ...(patch as Partial<Place>) } : p)));
    });

  const publish = (visibility: "public" | "private") =>
    start(async () => {
      await publishGuide(guide.id, visibility);
      setPublishOpen(false);
      router.push(`/g/${guide.slug}`);
    });

  const destroy = () => {
    if (!confirm("Delete this guide and all its places? This can't be undone.")) return;
    start(async () => { await deleteGuide(guide.id); });
  };

  return (
    <div className="pb-10">
      {(justForked || justCreated) && (
        <div className="mx-4 mt-3 rounded-2xl bg-sage-tint text-sage px-4 py-3 text-[13px] leading-snug flex gap-2">
          {justForked ? <ForkIcon size={16} className="shrink-0 mt-0.5" /> : <PinIcon size={16} className="shrink-0 mt-0.5" />}
          <span>
            {justForked
              ? `This is your private copy of @${detail.forkedFrom?.username ?? "their"}'s guide. Remove what you don't like, add what you found, then publish it as your own.`
              : "Your places are in. Add a note to each one (typed or spoken), swap in your own photos, then publish."}
          </span>
        </div>
      )}

      {/* Cover */}
      <div className="relative mt-3 mx-4 rounded-[22px] overflow-hidden">
        <GuideCover guide={guide} ownerUsername={owner.username} className="aspect-[16/9]" />
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button type="button" onClick={() => setCoverOpen(true)} className="rounded-full bg-paper/90 backdrop-blur px-3 py-1.5 text-[12px] font-medium inline-flex items-center gap-1.5">
            <CameraIcon size={14} /> {guide.coverMediaId || guide.coverUrl ? "Change cover" : "Add cover photo"}
          </button>
        </div>
      </div>
      {coverOpen && (
        <CoverPicker
          guide={guide}
          onClose={() => setCoverOpen(false)}
          onChange={(fields) => setGuide((g) => ({ ...g, ...fields }))}
        />
      )}

      {/* Meta */}
      <div className="px-5 mt-5 flex flex-col gap-4">
        <div>
          <Label>Title</Label>
          <input
            defaultValue={guide.title}
            onBlur={(e) => e.target.value.trim() !== guide.title && saveMeta({ title: e.target.value })}
            className="w-full bg-transparent font-display text-[32px] leading-[1.05] outline-none border-b border-transparent focus:border-terracotta-soft placeholder:text-ink-faint"
            placeholder="Name your guide"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>City</Label>
            <Input defaultValue={guide.city} placeholder="Tokyo" onBlur={(e) => e.target.value.trim() !== guide.city && saveMeta({ city: e.target.value })} />
          </div>
          <div>
            <Label>Country</Label>
            <Input defaultValue={guide.country} placeholder="Japan" onBlur={(e) => e.target.value.trim() !== guide.country && saveMeta({ country: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea rows={2} defaultValue={guide.description} placeholder="What's this guide for, and who is it for?" onBlur={(e) => e.target.value.trim() !== guide.description && saveMeta({ description: e.target.value })} />
        </div>
        <label className="flex items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3">
          <span>
            <span className="block text-[14px] font-medium">Let others use this guide</span>
            <span className="block text-[11.5px] text-ink-muted">They get their own private copy to edit. Your notes stay credited to you.</span>
          </span>
          <input type="checkbox" checked={guide.allowFork} onChange={(e) => saveMeta({ allowFork: e.target.checked })} className="w-5 h-5 accent-terracotta" />
        </label>
      </div>

      {/* Places */}
      <div className="px-5 mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[24px]">Places <span className="text-ink-faint text-[16px]">{places.length}</span></h2>
          {saving && <span className="text-[11.5px] text-ink-faint inline-flex items-center gap-1"><Spinner /> Saving…</span>}
        </div>
        <div className="mt-3">
          <PlaceSearch cityHint={guide.city || undefined} onPick={onAdd} busy={adding} autoFocus={places.length === 0} />
        </div>
        {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

        <ol className="mt-5 flex flex-col gap-4">
          {places.map((p, i) => (
            <EditablePlace
              key={p.id}
              place={p}
              index={i}
              total={places.length}
              guideId={guide.id}
              guideSlug={guide.slug}
              cityHint={guide.city}
              tips={detail.placeTips[p.id] ?? []}
              noteAuthor={p.noteAuthorId && p.noteAuthorId !== owner.id ? detail.noteAuthors[p.noteAuthorId] : null}
              onMove={(d) => move(i, d)}
              onRemove={() => remove(p)}
              onPatch={(patch) => patchPlace(p.id, patch)}
              onReplaced={(np) => setPlaces((ps) => ps.map((x) => (x.id === np.id ? np : x)))}
            />
          ))}
        </ol>
        {places.length === 0 && <p className="mt-4 text-[13.5px] text-ink-muted">Start typing a place above. Photo, pin, address and hours come in automatically.</p>}
      </div>

      {/* Publish bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
          <Link href={`/g/${guide.slug}`} className="text-[13px] font-medium text-ink-muted px-3 py-2">{isDraft ? "Preview" : "Done"}</Link>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={destroy} aria-label="Delete guide" className="text-ink-faint"><TrashIcon size={16} /></Button>
          <Button onClick={() => setPublishOpen(true)} disabled={places.length === 0}>
            {isDraft ? "Publish" : guide.visibility === "public" ? "Published · Public" : "Published · Private"}
          </Button>
        </div>
      </div>

      {publishOpen && (
        <Sheet title={isDraft ? "Publish your guide" : "Who can see this guide?"} onClose={() => setPublishOpen(false)}>
          <p className="text-[13.5px] text-ink-muted leading-relaxed">You can keep editing after publishing. Nothing is ever locked.</p>
          <div className="mt-4 flex flex-col gap-2.5">
            <button type="button" disabled={pending} onClick={() => publish("public")} className={cx("text-left rounded-2xl border px-4 py-3.5 flex gap-3 items-start", guide.visibility === "public" && !isDraft ? "border-terracotta bg-terracotta-tint" : "border-line bg-paper")}>
              <GlobeIcon size={20} className="mt-0.5 text-terracotta shrink-0" />
              <span>
                <span className="block text-[15px] font-medium">Public</span>
                <span className="block text-[12.5px] text-ink-muted">In the feed and searchable by anyone. Your followers will see it on your profile.</span>
              </span>
            </button>
            <button type="button" disabled={pending} onClick={() => publish("private")} className={cx("text-left rounded-2xl border px-4 py-3.5 flex gap-3 items-start", guide.visibility === "private" && !isDraft ? "border-terracotta bg-terracotta-tint" : "border-line bg-paper")}>
              <LockIcon size={20} className="mt-0.5 text-terracotta shrink-0" />
              <span>
                <span className="block text-[15px] font-medium">Private</span>
                <span className="block text-[12.5px] text-ink-muted">Only you and the people you share it with. Not in the feed, not searchable — even by your followers.</span>
              </span>
            </button>
          </div>
          {pending && <p className="mt-3 text-[12.5px] text-ink-muted inline-flex items-center gap-1"><Spinner /> Publishing…</p>}
        </Sheet>
      )}
    </div>
  );
}

function EditablePlace({
  place,
  index,
  total,
  guideId,
  guideSlug,
  cityHint,
  tips,
  noteAuthor,
  onMove,
  onRemove,
  onPatch,
  onReplaced,
}: {
  place: Place;
  index: number;
  total: number;
  guideId: string;
  guideSlug: string;
  cityHint: string;
  tips: PlaceTip[];
  noteAuthor: { username: string } | null | undefined;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onPatch: (patch: Parameters<typeof updatePlace>[2]) => Promise<void>;
  onReplaced: (p: Place) => void;
}) {
  const [fixing, setFixing] = useState(false);
  const [open, setOpen] = useState(!place.note && !place.noteClipMediaId);
  const unresolved = place.lat == null;

  const onFix = async (pick: { providerId?: string; name: string }) => {
    if (!pick.providerId) { await onPatch({ name: pick.name }); setFixing(false); return; }
    const np = await replacePlace(guideId, place.id, pick.providerId);
    if (np) onReplaced(np);
    setFixing(false);
  };

  return (
    <li id={`place-edit-${place.id}`} className="rounded-[20px] border border-line/80 bg-paper p-3.5 scroll-mt-20">
      <div className="flex gap-3 items-start">
        <div className="relative shrink-0">
          <PlaceTile place={place} size={64} />
          <PhotoPicker onUploaded={(id) => onPatch({ photoMediaId: id })} className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-ink text-cream flex items-center justify-center shadow" label="Change photo">
            <CameraIcon size={13} />
          </PhotoPicker>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <span className="text-[11px] text-ink-faint font-medium tabular-nums mt-1">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[15px] leading-snug">{place.name}</div>
              <div className="text-[11.5px] text-ink-muted truncate">{place.address || (unresolved ? "Not matched to a map pin yet" : "")}</div>
            </div>
            <div className="flex flex-col -mr-1">
              <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up" className="w-7 h-6 flex items-center justify-center text-ink-muted disabled:opacity-25"><ChevronUp size={16} /></button>
              <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down" className="w-7 h-6 flex items-center justify-center text-ink-muted disabled:opacity-25"><ChevronDown size={16} /></button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <select
              value={place.category}
              onChange={(e) => onPatch({ category: e.target.value })}
              className="rounded-full border border-line bg-cream px-2.5 py-1 text-[11.5px] font-medium text-ink-muted outline-none"
              aria-label="Category"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" onClick={() => setFixing((f) => !f)} className={cx("text-[11.5px] font-medium px-2 py-1 rounded-full", unresolved ? "bg-ochre-soft text-ink" : "text-ink-muted hover:text-ink")}>
              {unresolved ? "Find on map" : "Wrong place?"}
            </button>
            {noteAuthor && <Tag tone="sage">note by @{noteAuthor.username}</Tag>}
            <button type="button" onClick={onRemove} aria-label="Remove place" className="ml-auto text-ink-faint hover:text-danger p-1"><TrashIcon size={15} /></button>
          </div>
        </div>
      </div>
      {fixing && (
        <div className="mt-3">
          <PlaceSearch cityHint={cityHint || undefined} onPick={onFix} placeholder={`Search for ${place.name}…`} autoFocus />
        </div>
      )}
      <div className="mt-3">
        {open ? (
          <NoteEditor placeName={place.name} note={place.note} clipMediaId={place.noteClipMediaId} onSave={(patch) => onPatch(patch)} />
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="w-full text-left rounded-2xl bg-cream px-3.5 py-2.5 text-[12.5px] italic text-ink-muted leading-[1.45] hover:bg-cream-deep/60">
            {place.note || "Add your recommendation…"}
            {place.noteClipMediaId && <span className="not-italic text-sage ml-2 text-[11px]">· voice note</span>}
          </button>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-line/70">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint mb-2 inline-flex items-center gap-1"><SparkleIcon size={12} /> Shown on the place page</p>
        <div className="flex flex-col gap-3">
          <div>
            <Label>What makes it special</Label>
            <Textarea rows={2} defaultValue={place.special ?? ""} placeholder="What sets this place apart…" onBlur={(e) => e.target.value.trim() !== (place.special ?? "") && onPatch({ special: e.target.value })} />
          </div>
          <TipsEditor guideId={guideId} placeId={place.id} initial={tips} />
        </div>
      </div>
      <Link href={`/g/${guideSlug}/p/${place.id}`} className="mt-2 inline-block text-[11px] text-ink-faint hover:text-terracotta">View place page →</Link>
    </li>
  );
}


export type { PlaceSuggestion };
