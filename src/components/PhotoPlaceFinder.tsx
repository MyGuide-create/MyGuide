"use client";

import { useEffect, useMemo, useState } from "react";
import { errorText } from "@/lib/errorText";
import { placesNearSpot, searchNearSpot, type PhotoPlaceOption, type PhotoPlaceSuggestion } from "@/lib/actions/photoPlaces";
import { GuideMap, type MapPlace } from "./GuideMap";
import { SearchIcon, XIcon } from "./Icons";
import { Button, Input, Spinner, cx } from "./ui";

const metres = (m: number) => (m < 1000 ? `${Math.round(m / 5) * 5 || 5} m` : `${(m / 1000).toFixed(1)} km`);

/**
 * "Where was this?" for one photo-places suggestion: the photos taken there, a map of the spot and
 * everything around it, a search, and "Look further". Picking a place replaces the guess.
 */
export function PhotoPlaceFinder({
  suggestion,
  files,
  onPick,
  onSkip,
  onClose,
}: {
  suggestion: PhotoPlaceSuggestion;
  /** The picked photos taken at this spot (stay on the phone). */
  files: File[];
  onPick: (o: PhotoPlaceOption) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const s = suggestion;
  const current: PhotoPlaceOption = { providerId: s.providerId, name: s.name, category: s.category, area: s.area, city: s.city, photoUrl: s.photoUrl, distance: s.distance, haveIn: s.haveIn, lat: s.lat, lng: s.lng };
  const [options, setOptions] = useState<PhotoPlaceOption[]>(() => dedupe([current, ...s.alts]));
  const [radius, setRadius] = useState(120);
  const [loadedRadius, setLoadedRadius] = useState(0);
  const loading = loadedRadius !== radius;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");

  // Thumbnails of the photos (object URLs, freed on close).
  const thumbs = useMemo(() => files.slice(0, 12).map((f) => ({ url: URL.createObjectURL(f), name: f.name })), [files]);
  useEffect(() => () => thumbs.forEach((t) => URL.revokeObjectURL(t.url)), [thumbs]);

  useEffect(() => {
    let live = true;
    placesNearSpot(s.spotLat, s.spotLng, radius)
      .then((found) => live && setOptions((o) => dedupe([...o, ...found]).sort((a, b) => a.distance - b.distance)))
      .catch((e) => live && setError(errorText(e, "Couldn't load the places around here.")))
      .finally(() => live && setLoadedRadius(radius));
    return () => {
      live = false;
    };
  }, [s.spotLat, s.spotLng, radius]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      const found = await searchNearSpot(q, s.spotLat, s.spotLng);
      if (!found.length) setError(`Nothing called “${q}” near here.`);
      setOptions((o) => dedupe([...found, ...o]));
    } catch (e) {
      setError(errorText(e, "Couldn't search."));
    } finally {
      setSearching(false);
    }
  };

  const pins: MapPlace[] = [
    { id: "__spot", name: "Where you took the photos", lat: s.spotLat, lng: s.spotLng, category: "Nature", n: 0 },
    ...options.slice(0, 20).map((o, i) => ({ id: o.providerId, name: o.name, lat: o.lat, lng: o.lng, category: o.category, n: i + 1 })),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-cream flex flex-col" role="dialog" aria-label="Find the right place">
      <div className="flex items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 border-b border-line/70">
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 -ml-1 rounded-full flex items-center justify-center hover:bg-cream-deep">
          <XIcon size={20} />
        </button>
        <h2 className="font-display text-[22px] leading-tight flex-1 min-w-0 truncate">Where were you?</h2>
      </div>

      <div className="flex-1 overflow-y-auto pb-[calc(9rem+env(safe-area-inset-bottom))]">
        {thumbs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pt-3">
            {thumbs.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={t.url} src={t.url} alt={t.name} className="h-24 w-24 shrink-0 rounded-xl object-cover bg-cream-deep" />
            ))}
            {files.length > thumbs.length && (
              <span className="h-24 w-16 shrink-0 rounded-xl bg-cream-deep text-[12px] text-ink-muted flex items-center justify-center">+{files.length - thumbs.length}</span>
            )}
          </div>
        )}
        <p className="px-4 pt-2 text-[12.5px] text-ink-muted">
          {s.photos} photo{s.photos === 1 ? "" : "s"} taken here. The dot on the map is where; numbers are the places around it.
        </p>

        <div className="px-4 pt-3">
          <GuideMap places={pins} height={230} showCard={false} locate={false} onSelect={(id) => id !== "__spot" && document.getElementById(`opt-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} />
        </div>

        <form
          className="px-4 pt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Know the name? Search for it" className="py-2.5" />
          <Button type="submit" variant="outline" disabled={!query.trim() || searching} aria-label="Search">
            {searching ? <Spinner /> : <SearchIcon size={16} />}
          </Button>
        </form>
        {error && <p className="px-4 pt-2 text-[13px] text-terracotta">{error}</p>}

        <ol className="px-4 pt-3 flex flex-col gap-2">
          {options.map((o, i) => {
            const isCurrent = o.providerId === s.providerId;
            return (
              <li key={o.providerId} id={`opt-${o.providerId}`}>
                <button
                  onClick={() => onPick(o)}
                  className={cx("w-full text-left rounded-2xl border bg-paper p-3 flex items-center gap-3", isCurrent ? "border-terracotta" : "border-line/80 hover:border-terracotta-soft")}
                >
                  <span className="w-7 h-7 shrink-0 rounded-full bg-terracotta text-white text-[12px] font-semibold flex items-center justify-center">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[14.5px] leading-snug">{o.name}</span>
                    <span className="block text-[12.5px] text-ink-muted truncate">
                      {[o.category, o.area, metres(o.distance)].filter(Boolean).join(" · ")}
                    </span>
                    {(isCurrent || o.haveIn) && (
                      <span className="block text-[12px] text-ink-muted">
                        {[isCurrent ? "Current guess" : "", o.haveIn ? `Already in ${o.haveIn}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {o.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={o.photoUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 bg-cream-deep" loading="lazy" />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="px-4 pt-3 flex flex-col items-start gap-2.5 text-[13.5px]">
          {loading ? (
            <span className="flex items-center gap-2 text-ink-muted">
              <Spinner /> Looking around…
            </span>
          ) : (
            radius < 400 && (
              <button onClick={() => setRadius(radius < 250 ? 300 : 500)} className="font-semibold text-terracotta">
                Look further ({radius < 250 ? "300" : "500"} m)
              </button>
            )
          )}
          <a href={`https://www.google.com/maps/search/?api=1&query=${s.spotLat},${s.spotLng}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-terracotta">
            Open this spot in Google Maps
          </a>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-cream/95 backdrop-blur border-t border-line/70 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button variant="outline" size="lg" className="w-full" onClick={onSkip}>
          None of these — leave this spot out
        </Button>
      </div>
    </div>
  );
}

function dedupe(list: PhotoPlaceOption[]): PhotoPlaceOption[] {
  const seen = new Set<string>();
  return list.filter((o) => (seen.has(o.providerId) ? false : (seen.add(o.providerId), true)));
}
