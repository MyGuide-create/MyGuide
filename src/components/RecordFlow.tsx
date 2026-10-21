"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorText } from "@/lib/errorText";
import { REGION_SPOT_TEXT, readUserError } from "@/lib/userError";
import type { TypedCity } from "@/lib/places/regionHint";
import { useEffect, useState, useTransition } from "react";
import { useExitFlow } from "./BackButton";
import { putPlaceInGuide, saveRecordedPlace, type RecordedPlace } from "@/lib/actions/record";
import { isReservedTitle, myPlacesHref } from "@/lib/stash";
import { GuideNudge } from "./GuideNudge";
import { SendSpotsButton } from "./SendSpotsButton";
import { PhotoPicker } from "./PhotoPicker";
import { PlaceSearch } from "./PlaceSearch";
import { PinDropSheet } from "./PinDropSheet";
import { GoogleInfoCard, type GoogleInfo } from "./GoogleInfoCard";
import { CameraIcon, CheckIcon, ChevronLeft, ListIcon, PinIcon, PlusIcon, XIcon } from "./Icons";
import { Button, Input, Spinner, Textarea, cx } from "./ui";

interface NearbyResult {
  providerId: string;
  name: string;
  address: string;
  category: string;
  distanceMeters: number;
}

interface GuideOption {
  id: string;
  slug: string;
  title: string;
  placeCount: number;
  city: string;
}

type Step = "confirm" | "capture" | "save" | "done";
type LocateState = "locating" | "found" | "empty" | "denied";

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m away` : `${(m / 1000).toFixed(1)}km away`;
}

/** The guide nudge shows from this many places in one city that aren't in a guide yet. */
const NUDGE_MIN = 4;

/**
 * + → Add a place: find it (search, a dropped pin, or near you) → describe it → save it to My spots
 * (recommended or just for you) → done: add another, or put it in a guide. Opened from one of your
 * guides (`intoGuide`), it saves straight into that guide instead.
 */
export function RecordFlow({
  guides,
  intoGuide,
  forWish,
  photoPlaces = false,
}: {
  /** Show "From your photos" (team test, admins only for now). */
  photoPlaces?: boolean;
  guides: GuideOption[];
  intoGuide?: { id: string; slug: string; title: string } | null;
  /** Adding spots for someone's wish (their city): the done screen offers to send them. */
  forWish?: { id: string; city: string; name: string } | null;
}) {
  const router = useRouter();
  const exitFlow = useExitFlow();
  const [step, setStep] = useState<Step>("confirm");
  const [locate, setLocate] = useState<LocateState>("locating");
  const [nearby, setNearby] = useState<NearbyResult[]>([]);
  const [pickedIdx, setPickedIdx] = useState(0);
  const [selected, setSelected] = useState<{ providerId?: string; name: string; pin?: { lat: number; lng: number; category?: string } } | null>(null);
  /** Where the person is (used once to suggest places, and to start a dropped pin). */
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [pinning, setPinning] = useState(false);
  /** What Google already knows about the picked place, shown while capturing. */
  const [googleInfo, setGoogleInfo] = useState<{ id: string; info: GoogleInfo | null } | null>(null);
  const pickedId = selected?.providerId;
  useEffect(() => {
    if (!pickedId) return;
    let live = true;
    fetch(`/api/places/details?id=${encodeURIComponent(pickedId)}`)
      .then((r) => r.json())
      .then((d: { info: GoogleInfo | null }) => live && setGoogleInfo({ id: pickedId, info: d.info }))
      .catch(() => live && setGoogleInfo({ id: pickedId, info: null }));
    return () => { live = false; };
  }, [pickedId]);
  const shownInfo = pickedId && googleInfo?.id === pickedId ? googleInfo.info : null;
  /**
   * A city was picked as the spot (21 Oct 2026): back to search with "That's a city, not a spot", searching in
   * that city. The tip, photos and Keep it private stay as typed.
   */
  const [cityNotSpot, setCityNotSpot] = useState<{ city: TypedCity | null; n: number } | null>(null);
  const backToSearchIn = (city: TypedCity | null) => {
    setCityNotSpot((c) => ({ city, n: (c?.n ?? 0) + 1 }));
    setSelected(null);
    setGoogleInfo(null);
    setError(null);
    setStep("confirm");
    window.scrollTo({ top: 0 });
  };

  const [special, setSpecial] = useState("");
  /** The description box, before Add (works like the tip box; Continue keeps it too). */
  const [specialDraft, setSpecialDraft] = useState("");
  const [tips, setTips] = useState<string[]>([]);
  const [tipDraft, setTipDraft] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  /** Vouched (friends see it) unless you tick "Keep it private" for this one spot. Never remembered (21 Oct 2026). */
  const [keepPrivate, setKeepPrivate] = useState(false);
  const recommend = !keepPrivate;

  /** Where the place is, once Google has told us (dropped pins don't say). */
  const placeCity = shownInfo?.city?.trim() ?? "";
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** The place just saved (the done screen). */
  const [done, setDone] = useState<RecordedPlace | null>(null);
  /** "Put it in a guide" sheet, and what's happened there. */
  const [guideSheet, setGuideSheet] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [putIn, setPutIn] = useState<{ slug: string; title: string; already: boolean } | null>(null);
  /** Same-city guides first (My spots itself isn't a guide). */
  const doneCity = done?.city ?? "";
  const isDoneCity = (g: GuideOption) => !!doneCity && g.city.trim().toLowerCase() === doneCity.toLowerCase();
  const ownGuides = guides.filter((g) => !isReservedTitle(g.title));
  const sheetGuides = [...ownGuides.filter(isDoneCity), ...ownGuides.filter((g) => !isDoneCity(g))];

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => {
        setLocate("denied");
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        try {
          const res = await fetch("/api/places/nearby", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const data = (await res.json()) as { results: NearbyResult[] };
          if (data.results?.length) {
            setNearby(data.results);
            setLocate("found");
          } else {
            setLocate("empty");
          }
        } catch {
          setLocate("empty");
        }
      },
      () => {
        setLocate("denied");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const confirmPicked = () => {
    const r = nearby[pickedIdx];
    if (!r) return;
    setSelected({ providerId: r.providerId, name: r.name });
    setStep("capture");
  };

  const pickManual = (pick: { providerId?: string; name: string }) => {
    setSelected(pick);
    setStep("capture");
  };

  const save = (share: boolean) => {
    if (!selected) return;
    setError(null);
    // Google says it's a city (an old link, or a city that slipped through): ask for the place itself.
    if (shownInfo?.region) {
      backToSearchIn(shownInfo.region);
      return;
    }
    startSaving(async () => {
      try {
        const res = await saveRecordedPlace({
          providerId: selected.providerId,
          pin: selected.pin,
          name: selected.name,
          cityHint: placeCity || undefined,
          // One "Your tip" box: it's the place's description (what makes it special).
          special: (special || specialDraft).trim(),
          tips: [...tips, ...(tipDraft.trim() ? [tipDraft.trim()] : [])],
          photoMediaIds: photoIds,
          ...(intoGuide ? { guideId: intoGuide.id } : { share }),
        });
        if (res.intoGuide) {
          router.replace(`/g/${res.guideSlug}`);
          return;
        }
        setDone(res);
        setPutIn(null);
        setStep("done");
        window.scrollTo({ top: 0 });
      } catch (e) {
        if (readUserError(e)?.code === "region") {
          // The server caught it (typed "as named", or Google's details hadn't loaded): find the city to search in.
          let city: TypedCity | null = shownInfo?.region ?? null;
          if (!city) {
            try {
              const r = await fetch(`/api/places/autocomplete?places=1&q=${encodeURIComponent(selected.name)}`);
              city = ((await r.json()) as { city?: TypedCity | null }).city ?? null;
            } catch {
              /* search without the city chip */
            }
          }
          backToSearchIn(city);
          return;
        }
        setError(errorText(e, "Couldn't save that place."));
      }
    });
  };

  /** Done → Add another: back to search with a clean slate (where you are is kept; no reload). */
  const addAnother = () => {
    setSelected(null);
    setGoogleInfo(null);
    setSpecial("");
    setSpecialDraft("");
    setTips([]);
    setTipDraft("");
    setPhotoIds([]);
    setPickedIdx(0);
    setDone(null);
    setPutIn(null);
    setGuideSheet(false);
    setNewTitle("");
    setError(null);
    setCityNotSpot(null);
    setStep("confirm");
    window.scrollTo({ top: 0 });
  };

  const putInGuide = (target: { guideId: string; title: string } | { newTitle: string }) => {
    if (!done) return;
    setError(null);
    startSaving(async () => {
      try {
        const res = await putPlaceInGuide(done.placeId, "guideId" in target ? { guideId: target.guideId } : { newTitle: target.newTitle });
        setPutIn({ slug: res.slug, title: "guideId" in target ? target.title : target.newTitle, already: res.already });
        setGuideSheet(false);
        setNewTitle("");
        router.refresh();
      } catch (e) {
        setError(errorText(e, "Couldn't add it to that guide."));
      }
    });
  };

  return (
    <div className="flex flex-col min-h-dvh">
      {step === "confirm" && (
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="text-[15px] font-semibold">{intoGuide ? `Add a place to ${intoGuide.title}` : "Add a place"}</span>
            <button type="button" aria-label="Close" onClick={() => (intoGuide ? router.replace(`/g/${intoGuide.slug}/edit`) : exitFlow("/"))} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
              <XIcon size={15} />
            </button>
          </div>

          {forWish && (
            <div className="mx-4 mt-3 rounded-2xl bg-terracotta-tint/70 px-4 py-3 text-[13px] leading-snug">
              <b className="font-semibold">{forWish.city} spots for {forWish.name}.</b> Add the places you&apos;d vouch for, then send them to {forWish.name} in one tap.
            </div>
          )}
          <div className="flex flex-col items-center px-7 pt-6 pb-1 text-center">
            <div className="w-16 h-16 rounded-full bg-terracotta-tint flex items-center justify-center mb-3.5">
              <PinIcon size={30} className="text-terracotta" />
            </div>
            <h1 className="font-display text-[22px]">{locate === "found" || locate === "locating" ? "You\u2019re at\u2026" : "Where are you?"}</h1>
            <p className="mt-1 text-[13px] text-ink-muted leading-relaxed">
              {locate === "locating"
                ? "Finding out where you are…"
                : locate === "found"
                  ? "Based on where you are right now — pick the right one, or search if we didn't get it."
                  : "Search for the place you\u2019re at — the name and area work best."}
            </p>
          </div>

          <div className="px-5 pt-4">
            {locate === "denied" && <p className="mb-2 text-[12px] text-ink-muted">We couldn&apos;t get your location, so search for the place instead.</p>}
            {locate === "empty" && <p className="mb-2 text-[12px] text-ink-muted">Nothing nearby matched — search for the place instead.</p>}
            {cityNotSpot && (
              <div role="alert" className="mb-2.5 rounded-2xl bg-terracotta-tint/70 px-3.5 py-2.5 text-[13px] leading-snug">
                <b className="font-semibold">{REGION_SPOT_TEXT}</b>
                {(specialDraft.trim() || special.trim()) && <span className="block text-[12px] text-ink-muted mt-0.5">Your tip is kept.</span>}
              </div>
            )}
            <PlaceSearch
              key={cityNotSpot ? `city-${cityNotSpot.n}` : "search"}
              placesOnly
              initialInCity={cityNotSpot?.city ?? null}
              onPick={(pick) => { setCityNotSpot(null); pickManual(pick); }}
              placeholder="Search for the place you're at…"
              autoFocus={!!cityNotSpot || locate === "denied" || locate === "empty"}
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              {locate !== "locating" && (
                <button type="button" onClick={() => setPinning(true)} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
                  <PinIcon size={15} /> Not listed? Pin this exact spot
                </button>
              )}
            </div>
            {!intoGuide && (
              <div className="mt-4 flex flex-col gap-2">
                <Link href="/create?import=1" className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft">
                  <span className="w-9 h-9 rounded-xl bg-sage-tint text-sage flex items-center justify-center shrink-0"><ListIcon size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold">Import a list</span>
                    <span className="block text-[12px] text-ink-muted">Google Maps, screenshots, WhatsApp or notes</span>
                  </span>
                  <span aria-hidden className="text-ink-faint">›</span>
                </Link>
                {photoPlaces && <Link href="/photo-places" className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-3.5 py-3 hover:border-terracotta-soft">
                  <span className="w-9 h-9 rounded-xl bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><CameraIcon size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold">From your photos</span>
                    <span className="block text-[12px] text-ink-muted">Find the places where you took them</span>
                  </span>
                  <span aria-hidden className="text-ink-faint">›</span>
                </Link>}
              </div>
            )}
          </div>

          {locate === "locating" && (
            <div className="flex justify-center py-8"><Spinner /></div>
          )}

          {locate === "found" && (
            <div className="flex flex-col gap-2.5 px-5 pt-5">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Near you</p>
              {nearby.map((r, i) => (
                <button
                  type="button"
                  key={r.providerId}
                  onClick={() => setPickedIdx(i)}
                  className={cx(
                    "relative text-left rounded-2xl border p-3 flex gap-2.5 items-center bg-paper",
                    pickedIdx === i ? "border-terracotta" : "border-line opacity-75",
                  )}
                >
                  {i === 0 && (
                    <span className="absolute -top-2.5 left-3 bg-terracotta text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Best match</span>
                  )}
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-terracotta-soft to-terracotta shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{r.name}</div>
                    <div className="text-[11.5px] text-ink-muted truncate">{r.address} · {formatDistance(r.distanceMeters)}</div>
                  </div>
                  {pickedIdx === i && <CheckIcon size={19} className="text-terracotta shrink-0" />}
                </button>
              ))}
            </div>
          )}

          <div className="mt-auto px-5 pb-7 pt-4 flex flex-col items-center gap-3">
            {locate === "found" && <Button className="w-full" onClick={confirmPicked}>Yes, that&apos;s it</Button>}
            {locate !== "locating" && (
              <p className="text-[10.5px] text-ink-faint text-center">Your location is used once, to confirm — it isn&apos;t stored.</p>
            )}
          </div>
        </div>
      )}

      {pinning && (
        <PinDropSheet
          title="Pin this spot"
          initialCenter={here}
          saveLabel="Use this spot"
          onClose={() => setPinning(false)}
          onSave={async ({ name, lat, lng, category }) => {
            setSelected({ name, pin: { lat, lng, category } });
            setPinning(false);
            setStep("capture");
          }}
        />
      )}

      {/* One step after picking the place (16 Oct 2026): a tip, photos, Recommend, Save. */}
      {step === "capture" && selected && (
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <button type="button" aria-label="Back" onClick={() => setStep("confirm")} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
              <ChevronLeft size={17} />
            </button>
            <span className="text-[15px] font-semibold">{intoGuide ? `Add to ${intoGuide.title}` : "Add a spot"}</span>
          </div>

          <div className="mx-4 mt-3.5 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-terracotta-tint px-3 py-2 min-w-0">
              <PinIcon size={14} className="text-terracotta-deep shrink-0" />
              <span className="text-[13px] font-semibold text-terracotta-deep truncate">{selected.name}</span>
            </span>
            <button type="button" onClick={() => setStep("confirm")} className="text-[12px] text-ink-muted underline shrink-0">change</button>
          </div>
          {shownInfo && (
            <div className="mx-4 mt-3">
              <GoogleInfoCard info={shownInfo} compact />
            </div>
          )}

          <div className="flex flex-col gap-4 px-5 pt-5">
            <div>
              <label htmlFor="spot-tip" className="block text-[13.5px] font-semibold mb-1.5">
                Your tip <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <Textarea
                id="spot-tip"
                rows={3}
                value={specialDraft}
                onChange={(e) => setSpecialDraft(e.target.value)}
                placeholder="Why you love it, what to order, where to sit, best time to go…"
              />
            </div>
            <div className="flex gap-2.5 flex-wrap">
              {photoIds.map((id) => (
                <div key={id} className="relative w-[64px] h-[64px] rounded-2xl overflow-hidden bg-cream-deep">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/media/${id}`} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setPhotoIds((ids) => ids.filter((x) => x !== id))}
                    className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-paper shadow flex items-center justify-center"
                  >
                    <XIcon size={9} className="text-ink-muted" />
                  </button>
                </div>
              ))}
              <PhotoPicker
                onUploaded={(id) => setPhotoIds((ids) => [...ids, id])}
                className="h-[64px] px-4 rounded-2xl border-[1.5px] border-dashed border-line bg-paper flex items-center justify-center gap-2 text-ink-muted text-[13px] font-medium"
                label="Add photo"
              >
                <CameraIcon size={18} /> {photoIds.length ? "" : "Add a photo"}
              </PhotoPicker>
            </div>
            {!intoGuide && (
              <label className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper px-4 py-3 cursor-pointer">
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold">Keep it private</span>
                  <span className="block text-[12.5px] text-ink-muted leading-snug">
                    {keepPrivate ? "Only in your My spots. You can vouch for it later." : `You're vouching for it. Friends see it on the ${placeCity || "city"} page`}
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={keepPrivate}
                  onChange={(e) => setKeepPrivate(e.target.checked)}
                  className="peer sr-only"
                />
                <span aria-hidden className="relative w-12 h-7 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta after:absolute after:top-[3px] after:left-[3px] after:w-[22px] after:h-[22px] after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            )}
          </div>

          {error && <p className="px-5 pt-3 text-[12.5px] text-danger">{error}</p>}
          <div className="mt-auto px-5 pt-5 pb-8">
            <Button className="w-full" size="lg" disabled={saving} onClick={() => save(recommend)}>
              {saving ? <Spinner /> : intoGuide ? `Add to ${intoGuide.title}` : "Save"}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && done && (
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-end px-4 pt-4">
            <button type="button" aria-label="Close" onClick={() => router.replace(myPlacesHref(done.city))} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
              <XIcon size={15} />
            </button>
          </div>
          <div className="flex flex-col items-center px-7 pt-2 text-center">
            <div className="w-16 h-16 rounded-full bg-sage-tint text-sage flex items-center justify-center mb-3.5">
              <CheckIcon size={30} />
            </div>
            <h1 className="font-display text-[28px] leading-tight">{done.city ? `Added to My ${done.city}` : "Added to My spots"} ✓</h1>
            <p className="mt-1.5 text-[15px] font-semibold">{done.name}</p>
            {done.address && <p className="mt-0.5 text-[12.5px] text-ink-muted">{done.address}</p>}
            <Link href={`/g/${done.guideSlug}/p/${done.placeId}#fix`} className="mt-1 text-[12.5px] font-medium text-terracotta-deep underline underline-offset-2">
              Wrong place? Fix location
            </Link>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              {done.shared ? `You vouch for it · friends see it on the ${done.city || "city"} page` : "Only you can see it"}
            </p>
            {putIn && (
              <p className="mt-2 text-[12.5px] text-sage font-medium">
                {putIn.already ? "Already in " : "Also in "}
                <Link href={`/g/${putIn.slug}/edit`} className="underline underline-offset-2">{putIn.title}</Link>
                {putIn.already ? "" : " ✓"}
              </p>
            )}
          </div>

          <div className="mt-auto px-5 pt-6 pb-8 flex flex-col gap-2.5">
            {forWish && done.city.toLowerCase() === forWish.city.toLowerCase() && done.recommended > 0 ? (
              <div className="mb-2 rounded-2xl bg-ink text-cream px-4 py-3.5 flex flex-col gap-2.5">
                <p className="text-[14.5px] font-semibold leading-snug">
                  You vouch for {done.recommended} {done.city} spot{done.recommended === 1 ? "" : "s"}. Send {done.recommended === 1 ? "it" : "them"} to {forWish.name}?
                </p>
                <SendSpotsButton dark wishIds={[forWish.id]} label={`Send ${forWish.name} your ${done.recommended} spot${done.recommended === 1 ? "" : "s"}`} className="w-full" />
              </div>
            ) : forWish && done.city.toLowerCase() === forWish.city.toLowerCase() && !done.shared ? (
              <p className="mb-1 text-center text-[12.5px] text-ink-muted">Only places you vouch for can be sent to {forWish.name}.</p>
            ) : (
              done.city && done.unguided >= NUDGE_MIN && !putIn && <GuideNudge city={done.city} count={done.unguided} className="mb-2" />
            )}
            <Button className="w-full" size="lg" onClick={addAnother}>
              <PlusIcon size={18} /> Add another
            </Button>
            <Button className="w-full" variant="outline" disabled={saving} onClick={() => setGuideSheet(true)}>
              Put it in a guide
            </Button>
            <Link href={myPlacesHref(done.city)} className="self-center mt-1.5 text-[13px] font-medium text-terracotta-deep">
              See {done.city ? `My ${done.city}` : "My spots"} →
            </Link>
            {error && <p className="text-[12.5px] text-danger text-center">{error}</p>}
          </div>
        </div>
      )}

      {guideSheet && done && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Put it in a guide">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={() => setGuideSheet(false)} />
          <div className="relative w-full max-w-[480px] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-cream px-5 pt-3 pb-8 safe-bottom shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-[24px]">Put it in a guide</h2>
              <button type="button" aria-label="Close" onClick={() => setGuideSheet(false)} className="p-1 text-ink-muted"><XIcon size={18} /></button>
            </div>
            <p className="mb-3 text-[12.5px] text-ink-muted">It stays in My spots too.</p>
            <div className="flex flex-col gap-2">
              {sheetGuides.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  disabled={saving}
                  onClick={() => putInGuide({ guideId: g.id, title: g.title })}
                  className="flex items-center gap-2.5 rounded-2xl border border-line bg-paper p-2.5 text-left hover:border-terracotta-soft disabled:opacity-60"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-terracotta-soft to-terracotta shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold truncate">{g.title}</div>
                    <div className="text-[11px] text-ink-muted">{[isDoneCity(g) ? g.city : "", `${g.placeCount} place${g.placeCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <PlusIcon size={16} className="text-terracotta shrink-0" />
                </button>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newTitle.trim()) putInGuide({ newTitle: newTitle.trim() });
                }}
                className="rounded-2xl border-[1.5px] border-dashed border-terracotta-soft p-3 flex flex-col gap-2"
              >
                <label htmlFor="new-guide-title" className="text-[13.5px] font-bold">Start a new guide</label>
                <Input id="new-guide-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={done.city ? `e.g. My favourite spots in ${done.city}` : "e.g. Weekend away with the boys"} />
                <Button type="submit" size="sm" disabled={saving || !newTitle.trim()} className="self-start">
                  {saving ? <Spinner /> : "Create guide"}
                </Button>
              </form>
              {error && <p className="text-[12.5px] text-danger">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
