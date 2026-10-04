"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import type { GuideDetail } from "@/lib/guides";
import type { Place, PlaceTip } from "@/lib/db/schema";
import { addPlace, deleteGuide, markGuideVerified, publishGuide, removePlace, unpublishGuide, addPinnedPlace, setPlacePin, reorderPlaces, replacePlace, updateGuideMeta, updatePlace } from "@/lib/actions/guides";
import { CATEGORIES } from "@/lib/places/categories";
import type { PlaceSuggestion } from "@/lib/places/types";
import { CoverPicker } from "./CoverPicker";
import { GuideCover } from "./GuideCover";
import { CameraIcon, ChevronDown, ChevronUp, ForkIcon, GlobeIcon, LockIcon, PinIcon, SparkleIcon, TrashIcon } from "./Icons";
import { NoteEditor } from "./NoteEditor";
import { PhotoPicker } from "./PhotoPicker";
import { PlaceSearch } from "./PlaceSearch";
import { PinDropSheet } from "./PinDropSheet";
import { isDroppedPin } from "@/lib/places/pins";
import { TipsEditor } from "./TipsEditor";
import { PlaceLinksEditor } from "./PlaceLinksEditor";
import { PlaceTile } from "./PlaceTile";
import { Sheet } from "./ShareSheet";
import { CollaboratorsEditor } from "./CollaboratorsEditor";
import { Button, Input, Label, LinkButton, Spinner, Tag, Textarea, cx } from "./ui";

export function GuideEditor({ detail, justForked, justCreated, viewerId }: { detail: GuideDetail; justForked?: boolean; justCreated?: boolean; viewerId: string }) {
  const router = useRouter();
  const [guide, setGuide] = useState(detail.guide);
  const [places, setPlaces] = useState<Place[]>(detail.places);
  const [adding, setAdding] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  /** Pin-drop sheet: a new spot with no Google listing, or re-pinning an existing place. */
  const [pinFor, setPinFor] = useState<{ mode: "add"; name: string } | { mode: "move"; place: Place } | null>(null);
  const firstPinned = places.find((p) => p.lat != null && p.lng != null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = detail.owner;
  const isDraft = !guide.publishedAt;
  /** Saves still in flight, so "Save draft" can wait for the last edit before leaving. */
  const inflight = useRef(new Set<Promise<void>>());
  const [leaving, setLeaving] = useState(false);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setSaving(label);
    setError(null);
    const p = (async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setSaving(null);
      }
    })();
    inflight.current.add(p);
    try { await p; } finally { inflight.current.delete(p); }
  }, []);

  const saveDraft = async () => {
    setLeaving(true);
    // Let the blur that this tap caused register its save, then wait for everything to land.
    await new Promise((r) => setTimeout(r, 50));
    await Promise.all([...inflight.current]);
    router.push(`/u/${owner.username}?draft=saved#drafts`);
  };

  const backToDrafts = () => {
    if (!confirm("Move this guide back to drafts? It disappears from the feed, search and your profile until you publish it again.")) return;
    start(async () => {
      await unpublishGuide(guide.id);
      setGuide((g) => ({ ...g, publishedAt: null }));
      setPublishOpen(false);
    });
  };

  const undescribed = places.filter((p) => !p.note.trim()).length;

  const saveMeta = (patch: Parameters<typeof updateGuideMeta>[1]) => run("guide", async () => {
    await updateGuideMeta(guide.id, patch);
    setGuide((g) => ({ ...g, ...(patch as Partial<typeof g>) }));
  });

  const onAdd = async ({ providerId, name }: { providerId?: string; name: string }) => {
    setAdding(true);
    try {
      const p = await addPlace(guide.id, { providerId, name, cityHint: guide.city || undefined });
      setPlaces((ps) => [p, ...ps]);
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
              : "Your places are in and saved as a draft — only you can see it. Add a description to each one (typed or spoken), swap in your own photos, and publish when it\u2019s ready."}
          </span>
        </div>
      )}

      {isDraft && !justCreated && !justForked && detail.viewerIsOwner && (
        <div className="mx-4 mt-3 rounded-2xl bg-ochre-soft/60 px-4 py-2.5 text-[12.5px] leading-snug flex gap-2 items-center">
          <LockIcon size={14} className="shrink-0 text-ink-muted" />
          <span><b className="font-semibold">Draft</b> — only you{detail.collaborators?.length ? " and your co-editors" : ""} can see it. Followers aren&apos;t notified until you publish.</span>
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
            <span className="block text-[14px] font-medium">Let others reuse my notes and photos</span>
            <span className="block text-[11.5px] text-ink-muted">
              {guide.allowFork
                ? "People can copy this guide or add your places to their own trip guides, with your notes credited to you. You'll see it in Activity."
                : "People can still add a place to their own guide, but only its name and location — your notes and photos stay here, and the guide can't be copied."}
            </span>
          </span>
          <input type="checkbox" checked={guide.allowFork} onChange={(e) => saveMeta({ allowFork: e.target.checked })} className="w-5 h-5 accent-terracotta" />
        </label>
        {!isDraft && (
          <div className="flex items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3">
            <span>
              <span className="block text-[14px] font-medium">Still accurate?</span>
              <span className="block text-[11.5px] text-ink-muted">
                {guide.verifiedAt ? `Readers see “Checked ${new Date(guide.verifiedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}”.` : "Tell readers you've checked these places recently."}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => start(async () => { const at = await markGuideVerified(guide.id); setGuide((g) => ({ ...g, verifiedAt: at })); })}
            >
              Checked today
            </Button>
          </div>
        )}
        <CollaboratorsEditor guideId={guide.id} initial={detail.collaborators} isOwner={detail.viewerIsOwner} viewerId={viewerId} ownerName={owner.displayName} />
      </div>

      {/* Places */}
      <div className="px-5 mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[24px]">Places <span className="text-ink-faint text-[16px]">{places.length}</span></h2>
          {saving && <span className="text-[11.5px] text-ink-faint inline-flex items-center gap-1"><Spinner /> Saving…</span>}
        </div>
        <div className="mt-3">
          <PlaceSearch cityHint={guide.city || undefined} onPick={onAdd} busy={adding} autoFocus={places.length === 0} onDropPin={(name) => setPinFor({ mode: "add", name })} />
          <button type="button" onClick={() => setPinFor({ mode: "add", name: "" })} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
            <PinIcon size={15} /> Not on Google Maps? Drop a pin — sunset spots, campsites, trailheads
          </button>
        </div>
        {pinFor && (
          <PinDropSheet
            title={pinFor.mode === "add" ? "Drop a pin" : `Pin ${pinFor.place.name}`}
            initialName={pinFor.mode === "add" ? pinFor.name : pinFor.place.name}
            askName={pinFor.mode === "add"}
            askCategory={pinFor.mode === "add"}
            saveLabel={pinFor.mode === "add" ? "Add to guide" : "Save pin"}
            cityHint={guide.city || undefined}
            initialCenter={
              pinFor.mode === "move" && pinFor.place.lat != null && pinFor.place.lng != null
                ? { lat: pinFor.place.lat, lng: pinFor.place.lng }
                : firstPinned ? { lat: firstPinned.lat!, lng: firstPinned.lng! } : null
            }
            onClose={() => setPinFor(null)}
            onSave={async (pick) => {
              if (pinFor.mode === "add") {
                const p = await addPinnedPlace(guide.id, pick);
                setPlaces((ps) => [p, ...ps]);
                if (!guide.city && p.city) setGuide((g) => ({ ...g, city: p.city, country: p.country }));
              } else {
                const p = await setPlacePin(guide.id, pinFor.place.id, pick);
                setPlaces((ps) => ps.map((x) => (x.id === p.id ? p : x)));
              }
              setPinFor(null);
            }}
          />
        )}
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
              onPin={() => setPinFor({ mode: "move", place: p })}
            />
          ))}
        </ol>
        {places.length === 0 && <p className="mt-4 text-[13.5px] text-ink-muted">Start typing a place above. Photo, pin, address and hours come in automatically.</p>}
      </div>

      {/* Publish bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 flex justify-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[480px] safe-bottom bg-paper/95 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
          <LinkButton href={`/g/${guide.slug}`} variant="ghost" className="border border-line px-3.5!">{isDraft ? "Preview" : "Done"}</LinkButton>
          <div className="flex-1" />
          {detail.viewerIsOwner ? (
            <>
              <button type="button" onClick={destroy} aria-label="Delete guide" title="Delete guide" className="w-10 h-10 shrink-0 rounded-full border border-line text-danger flex items-center justify-center hover:bg-danger-tint"><TrashIcon size={20} /></button>
              {isDraft && (
                <Button variant="outline" onClick={saveDraft} disabled={leaving} className="px-3.5!">
                  {leaving ? <Spinner /> : null} Save draft
                </Button>
              )}
              <Button onClick={() => setPublishOpen(true)} disabled={places.length === 0} className="px-3.5!">
                {isDraft ? "Publish" : guide.visibility === "public" ? "Published · Public" : "Published · Private"}
              </Button>
            </>
          ) : (
            <span className="text-[12px] text-ink-muted">Changes save as you go</span>
          )}
        </div>
      </div>

      {publishOpen && (
        <Sheet title={isDraft ? "Publish your guide" : "Who can see this guide?"} onClose={() => setPublishOpen(false)}>
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            {isDraft ? "Not ready yet? Close this and tap Save draft — nobody sees it until you publish." : "You can keep editing after publishing. Nothing is ever locked."}
          </p>
          {isDraft && undescribed > 0 && (
            <p className="mt-2.5 rounded-xl bg-ochre-soft/60 px-3 py-2 text-[12.5px] leading-snug">
              {undescribed === places.length ? "None of your places have" : `${undescribed} of ${places.length} places don\u2019t have`} a description yet. You can publish anyway, or add them first.
            </p>
          )}
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
          {!isDraft && (
            <button type="button" disabled={pending} onClick={backToDrafts} className="mt-4 w-full text-center text-[12.5px] font-medium text-ink-muted underline underline-offset-2">
              Move back to drafts
            </button>
          )}
          {pending && <p className="mt-3 text-[12.5px] text-ink-muted inline-flex items-center gap-1"><Spinner /> Saving…</p>}
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
  onPin,
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
  onPin: () => void;
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
              <div className="text-[11.5px] text-ink-muted truncate">
                {isDroppedPin(place) && <span className="text-sage font-medium">Dropped pin{place.address ? " · " : ""}</span>}
                {place.address || (unresolved ? "Not matched to a map pin yet" : "")}
              </div>
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
            <button type="button" onClick={() => (isDroppedPin(place) ? onPin() : setFixing((f) => !f))} className={cx("text-[11.5px] font-medium px-2 py-1 rounded-full", unresolved ? "bg-ochre-soft text-ink" : "text-ink-muted hover:text-ink")}>
              {unresolved ? "Find on map" : isDroppedPin(place) ? "Move pin" : "Wrong place?"}
            </button>
            {noteAuthor && <Tag tone="sage">note by @{noteAuthor.username}</Tag>}
            <button type="button" onClick={onRemove} aria-label="Remove place" title="Remove place" className="ml-auto -mr-1 w-9 h-9 rounded-full flex items-center justify-center text-ink-muted hover:text-danger hover:bg-danger-tint"><TrashIcon size={19} /></button>
          </div>
        </div>
      </div>
      {fixing && (
        <div className="mt-3">
          <PlaceSearch cityHint={cityHint || undefined} onPick={onFix} placeholder={`Search for ${place.name}…`} autoFocus />
          <button type="button" onClick={() => { setFixing(false); onPin(); }} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
            <PinIcon size={15} /> Not on Google? Drop a pin on the map instead
          </button>
        </div>
      )}
      <div className="mt-3">
        <Label>Description - What Makes It Special</Label>
        {open ? (
          <NoteEditor placeName={place.name} note={place.note} clipMediaId={place.noteClipMediaId} onSave={(patch) => onPatch(patch)} />
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="w-full text-left whitespace-pre-line rounded-2xl bg-cream px-3.5 py-2.5 text-[12.5px] italic text-ink-muted leading-[1.45] hover:bg-cream-deep/60">
            {place.note || "What is it, and what makes it special…"}
            {place.noteClipMediaId && <span className="not-italic text-sage ml-2 text-[11px]">· voice note</span>}
          </button>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-line/70">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint mb-2 inline-flex items-center gap-1"><SparkleIcon size={12} /> Shown on the place page</p>
        <div className="flex flex-col gap-3">
          <TipsEditor guideId={guideId} placeId={place.id} initial={tips} />
          <PlaceLinksEditor place={place} onPatch={onPatch} />
        </div>
      </div>
      <Link href={`/g/${guideSlug}/p/${place.id}`} className="mt-2 inline-block text-[11px] text-ink-faint hover:text-terracotta">View place page →</Link>
    </li>
  );
}


export type { PlaceSuggestion };
