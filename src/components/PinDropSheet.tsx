"use client";

import { useEffect, useState } from "react";
import { errorText } from "@/lib/errorText";
import { APIProvider, ControlPosition, Map, useMap } from "@vis.gl/react-google-maps";
import { CATEGORIES } from "@/lib/places/categories";
import { findCity } from "@/lib/places/cities";
import { formatCoords } from "@/lib/places/pins";
import { LocateIcon, PinIcon } from "./Icons";
import { Sheet } from "./ShareSheet";
import { Button, Input, Label, Spinner, cx } from "./ui";

type LatLng = { lat: number; lng: number };

/** Reads "25.123, 55.456", a Google Maps link with @lat,lng / q=lat,lng, or "N 25.1 E 55.4"-ish text. */
export function parseCoords(text: string): LatLng | null {
  const t = decodeURIComponent(text.trim());
  const m =
    t.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ??
    t.match(/[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/) ??
    t.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ??
    t.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * "Drop a pin": for spots with no Google listing — a sunset point, a campsite, a trailhead.
 * Move the map until the pin sits on the spot (satellite view helps out of town), or use your
 * location, or paste coordinates / a maps link.
 */
export function PinDropSheet({
  title = "Drop a pin",
  initialName = "",
  initialCenter,
  cityHint,
  askName = true,
  askCategory = true,
  saveLabel = "Add to guide",
  onSave,
  onClose,
}: {
  title?: string;
  initialName?: string;
  /** Where the map starts: an existing pin, or the guide's other places. */
  initialCenter?: LatLng | null;
  cityHint?: string;
  askName?: boolean;
  askCategory?: boolean;
  saveLabel?: string;
  onSave: (pick: { name: string; lat: number; lng: number; category: string }) => Promise<void>;
  onClose: () => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const city = findCity(cityHint);
  const start = initialCenter ?? (city ? { lat: city.lat, lng: city.lng } : null);
  const [center, setCenter] = useState<LatLng | null>(start);
  const [jump, setJump] = useState<LatLng | null>(null);
  const [zoom] = useState(initialCenter ? 16 : city ? 12 : 2);
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<string>("Scenic Spots");
  const [satellite, setSatellite] = useState(false);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setJump(p);
        setCenter(p);
        setLocating("idle");
      },
      () => setLocating("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Nothing to start from (no pin, no places, unknown city): start where the person is.
  useEffect(() => {
    if (!start) queueMicrotask(locate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPaste = (text: string) => {
    setPaste(text);
    if (!text.trim()) return setPasteError(false);
    const p = parseCoords(text);
    setPasteError(!p);
    if (p) { setJump(p); setCenter(p); }
  };

  const save = async () => {
    if (!center) return;
    if (askName && !name.trim()) return setError("Give the spot a name.");
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), lat: center.lat, lng: center.lng, category });
    } catch (e) {
      setError(errorText(e, "Couldn't save that pin."));
      setSaving(false);
    }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      {askName && (
        <div className="mb-3">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hatta sunset rock, Wadi camping spot" autoFocus={!initialName} />
        </div>
      )}

      <p className="text-[12.5px] text-ink-muted mb-2">Move the map until the pin sits on the spot.</p>
      <div className="relative h-[320px] rounded-3xl overflow-hidden border border-line bg-cream-deep/60 isolate">
        {apiKey ? (
          <APIProvider apiKey={apiKey}>
            <Map
              defaultCenter={start ?? { lat: 20, lng: 0 }}
              defaultZoom={zoom}
              mapTypeId={satellite ? "hybrid" : "roadmap"}
              gestureHandling="greedy"
              disableDefaultUI
              zoomControl
              zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
              clickableIcons={false}
              style={{ width: "100%", height: "100%" }}
              onCameraChanged={(e) => setCenter(e.detail.center)}
            >
              <JumpTo target={jump} />
            </Map>
          </APIProvider>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12px] text-ink-faint">
            Map unavailable here — paste coordinates below instead.
          </div>
        )}
        {/* The pin stays in the middle; the map moves under it. Its tip marks the spot. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -87.5%)" }}>
          <PinIcon size={40} className="text-terracotta drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] fill-paper" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-terracotta/70" />
        {apiKey && (
          <div className="absolute top-3 left-3 flex gap-2">
            <button type="button" onClick={() => setSatellite((s) => !s)} className="rounded-full bg-paper/95 shadow px-3 py-1.5 text-[12px] font-medium">
              {satellite ? "Map" : "Satellite"}
            </button>
            <button type="button" onClick={locate} className="rounded-full bg-paper/95 shadow px-3 py-1.5 text-[12px] font-medium inline-flex items-center gap-1.5">
              {locating === "busy" ? <Spinner /> : <LocateIcon size={14} />} My location
            </button>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-faint tabular-nums">
        {center ? formatCoords(center.lat, center.lng) : "Move the map, use your location or paste coordinates."}
        {locating === "denied" && <span className="text-ink-muted"> · Couldn&apos;t get your location.</span>}
      </p>

      <div className="mt-3">
        <Label>Or paste coordinates / a maps link</Label>
        <Input value={paste} onChange={(e) => applyPaste(e.target.value)} placeholder="25.07812, 55.13921" inputMode="text" autoComplete="off" />
        {pasteError && <p className="mt-1 text-[11.5px] text-danger">Couldn&apos;t read coordinates from that.</p>}
      </div>

      {askCategory && (
        <div className="mt-3">
          <Label>Category</Label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c)}
                className={cx("rounded-full px-3 py-1.5 text-[12px] font-medium border", category === c ? "bg-ink text-cream border-ink" : "bg-paper border-line text-ink-muted")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] text-danger">{error}</p>}
      <Button className="w-full mt-4" onClick={save} disabled={!center || saving}>
        {saving ? <Spinner /> : <PinIcon size={16} />} {saveLabel}
      </Button>
    </Sheet>
  );
}

function JumpTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && target) {
      map.panTo(target);
      if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
    }
  }, [map, target]);
  return null;
}
