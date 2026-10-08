"use client";

import { useRouter } from "next/navigation";
import { errorText } from "@/lib/errorText";
import { useEffect, useState, useTransition } from "react";
import { saveRecordedPlace } from "@/lib/actions/record";
import { PhotoPicker } from "./PhotoPicker";
import { PlaceSearch } from "./PlaceSearch";
import { PinDropSheet } from "./PinDropSheet";
import { GoogleInfoCard, type GoogleInfo } from "./GoogleInfoCard";
import { CameraIcon, CheckIcon, ChevronLeft, PinIcon, XIcon } from "./Icons";
import { Button, Spinner, Textarea, cx } from "./ui";

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

type Step = "confirm" | "capture" | "save";
type LocateState = "locating" | "found" | "empty" | "denied";

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m away` : `${(m / 1000).toFixed(1)}km away`;
}

/** The full "record a place you're at" flow: geolocate → confirm → capture → file into a guide. */
export function RecordFlow({ guides }: { guides: GuideOption[] }) {
  const router = useRouter();
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

  const [special, setSpecial] = useState("");
  const [tips, setTips] = useState<string[]>([]);
  const [tipDraft, setTipDraft] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);

  /** Where the place is, once Google has told us (dropped pins don't say). */
  const placeCity = shownInfo?.city?.trim() ?? "";
  const sameCity = (g: GuideOption) => !!placeCity && g.city.trim().toLowerCase() === placeCity.toLowerCase();
  /** Same-city guides first; nothing pre-picked unless one matches (a Dubai café shouldn't default into the Bali trip). */
  const sortedGuides = [...guides.filter(sameCity), ...guides.filter((g) => !sameCity(g))];
  const [userChoice, setGuideChoice] = useState<string | null | undefined>(undefined);
  const guideChoice = userChoice !== undefined ? userChoice : (guides.find(sameCity)?.id ?? null);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  const save = (patch: { guideId?: string; newGuideTitle?: string }) => {
    if (!selected) return;
    setError(null);
    startSaving(async () => {
      try {
        const { guideSlug, editing } = await saveRecordedPlace({
          providerId: selected.providerId,
          pin: selected.pin,
          name: selected.name,
          special,
          tips,
          photoMediaIds: photoIds,
          ...patch,
        });
        router.push(editing ? `/g/${guideSlug}/edit?justCreated=1` : `/g/${guideSlug}`);
      } catch (e) {
        setError(errorText(e, "Couldn't save that place."));
      }
    });
  };

  return (
    <div className="flex flex-col min-h-dvh">
      {step === "confirm" && (
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="text-[15px] font-semibold">New memory</span>
            <button type="button" aria-label="Close" onClick={() => router.back()} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
              <XIcon size={15} />
            </button>
          </div>

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
            <PlaceSearch onPick={pickManual} placeholder="Search for the place you're at…" autoFocus={locate === "denied" || locate === "empty"} />
            {locate !== "locating" && (
              <button type="button" onClick={() => setPinning(true)} className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
                <PinIcon size={15} /> Not listed? Pin this exact spot
              </button>
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

      {step === "capture" && selected && (
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <button type="button" aria-label="Back" onClick={() => setStep("confirm")} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
              <ChevronLeft size={17} />
            </button>
            <span className="text-[15px] font-semibold">New memory</span>
          </div>

          <div className="mx-4 mt-3.5 inline-flex items-center gap-2 rounded-full bg-terracotta-tint px-3 py-2 w-fit">
            <PinIcon size={14} className="text-terracotta-deep" />
            <span className="text-[12.5px] font-semibold text-terracotta-deep">{selected.name}</span>
            <button type="button" onClick={() => setStep("confirm")} className="text-[11px] text-ink-muted underline">change</button>
          </div>
          {shownInfo && (
            <div className="mx-4 mt-3">
              <GoogleInfoCard info={shownInfo} compact />
            </div>
          )}

          <div className="flex flex-col gap-5 px-5 pt-5">
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.02em] text-ink-muted mb-1.5">Description - What Makes It Special</label>
              <Textarea rows={3} value={special} onChange={(e) => setSpecial(e.target.value)} placeholder="What it is, and what makes it special — the view, the service, that one dish…" />
            </div>
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.02em] text-ink-muted mb-1.5">Expert tips</label>
              {tips.length > 0 && (
                <ul className="mb-2 flex flex-col gap-1.5">
                  {tips.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-2xl bg-terracotta-tint px-3 py-2">
                      <span className="flex-1 text-[13px] leading-snug">{t}</span>
                      <button type="button" aria-label="Remove tip" onClick={() => setTips((ts) => ts.filter((_, j) => j !== i))} className="text-ink-faint hover:text-danger shrink-0">
                        <XIcon size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-start gap-2">
                <Textarea
                  rows={2}
                  value={tipDraft}
                  onChange={(e) => setTipDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (tipDraft.trim()) { setTips((ts) => [...ts, tipDraft.trim()]); setTipDraft(""); }
                    }
                  }}
                  placeholder="What to order, where to sit, best time to go…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!tipDraft.trim()}
                  onClick={() => { if (tipDraft.trim()) { setTips((ts) => [...ts, tipDraft.trim()]); setTipDraft(""); } }}
                >
                  Add
                </Button>
              </div>
              <p className="mt-1 text-[10.5px] text-ink-faint">Add as many as you want — one at a time.</p>
            </div>
            <div>
              <label className="block text-[12px] font-medium uppercase tracking-[0.02em] text-ink-muted mb-1.5">Photos from your visit</label>
              <div className="flex gap-2.5 flex-wrap">
                {photoIds.map((id) => (
                  <div key={id} className="relative w-[68px] h-[68px] rounded-2xl overflow-hidden bg-cream-deep">
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
                  className="w-[68px] h-[68px] rounded-2xl border-[1.5px] border-dashed border-line bg-paper flex items-center justify-center text-ink-faint"
                  label="Add photo"
                >
                  <CameraIcon size={20} />
                </PhotoPicker>
              </div>
            </div>
          </div>

          <div className="mt-auto px-5 pt-5 pb-8">
            <Button className="w-full" onClick={() => setStep("save")}>Continue</Button>
          </div>
        </div>
      )}

      {step === "save" && selected && (
        <div className="flex flex-col flex-1">
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <button type="button" aria-label="Back" onClick={() => setStep("capture")} className="w-9 h-9 rounded-full border border-line bg-paper flex items-center justify-center">
              <ChevronLeft size={17} />
            </button>
            <span className="text-[15px] font-semibold">Add to a guide</span>
          </div>

          <div className="mx-4 mt-4 rounded-2xl bg-sage-tint px-3.5 py-3 flex items-center gap-2.5">
            <CheckIcon size={18} className="text-sage shrink-0" />
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold">Saved: {selected.name}</div>
              {special && <div className="text-[11.5px] text-ink-muted truncate">&ldquo;{special}&rdquo;</div>}
              {tips.length > 0 && <div className="text-[11px] text-ink-faint">{tips.length} expert tip{tips.length === 1 ? "" : "s"}</div>}
            </div>
          </div>

          <div className="px-5 pt-5">
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ newGuideTitle: placeCity ? `My ${placeCity} guide` : selected.name })}
              className="w-full flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-terracotta bg-terracotta-tint p-4 text-left"
            >
              <div className="w-10 h-10 rounded-full bg-terracotta text-white flex items-center justify-center shrink-0">
                <span className="text-[18px] leading-none">+</span>
              </div>
              <div>
                <div className="text-[14px] font-bold">Create a new guide</div>
                <div className="text-[11.5px] text-ink-muted">Starts a guide with just this place</div>
              </div>
            </button>
          </div>

          {guides.length > 0 && (
            <>
              <div className="flex items-center gap-2.5 px-5 pt-5 pb-1 text-ink-faint text-[11px] font-semibold uppercase tracking-[0.03em]">
                <div className="flex-1 h-px bg-line" /> or add to an existing guide <div className="flex-1 h-px bg-line" />
              </div>
              <div className="flex flex-col gap-2 px-5 pt-2">
                {sortedGuides.map((g) => (
                  <button
                    type="button"
                    key={g.id}
                    onClick={() => setGuideChoice(g.id)}
                    className={cx(
                      "flex items-center gap-2.5 rounded-2xl border p-2.5 text-left",
                      guideChoice === g.id ? "border-terracotta" : "border-line opacity-80",
                    )}
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-terracotta-soft to-terracotta shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-bold truncate">{g.title}</div>
                      <div className="text-[11px] text-ink-muted">{g.placeCount} place{g.placeCount === 1 ? "" : "s"}</div>
                    </div>
                    {guideChoice === g.id && <CheckIcon size={17} className="text-terracotta shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="px-5 pt-3 text-[12.5px] text-danger">{error}</p>}

          <div className="mt-auto px-5 pt-5 pb-8 flex flex-col items-center gap-3">
            {guides.length > 0 && guideChoice && (
              <Button
                className="w-full"
                disabled={saving || !guideChoice}
                onClick={() => save({ guideId: guideChoice ?? undefined })}
              >
                {saving ? <Spinner /> : `Add to "${guides.find((g) => g.id === guideChoice)?.title ?? ""}"`}
              </Button>
            )}
            <button type="button" disabled={saving} onClick={() => save({})} className="text-[12px] text-ink-muted underline">
              Just save it for later, decide next time
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
