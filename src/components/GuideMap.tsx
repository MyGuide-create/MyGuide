"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { APIProvider, ControlPosition, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { LocateIcon, XIcon } from "./Icons";
import { PlaceTile } from "./PlaceTile";
import { cx } from "./ui";

export interface MapPlace {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  category: string;
  note?: string;
  /** Number shown on the pin (1-based). Defaults to the position in `places`. */
  n?: number;
  /** Place detail page, shown as "View place" on the pin card. */
  href?: string;
  /** "Open in Google Maps" link for the pin card. */
  mapsHref?: string;
  photoUrl?: string | null;
  photoMediaId?: string | null;
  /** Short line under the name, e.g. the neighbourhood. */
  subtitle?: string;
  /** Another branch of a place: a smaller pin with the same number. */
  small?: boolean;
}

const PIN_SVG = (fill: string, n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 30"><path d="M12 29s9-9.5 9-16A9 9 0 1 0 3 13c0 6.5 9 16 9 16z" fill="${fill}" stroke="white" stroke-width="1.5"/><text x="12" y="16.5" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="9" font-weight="600" fill="white">${n}</text></svg>`
  )}`;

const CLUSTER_SVG = (n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="oklch(62% 0.13 45)" stroke="white" stroke-width="3"/><text x="20" y="25" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="14" font-weight="600" fill="white">${n}</text></svg>`
  )}`;

const ME_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="10" fill="#4285F4" fill-opacity="0.2"/><circle cx="11" cy="11" r="6" fill="#4285F4" stroke="white" stroke-width="2.5"/></svg>`
)}`;

const pinFill = (category: string) => (["Nature", "Sports & Wellness"].includes(category) ? "oklch(62% 0.13 150)" : "oklch(62% 0.13 45)");

/** Hide Google's own shops, restaurants and transit icons so only the guide's pins stand out. */
const QUIET_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

/** Google Maps (via @vis.gl/react-google-maps) with numbered terracotta/sage pins. Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. */
export function GuideMap({
  places,
  height = 360,
  onSelect,
  className,
  showCard = true,
  locate = true,
  center,
}: {
  places: MapPlace[];
  /** Where to look when there are no pins yet (a new guide's city). */
  center?: { lat: number; lng: number } | null;
  height?: number | string;
  onSelect?: (id: string) => void;
  className?: string;
  /** Show a place card when a pin is tapped. */
  showCard?: boolean;
  /** Show the "my location" button. */
  locate?: boolean;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const wrapperClass = cx("relative isolate z-0", className ?? "w-full rounded-3xl overflow-hidden border border-line");

  if (!apiKey) {
    return (
      <div style={{ height }} className={cx(wrapperClass, "flex items-center justify-center bg-cream-deep/60 text-[12px] text-ink-faint px-4 text-center")}>
        Map unavailable — missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      </div>
    );
  }

  return (
    <div style={{ height }} className={wrapperClass}>
      <APIProvider apiKey={apiKey}>
        <GuideMapInner places={places} onSelect={onSelect} showCard={showCard} locate={locate} center={center ?? null} />
      </APIProvider>
    </div>
  );
}

type Located = MapPlace & { lat: number; lng: number; pin: number };

function GuideMapInner({ places, onSelect, showCard, locate, center }: { places: MapPlace[]; onSelect?: (id: string) => void; showCard: boolean; locate: boolean; center: { lat: number; lng: number } | null }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");
  const withCoords: Located[] = places
    .map((p, i) => ({ ...p, pin: p.n ?? i + 1 }))
    .filter((p): p is Located => typeof p.lat === "number" && typeof p.lng === "number");
  const active = withCoords.find((p) => p.id === activeId) ?? null;

  return (
    <>
      <Map
        defaultCenter={withCoords[0] ? { lat: withCoords[0].lat, lng: withCoords[0].lng } : center ?? { lat: 20, lng: 0 }}
        defaultZoom={withCoords.length ? 14 : center ? 11 : 2}
        disableDefaultUI={false}
        zoomControl
        zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
        streetViewControl={false}
        mapTypeControl={false}
        fullscreenControl={false}
        clickableIcons={false}
        styles={QUIET_STYLES}
        gestureHandling="greedy"
        style={{ width: "100%", height: "100%" }}
        onClick={() => setActiveId(null)}
      >
        <FitToPlaces places={withCoords} />
        <PanTo target={me} />
        <ClusteredPins
          places={withCoords}
          activeId={activeId}
          onPick={(id) => {
            if (showCard) setActiveId(id);
            onSelect?.(id);
          }}
        />
        {me && <Marker position={me} icon={ME_SVG} clickable={false} zIndex={2000} />}
      </Map>

      {locate && (
        <button
          type="button"
          aria-label="Show my location"
          onClick={() => {
            if (!("geolocation" in navigator)) return setLocating("denied");
            setLocating("busy");
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocating("idle");
              },
              () => setLocating("denied"),
              { enableHighAccuracy: true, timeout: 10_000 },
            );
          }}
          className={cx(
            "absolute right-2.5 top-2.5 z-10 w-10 h-10 rounded-full bg-paper shadow-md border border-line flex items-center justify-center",
            locating === "busy" ? "text-terracotta animate-pulse" : me ? "text-[#4285F4]" : "text-ink",
          )}
        >
          <LocateIcon size={19} />
        </button>
      )}
      {locating === "denied" && (
        <div className="absolute left-2.5 right-14 top-2.5 z-10 rounded-xl bg-paper/95 border border-line px-3 py-2 text-[11.5px] text-ink-muted">
          Couldn&apos;t get your location — allow location access for this site in your browser settings.
        </div>
      )}

      {active && showCard && (
        <div className="absolute inset-x-2.5 bottom-2.5 z-10 rounded-2xl bg-paper shadow-float border border-line p-2.5 flex gap-3 items-start">
          <PlaceTile place={active} size={60} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10.5px] text-ink-faint font-medium tabular-nums">{String(active.pin).padStart(2, "0")} · {active.category}</div>
                <div className="font-semibold text-[14.5px] leading-snug truncate">{active.name}</div>
                {active.subtitle && <div className="text-[11.5px] text-ink-muted truncate">{active.subtitle}</div>}
              </div>
              <button type="button" aria-label="Close" onClick={() => setActiveId(null)} className="-m-1 p-1 text-ink-faint hover:text-ink"><XIcon size={16} /></button>
            </div>
            {active.note && <p className="mt-1 text-[12px] italic text-ink-muted line-clamp-2">{active.note}</p>}
            <div className="mt-1.5 flex gap-3 text-[12px] font-medium">
              {active.href && <Link href={active.href} className="text-terracotta">View place</Link>}
              {active.mapsHref && <a href={active.mapsHref} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-terracotta">Directions</a>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Numbered pins, grouped into a terracotta count bubble where they overlap.
 * Tapping a bubble zooms in; tapping a pin opens its card.
 */
function ClusteredPins({ places, activeId, onPick }: { places: Located[]; activeId: string | null; onPick: (id: string) => void }) {
  const map = useMap();
  const pick = useRef(onPick);
  const markersRef = useRef<google.maps.Marker[]>([]);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  const key = JSON.stringify(places.map((p) => [p.id, p.lat, p.lng, p.pin, p.category, p.small]));

  useEffect(() => {
    if (!map) return;
    const markers = places.map((p) => {
      const m = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        icon: p.small
          ? { url: PIN_SVG(pinFill(p.category), p.pin), scaledSize: new google.maps.Size(24, 30), anchor: new google.maps.Point(12, 29) }
          : { url: PIN_SVG(pinFill(p.category), p.pin), scaledSize: new google.maps.Size(34, 42), anchor: new google.maps.Point(17, 41) },
        title: p.name,
      });
      m.set("placeId", p.id);
      m.addListener("click", () => pick.current(p.id));
      return m;
    });
    const clusterer = new MarkerClusterer({
      map,
      markers,
      algorithmOptions: { maxZoom: 15 },
      renderer: {
        render: ({ count, position }) =>
          new google.maps.Marker({
            position,
            icon: { url: CLUSTER_SVG(count), scaledSize: new google.maps.Size(40, 40), anchor: new google.maps.Point(20, 20) },
            zIndex: 900 + count,
          }),
      },
    });
    markersRef.current = markers;
    return () => {
      clusterer.clearMarkers();
      clusterer.setMap(null);
      markers.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  useEffect(() => {
    for (const m of markersRef.current) m.setZIndex(m.get("placeId") === activeId ? 1000 : undefined);
  }, [activeId]);

  return null;
}

function PanTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && target) map.panTo(target);
  }, [map, target]);
  return null;
}

/** Imperatively fits/recenters the map whenever the place list changes (mirrors defaultBounds but stays reactive). */
function FitToPlaces({ places }: { places: Array<{ id: string; lat: number; lng: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (places.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
      map.fitBounds(bounds, 36);
    } else if (places.length === 1) {
      map.setCenter({ lat: places[0].lat, lng: places[0].lng });
      map.setZoom(15);
    } else {
      map.setCenter({ lat: 20, lng: 0 });
      map.setZoom(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(places.map((p) => [p.id, p.lat, p.lng]))]);

  return null;
}
