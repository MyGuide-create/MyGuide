"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap } from "leaflet";
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
  `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 24 30"><path d="M12 29s9-9.5 9-16A9 9 0 1 0 3 13c0 6.5 9 16 9 16z" fill="${fill}" stroke="white" stroke-width="1.5"/><text x="12" y="16.5" text-anchor="middle" font-family="Work Sans, sans-serif" font-size="9" font-weight="600" fill="white">${n}</text></svg>`;

/** Leaflet map with numbered terracotta pins. Uses free OSM/CARTO tiles so it works without any key. */
export function GuideMap({ places, height = 360, onSelect, className }: { places: MapPlace[]; height?: number | string; onSelect?: (id: string) => void; className?: string }) {
  const el = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const map = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true });
      mapRef.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const withCoords = places.filter((p) => typeof p.lat === "number" && typeof p.lng === "number");
      const bounds: [number, number][] = [];
      withCoords.forEach((p, i) => {
        const fill = ["Nature", "Sports & Wellness"].includes(p.category) ? "oklch(62% 0.13 150)" : "oklch(62% 0.13 45)";
        const icon = L.divIcon({ className: "mg-pin", html: PIN_SVG(fill, i + 1), iconSize: [34, 42], iconAnchor: [17, 42], popupAnchor: [0, -38] });
        const m = L.marker([p.lat!, p.lng!], { icon }).addTo(map);
        m.bindPopup(`<strong style="font-weight:600">${escapeHtml(p.name)}</strong>${p.note ? `<div style="margin-top:4px;font-style:italic;color:oklch(48% 0.02 60)">${escapeHtml(p.note.slice(0, 120))}${p.note.length > 120 ? "…" : ""}</div>` : ""}`);
        if (onSelect) m.on("click", () => onSelect(p.id));
        bounds.push([p.lat!, p.lng!]);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
      else if (bounds.length === 1) map.setView(bounds[0], 14);
      else map.setView([20, 0], 2);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(places.map((p) => [p.id, p.lat, p.lng, p.name]))]);

  return <div ref={el} style={{ height }} className={cx("isolate z-0", className ?? "w-full rounded-3xl overflow-hidden border border-line")} />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
