"use client";

import Link from "next/link";
import { errorText } from "@/lib/errorText";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import type { GuideDetail } from "@/lib/guides";
import type { Place, PlaceLocation, PlaceTip } from "@/lib/db/schema";
import { addPlace, deleteGuide, markGuideVerified, publishGuide, removePlace, unpublishGuide, addPinnedPlace, setPlacePin, reorderPlaces, replacePlace, updateGuideMeta, updatePlace } from "@/lib/actions/guides";
import { CATEGORIES } from "@/lib/places/categories";
import { DESCRIBED_MIN_CHARS, visibilityHints } from "@/lib/feedRank";
import type { PlaceSuggestion } from "@/lib/places/types";
import { CoverPicker } from "./CoverPicker";
import { CityPill, GuideCover } from "./GuideCover";
import { coverCityLabel } from "@/lib/coverCity";
import { namesSentence } from "@/lib/utils";
import { CameraIcon, ChevronDown, ChevronUp, ForkIcon, GlobeIcon, LockIcon, PinIcon, SparkleIcon, TrashIcon } from "./Icons";
import { NoteEditor } from "./NoteEditor";
import { CreditedNotes } from "./CreditedNotes";
import type { CreditedNote } from "@/lib/reuse";
import { PhotoPicker } from "./PhotoPicker";
import { PlaceSearch } from "./PlaceSearch";
import { CityPicker } from "./CityPicker";
import { GuideMap } from "./GuideMap";
import { PinDropSheet } from "./PinDropSheet";
import { GoogleInfoCard } from "./GoogleInfoCard";
import { BranchesEditor } from "./BranchesEditor";
import { isDroppedPin } from "@/lib/places/pins";
import { TipsEditor } from "./TipsEditor";
import { PlaceLinksEditor } from "./PlaceLinksEditor";
import { PlaceTile } from "./PlaceTile";
import { Sheet } from "./ShareSheet";
import { CollaboratorsEditor } from "./CollaboratorsEditor";
import { Button, Input, Label, LinkButton, Spinner, Tag, Textarea, cx } from "./ui";

export function GuideEditor({ detail, justForked, justCreated, viewerId, wishFor = [] }: { detail: GuideDetail; justForked?: boolean; justCreated?: boolean; viewerId: string; /** First names whose wish this guide is for (until it's published and sent). */ wishFor?: string[] }) {
  const router = useRouter();
  const [guide, setGuide] = useState(detail.guide);
  const [places, setPlaces] = useState<Place[]>(detail.places);
  const [adding, setAdding] = useState(false);
  /** Publish flow: cover photo (if missing) → visibility tips (if any) → public/private. */
  const [publishStep, setPublishStep] = useState<null | "cover" | "tips" | "visibility">(null);
  /** Live tip count per place, so the publish tips know about tips added in this session. */
  const [tipCounts, setTipCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(detail.placeTips).map(([id, ts]) => [id, ts.length])),
  );
  const onTipCount = useCallback((placeId: string, n: number) => setTipCounts((c) => (c[placeId] === n ? c : { ...c, [placeId]: n })), []);
  const [coverOpen, setCoverOpen] = useState(false);
  /** Opened the cover picker from the publish sheet: go back to publishing once a cover is set. */
  const [publishAfterCover, setPublishAfterCover] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Pin-drop sheet: a new spot with no Google listing, or re-pinning an existing place. */
  const [pinFor, setPinFor] = useState<{ mode: "add"; name: string } | { mode: "move"; place: Place } | null>(null);
  const firstPinned = places.find((p) => p.lat != null && p.lng != null);
  /** The place just added from search — its card looks for other branches straight away. */
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  /** A brand-new guide: places come first and the extras fold away, so the first thing to do is add a place. Fixed for this visit so the page doesn't jump once a place is added. */
  const [startedEmpty] = useState(detail.places.length === 0);
  const [showExtras, setShowExtras] = useState(false);
  /** Bumped when a merge rewrites a place's description, so its editor reloads the text. */
  const [noteRev, setNoteRev] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = detail.owner;
  const isDraft = !guide.publishedAt;
  const hasCover = !!(guide.coverMediaId || guide.coverUrl);
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
        setError(errorText(e, "Couldn't save that change."));
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
      setPublishStep(null);
    });
  };

  /** What's typed in the City box right now, so the cover pill previews before it saves. */
  const placeCities = places.map((p) => p.city);
  const coverCity = coverCityLabel(guide.city, placeCities);
  const cityCentre = guide.lat != null && guide.lng != null ? { lat: guide.lat, lng: guide.lng } : null;
  const derivedCity = coverCityLabel("", placeCities);

  const saveMeta = (patch: Parameters<typeof updateGuideMeta>[1]) => run("guide", async () => {
    await updateGuideMeta(guide.id, patch);
    setGuide((g) => ({ ...g, ...(patch as Partial<typeof g>) }));
  });

  const onAdd = async ({ providerId, name }: { providerId?: string; name: string }) => {
    setAdding(true);
    try {
      const p = await addPlace(guide.id, { providerId, name, cityHint: guide.city || undefined });
      setPlaces((ps) => [p, ...ps]);
      setJustAddedId(p.id);
      if (!guide.city && p.city) setGuide((g) => ({ ...g, city: p.city, country: p.country }));
    } catch (e) {
      setError(errorText(e, "Couldn't add that place."));
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
      setPublishError(null);
      try {
        await publishGuide(guide.id, visibility);
      } catch (e) {
        setPublishError(errorText(e, "Couldn't publish the guide."));
        return;
      }
      setPublishStep(null);
      router.push(`/g/${guide.slug}`);
    });

  const hints = visibilityHints({
    places: places.length,
    described: places.filter((p) => p.note.trim().length >= DESCRIBED_MIN_CHARS).length,
    withTips: places.filter((p) => (tipCounts[p.id] ?? 0) > 0).length,
    hasIntro: guide.description.trim().length >= DESCRIBED_MIN_CHARS,
  });
  const stepAfterCover = (): "tips" | "visibility" => (isDraft && hints.length ? "tips" : "visibility");
  const startPublish = () => {
    setPublishError(null);
    if (!isDraft) setPublishStep("visibility");
    else if (!hasCover) setPublishStep("cover");
    else setPublishStep(stepAfterCover());
  };

  const coverFromPublish = () => {
    setPublishStep(null);
    setPublishAfterCover(true);
    setCoverOpen(true);
  };

  const destroy = () => {
    if (!confirm("Delete this guide and all its places? This can't be undone.")) return;
    start(async () => { await deleteGuide(guide.id); });
  };

  const placesSection = (
      <div className="px-5 mt-7">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[24px]">Places <span className="text-ink-faint text-[16px]">{places.length}</span></h2>
          {saving && <span className="text-[11.5px] text-ink-faint inline-flex items-center gap-1"><Spinner /> Saving…</span>}
        </div>
        <div className="mt-3">
          <PlaceSearch cityHint={guide.city || undefined} near={cityCentre} onPick={onAdd} busy={adding} autoFocus={places.length === 0} onDropPin={(name) => setPinFor({ mode: "add", name })} />
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
              onTipCount={onTipCount}
              noteAuthor={p.noteAuthorId && p.noteAuthorId !== owner.id ? detail.noteAuthors[p.noteAuthorId] : null}
              credited={detail.credited[p.id]}
              onMove={(d) => move(i, d)}
              onRemove={() => remove(p)}
              onPatch={(patch) => patchPlace(p.id, patch)}
              onReplaced={(np) => setPlaces((ps) => ps.map((x) => (x.id === np.id ? np : x)))}
              onPin={() => setPinFor({ mode: "move", place: p })}
              branches={detail.placeLocations[p.id] ?? []}
              autoFindBranches={justAddedId === p.id}
              noteRev={noteRev[p.id] ?? 0}
              onMerged={(ids, note) => {
                setPlaces((ps) => ps.filter((x) => !ids.includes(x.id)).map((x) => (x.id === p.id ? { ...x, note } : x)));
                setNoteRev((r) => ({ ...r, [p.id]: (r[p.id] ?? 0) + 1 }));
              }}
            />
          ))}
        </ol>
        {places.length === 0 && (
          <>
            <p className="mt-4 text-[13.5px] text-ink-muted leading-relaxed">
              Add your first place — or come back and add them when you get there. Photo, pin, address and hours come in automatically, and it stays a private draft until you publish.
            </p>
            {cityCentre && (
              <GuideMap places={[]} center={cityCentre} height={220} locate={false} className="mt-4 w-full rounded-3xl overflow-hidden border border-line" />
            )}
          </>
        )}
      </div>
  );
  const extrasSection = (
    <>
        <div>
          <Label>Description</Label>
          <Textarea rows={2} defaultValue={guide.description} placeholder="e.g. Three days in the capital with family — easy walks, early dinners, one big night out." onBlur={(e) => e.target.value.trim() !== guide.description && saveMeta({ description: e.target.value })} />
        </div>
        <label className="flex items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3">
          <span>
            <span className="block text-[14px] font-medium">Let others copy my notes and tips</span>
            <span className="block text-[11.5px] text-ink-muted">
              {guide.allowFork
                ? "When someone copies this guide or adds your places to theirs, your notes, tips and photos come along — credited to you, and they can't edit them. You'll see it in Activity."
                : "People can still copy your places, but only the places — your notes, tips and photos stay here."}
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
    </>
  );

  return (
    <div className="pb-10">
      {(justForked || justCreated) && !startedEmpty && (
        <div className="mx-4 mt-3 rounded-2xl bg-sage-tint text-sage px-4 py-3 text-[13px] leading-snug flex gap-2">
          {justForked ? <ForkIcon size={16} className="shrink-0 mt-0.5" /> : <PinIcon size={16} className="shrink-0 mt-0.5" />}
          <span>
            {justForked
              ? `Your private copy of @${detail.forkedFrom?.username ?? "their"}'s guide. Their notes and tips stay on each place, credited to them. Remove places you don't want, add your own finds and notes, and publish when it's yours.`
              : "Your places are in and saved as a draft — only you can see it. Add a description to each one, swap in your own photos, and publish when it\u2019s ready."}
          </span>
        </div>
      )}

      {wishFor.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl bg-terracotta-tint/70 px-4 py-2.5 text-[12.5px] leading-snug flex gap-2 items-center">
          <SparkleIcon size={14} className="shrink-0 text-terracotta" />
          <span>Made for <b className="font-semibold">{namesSentence(wishFor, 2)}</b>&apos;s wish list — {isDraft ? "we'll send it the moment you publish." : "sending now."}</span>
        </div>
      )}

      {isDraft && !justCreated && !justForked && !startedEmpty && detail.viewerIsOwner && (
        <div className="mx-4 mt-3 rounded-2xl bg-ochre-soft/60 px-4 py-2.5 text-[12.5px] leading-snug flex gap-2 items-center">
          <LockIcon size={14} className="shrink-0 text-ink-muted" />
          <span><b className="font-semibold">Draft</b> — only you{detail.collaborators?.length ? " and your co-editors" : ""} can see it. Followers aren&apos;t notified until you publish.</span>
        </div>
      )}

      {/* Cover */}
      <div className="relative mt-3 mx-4 rounded-[22px] overflow-hidden">
        <GuideCover guide={guide} ownerUsername={owner.username} className="aspect-[16/9]" cityLabel={coverCity} />
        <div className="absolute top-3 right-3 flex gap-2">
          <button type="button" onClick={() => setCoverOpen(true)} className="rounded-full bg-paper/90 backdrop-blur px-3 py-1.5 text-[12px] font-medium inline-flex items-center gap-1.5">
            <CameraIcon size={14} /> {guide.coverMediaId || guide.coverUrl ? "Change cover" : "Add cover photo"}
          </button>
        </div>
      </div>
      {coverOpen && (
        <CoverPicker
          guide={guide}
          onClose={() => {
            setCoverOpen(false);
            setPublishAfterCover(false);
          }}
          onChange={(fields) => {
            setGuide((g) => ({ ...g, ...fields }));
            if (publishAfterCover && (fields.coverMediaId || fields.coverUrl)) setPublishStep(stepAfterCover());
          }}
        />
      )}
      {isDraft && !hasCover && !startedEmpty && (
        <p className="mx-5 mt-2 text-[12.5px] text-ink-muted">A cover photo is needed before you can publish.</p>
      )}

      {/* Title + city */}
      <div className="px-5 mt-5 flex flex-col gap-4">
        <div>
          <Label htmlFor="guide-title">Title</Label>
          <Input
            id="guide-title"
            defaultValue={guide.title}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== guide.title && saveMeta({ title: e.target.value })}
            className="text-[17px] font-semibold"
            placeholder="e.g. Weekend away with the boys"
          />
        </div>
        <div>
          <Label htmlFor="guide-city">City</Label>
          <CityPicker
            id="guide-city"
            key={`${guide.city}|${guide.country}`}
            initial={[guide.city, guide.country].filter(Boolean).join(", ")}
            placeholder={derivedCity ?? "e.g. Tashkent"}
            onPick={(c) => saveMeta({ city: c.city, country: c.country, lat: Number.isFinite(c.lat) ? c.lat : null, lng: Number.isFinite(c.lng) ? c.lng : null })}
            onFreeText={(t) => saveMeta({ city: t })}
          />
          <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-muted leading-snug">
            <span className="shrink-0">On the cover:</span>
            {coverCity ? <CityPill label={coverCity} className="max-w-[70%] bg-ink/75" /> : <span className="text-ink-faint">nothing yet — add a city or some places</span>}
          </div>
        </div>
      </div>

      {startedEmpty ? (
        <>
          {placesSection}
          <div className="px-5 mt-8">
            <button type="button" onClick={() => setShowExtras((v) => !v)} className="w-full flex items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3 text-[14px] font-medium">
              <span>Description, sharing and co-editors</span>
              {showExtras ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showExtras && <div className="mt-4 flex flex-col gap-4">{extrasSection}</div>}
          </div>
        </>
      ) : (
        <>
          <div className="px-5 mt-4 flex flex-col gap-4">{extrasSection}</div>
          {placesSection}
        </>
      )}

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
              <Button onClick={startPublish} disabled={places.length === 0} className="px-3.5!">
                {isDraft ? "Publish" : guide.visibility === "public" ? "Published · Public" : "Published · Private"}
              </Button>
            </>
          ) : (
            <span className="text-[12px] text-ink-muted">Changes save as you go</span>
          )}
        </div>
      </div>

      {publishStep === "cover" && (
        <Sheet title="Add a cover photo" onClose={() => setPublishStep(null)}>
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Every guide needs a cover before it&apos;s published — it&apos;s the first thing people see in the feed. Search for one, use a photo from your places, or upload your own.
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button onClick={coverFromPublish}>
              <CameraIcon size={16} /> Add cover photo
            </Button>
            <Button variant="ghost" onClick={() => { setPublishStep(null); saveDraft(); }} disabled={leaving}>
              Save as draft for now
            </Button>
          </div>
        </Sheet>
      )}

      {publishStep === "tips" && (
        <Sheet title="Help more people find it" onClose={() => setPublishStep(null)}>
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            Guides with more places, descriptions and expert tips show up higher in everyone&apos;s feed. A few things would help this one:
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {hints.map((h) => (
              <li key={h} className="rounded-xl bg-ochre-soft/50 px-3 py-2 text-[13px] leading-snug flex gap-2">
                <SparkleIcon size={14} className="mt-0.5 shrink-0 text-terracotta" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2.5">
            <Button onClick={() => setPublishStep(null)}>Keep editing</Button>
            <Button variant="outline" onClick={() => setPublishStep("visibility")}>Publish anyway</Button>
            <Button variant="ghost" onClick={() => { setPublishStep(null); saveDraft(); }} disabled={leaving}>
              {leaving ? <Spinner /> : null} Save as draft
            </Button>
          </div>
        </Sheet>
      )}

      {publishStep === "visibility" && (
        <Sheet title={isDraft ? "Publish your guide" : "Who can see this guide?"} onClose={() => setPublishStep(null)}>
          <p className="text-[13.5px] text-ink-muted leading-relaxed">
            {isDraft ? "Not ready yet? Close this and tap Save draft — nobody sees it until you publish." : "You can keep editing after publishing. Nothing is ever locked."}
          </p>
          {wishFor.length > 0 && (
            <p className="mt-2.5 rounded-xl bg-terracotta-tint/70 px-3 py-2 text-[12.5px] leading-snug">
              Either way, it&apos;s shared with {namesSentence(wishFor, 2)} and they get a notification — even a private guide.
            </p>
          )}
          {!hasCover && (
            <div className="mt-2.5 rounded-xl bg-terracotta-tint/70 px-3 py-2.5 text-[12.5px] leading-snug flex items-center gap-3">
              <span className="flex-1">Add a cover photo first — it&apos;s what people see in the feed.</span>
              <Button size="sm" onClick={coverFromPublish} className="shrink-0">
                <CameraIcon size={14} /> Add cover
              </Button>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2.5">
            <button type="button" disabled={pending || !hasCover} onClick={() => publish("public")} className={cx("text-left rounded-2xl border px-4 py-3.5 flex gap-3 items-start disabled:opacity-50", guide.visibility === "public" && !isDraft ? "border-terracotta bg-terracotta-tint" : "border-line bg-paper")}>
              <GlobeIcon size={20} className="mt-0.5 text-terracotta shrink-0" />
              <span>
                <span className="block text-[15px] font-medium">Public</span>
                <span className="block text-[12.5px] text-ink-muted">In the feed and searchable by anyone. Your followers will see it on your profile.</span>
              </span>
            </button>
            <button type="button" disabled={pending || !hasCover} onClick={() => publish("private")} className={cx("text-left rounded-2xl border px-4 py-3.5 flex gap-3 items-start disabled:opacity-50", guide.visibility === "private" && !isDraft ? "border-terracotta bg-terracotta-tint" : "border-line bg-paper")}>
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
          {publishError && <p className="mt-3 text-[13px] text-danger bg-danger-tint rounded-xl px-3 py-2">{publishError}</p>}
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
  onTipCount,
  noteAuthor,
  onMove,
  onRemove,
  onPatch,
  onReplaced,
  onPin,
  branches,
  autoFindBranches,
  onMerged,
  noteRev,
  credited,
}: {
  credited?: CreditedNote[];
  place: Place;
  index: number;
  total: number;
  guideId: string;
  guideSlug: string;
  cityHint: string;
  tips: PlaceTip[];
  onTipCount: (placeId: string, n: number) => void;
  noteAuthor: { username: string } | null | undefined;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onPatch: (patch: Parameters<typeof updatePlace>[2]) => Promise<void>;
  onReplaced: (p: Place) => void;
  onPin: () => void;
  branches: PlaceLocation[];
  autoFindBranches: boolean;
  onMerged: (mergedPlaceIds: string[], note: string) => void;
  noteRev: number;
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
      {place.googlePlaceId ? (
        <div className="mt-3">
          <GoogleInfoCard
            compact
            info={{
              address: place.address,
              phone: place.phone,
              website: place.website,
              instagram: place.instagram,
              hours: place.hoursJson ? (JSON.parse(place.hoursJson) as string[]) : null,
              photoCount: place.photoUrl ? 1 : 0,
              country: place.country,
              lng: place.lng,
              businessStatus: place.businessStatus,
            }}
          />
        </div>
      ) : null}
      {place.lat != null && (
        <div className="mt-3">
          <BranchesEditor
            guideId={guideId}
            place={place}
            initial={branches}
            cityHint={cityHint || undefined}
            autoFind={autoFindBranches}
            onMerged={onMerged}
          />
        </div>
      )}
      <CreditedNotes notes={credited} locked className="mt-3" />
      <div className="mt-3">
        <Label>{credited?.length ? "Your note" : "Description - What Makes It Special"}</Label>
        {open ? (
          <NoteEditor key={noteRev} placeName={place.name} note={place.note} clipMediaId={place.noteClipMediaId} onSave={(patch) => onPatch(patch)} />
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="w-full text-left whitespace-pre-line rounded-2xl bg-cream px-3.5 py-2.5 text-[12.5px] italic text-ink-muted leading-[1.45] hover:bg-cream-deep/60">
            {place.note || "What is it, and what makes it special…"}
            {place.noteClipMediaId && <span className="not-italic text-sage ml-2 text-[11px]">· voice note</span>}
          </button>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-line/70">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint mb-2 inline-flex items-center gap-1"><SparkleIcon size={12} /> Optional extras · shown on the place page</p>
        <div className="flex flex-col gap-3">
          <TipsEditor guideId={guideId} placeId={place.id} initial={tips} onCountChange={(n) => onTipCount(place.id, n)} />
          <PlaceLinksEditor place={place} onPatch={onPatch} />
        </div>
      </div>
      <Link href={`/g/${guideSlug}/p/${place.id}`} className="mt-2 inline-block text-[11px] text-ink-faint hover:text-terracotta">View place page →</Link>
    </li>
  );
}


export type { PlaceSuggestion };
