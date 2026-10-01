"use client";

import { useEffect, useState } from "react";
import { APIProvider, ControlPosition, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { cx } from "./ui";

export interface MapPlace {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  category: string;
  note?: string;
}

const PIN_SVG = (fill: string, n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 30"><path d="M12 29s9-9.5 9-16A9 9 0 1 0 3 13c0 6.5 9 16 9 16z" fill="${fill}" stroke="white" stroke-width="1.5"/><text x="12" y="16.5" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="9" font-weight="600" fill="white">${n}</text></svg>`
  )}`;

const pinFill = (category: string) => (["Nature", "Sports & Wellness"].includes(category) ? "oklch(62% 0.13 150)" : "oklch(62% 0.13 45)");

/** Google Maps (via @vis.gl/react-google-maps) with numbered terracotta/sage pins. Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. */
export function GuideMap({ places, height = 360, onSelect, className }: { places: MapPlace[]; height?: number | string; onSelect?: (id: string) => void; className?: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const wrapperClass = cx("isolate z-0", className ?? "w-full rounded-3xl overflow-hidden border border-line");

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
        <GuideMapInner places={places} onSelect={onSelect} />
      </APIProvider>
    </div>
  );
}

function GuideMapInner({ places, onSelect }: { places: MapPlace[]; onSelect?: (id: string) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const withCoords = places.filter((p): p is MapPlace & { lat: number; lng: number } => typeof p.lat === "number" && typeof p.lng === "number");
  const active = withCoords.find((p) => p.id === activeId) ?? null;

  return (
    <Map
      defaultCenter={withCoords[0] ? { lat: withCoords[0].lat, lng: withCoords[0].lng } : { lat: 20, lng: 0 }}
      defaultZoom={withCoords.length ? 14 : 2}
      disableDefaultUI={false}
      zoomControl
      zoomControlOptions={{ position: ControlPosition.RIGHT_BOTTOM }}
      streetViewControl={false}
      mapTypeControl={false}
      fullscreenControl={false}
      gestureHandling="greedy"
      style={{ width: "100%", height: "100%" }}
      onClick={() => setActiveId(null)}
    >
      <FitToPlaces places={withCoords} />
      {withCoords.map((p, i) => (
        <Marker
          key={p.id}
          position={{ lat: p.lat, lng: p.lng }}
          icon={PIN_SVG(pinFill(p.category), i + 1)}
          onClick={() => {
            setActiveId(p.id);
            onSelect?.(p.id);
          }}
        />
      ))}
      {active && (
        <InfoWindow position={{ lat: active.lat, lng: active.lng }} onCloseClick={() => setActiveId(null)}>
          <div style={{ fontFamily: "inherit", maxWidth: 220 }}>
            <strong style={{ fontWeight: 600 }}>{active.name}</strong>
            {active.note && (
              <div style={{ marginTop: 4, fontStyle: "italic", color: "oklch(48% 0.02 60)", fontSize: 12.5 }}>
                {active.note.slice(0, 120)}
                {active.note.length > 120 ? "…" : ""}
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </Map>
  );
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
      map.setZoom(14);
    } else {
      map.setCenter({ lat: 20, lng: 0 });
      map.setZoom(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, JSON.stringify(places.map((p) => [p.id, p.lat, p.lng]))]);

  return null;
}
