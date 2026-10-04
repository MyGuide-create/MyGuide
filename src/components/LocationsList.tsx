"use client";

import { useState } from "react";
import { mapsUrl } from "@/lib/places/pins";
import { LocateIcon, PinIcon } from "./Icons";
import { Spinner } from "./ui";

export interface LocationItem {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  googlePlaceId: string | null;
  main?: boolean;
}

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fmt = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d < 10 ? d.toFixed(1) : Math.round(d)} km`);

/** Every branch of a place, each with its own directions; "Nearest to me" sorts by distance. */
export function LocationsList({ items, track }: { items: LocationItem[]; track?: Record<string, string> }) {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "denied">("idle");
  const locate = () => {
    if (!("geolocation" in navigator)) return setState("denied");
    setState("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); setState("idle"); },
      () => setState("denied"),
      { timeout: 10000 },
    );
  };
  const rows = items.map((it) => ({ it, d: me ? km(me, it) : null }));
  if (me) rows.sort((a, b) => (a.d ?? 0) - (b.d ?? 0));

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted">{items.length} locations</p>
        {!me && (
          <button type="button" onClick={locate} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-terracotta-deep">
            {state === "busy" ? <Spinner /> : <LocateIcon size={14} />} Nearest to me
          </button>
        )}
      </div>
      {state === "denied" && <p className="mb-2 text-[11.5px] text-ink-muted">Couldn&apos;t get your location.</p>}
      <ul className="flex flex-col divide-y divide-line/70">
        {rows.map(({ it, d }, i) => (
          <li key={it.id} className="py-2.5 flex items-center gap-3">
            <PinIcon size={16} className="text-terracotta shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium truncate">{it.address || it.name}</div>
              <div className="text-[11.5px] text-ink-faint">
                {d != null ? `${fmt(d)} away${i === 0 ? " · nearest" : ""}` : it.main ? "Main location" : it.name}
              </div>
            </div>
            <a
              href={mapsUrl({ name: it.name, address: it.address, lat: it.lat, lng: it.lng, googlePlaceId: it.googlePlaceId })}
              target="_blank"
              rel="noreferrer"
              {...track}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium hover:text-terracotta"
            >
              Directions
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
