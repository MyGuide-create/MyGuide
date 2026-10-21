"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/lib/places/types";
import type { TypedCity } from "@/lib/places/regionHint";
import { PinIcon, PlusIcon, XIcon } from "./Icons";
import { Input, Spinner } from "./ui";

/** Google Maps autocomplete (or mock) for adding places by typing. */
export function PlaceSearch({
  cityHint,
  near,
  onPick,
  placeholder = "Add a place… e.g. Tsuta ramen",
  autoFocus,
  busy,
  onDropPin,
  placesOnly,
  initialInCity,
}: {
  /**
   * Adding a spot (21 Oct 2026): no cities or regions in the results. Typing a city offers "Looking for a place in
   * Cincinnati?", which sets an "in Cincinnati ×" chip that keeps the search around that city (~30 km).
   */
  placesOnly?: boolean;
  /** Start with the "in <city>" chip set (after a city was picked as a spot). */
  initialInCity?: TypedCity | null;
  cityHint?: string;
  /** Centre of the guide's city, so suggestions favour places there (cities not in our built-in list, like Tashkent). */
  near?: { lat: number; lng: number } | null;
  onPick: (pick: { providerId?: string; name: string }) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  busy?: boolean;
  /** Offer "Drop a pin" for spots with no Google listing; gets whatever was typed. */
  onDropPin?: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  /** The typed text is a city (from the server): offer to search inside it. */
  const [typedCity, setTypedCity] = useState<{ q: string; city: TypedCity } | null>(null);
  /** "in Cincinnati ×": search biased to that city until cleared. */
  const [inCity, setInCity] = useState<TypedCity | null>(initialInCity ?? null);
  const biasCity = inCity?.name ?? cityHint;
  const biasLat = inCity ? inCity.lat : near?.lat;
  const biasLng = inCity ? inCity.lng : near?.lng;

  useEffect(() => {
    if (q.trim().length < 2) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/places/autocomplete?q=${encodeURIComponent(q)}${biasCity ? `&city=${encodeURIComponent(biasCity)}` : ""}${biasLat != null && biasLng != null ? `&lat=${biasLat}&lng=${biasLng}` : ""}${placesOnly ? "&places=1" : ""}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as { suggestions: PlaceSuggestion[]; city?: TypedCity | null };
        setItems(data.suggestions);
        setTypedCity(placesOnly && data.city ? { q, city: data.city } : null);
        setOpen(true);
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, biasCity, biasLat, biasLng, placesOnly]);

  /** The hint only counts for the text it was given for (and not once you're already searching in that city). */
  const cityOffer = typedCity && typedCity.q === q && q.trim().length >= 2 && typedCity.city.name !== inCity?.name ? typedCity.city : null;
  const searchIn = (c: TypedCity) => {
    setInCity(c);
    setQ("");
    setItems([]);
    setTypedCity(null);
    setOpen(false);
    input.current?.focus();
  };

  const pick = async (s: PlaceSuggestion | null) => {
    const name = s?.mainText ?? q.trim();
    if (!name) return;
    setOpen(false);
    setQ("");
    setItems([]);
    setTypedCity(null);
    await onPick({ providerId: s?.providerId, name });
  };

  return (
    <div className="relative">
      {inCity && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full bg-terracotta-tint text-terracotta-deep text-[12.5px] font-semibold max-w-full">
            <PinIcon size={13} className="shrink-0" />
            <span className="truncate">in {inCity.name}</span>
            <button
              type="button"
              aria-label={`Search everywhere, not just ${inCity.name}`}
              onClick={() => { setInCity(null); input.current?.focus(); }}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-paper/60"
            >
              <XIcon size={11} />
            </button>
          </span>
        </div>
      )}
      <div className="relative">
        <Input
          ref={input}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setItems([]); }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void pick(items[0] ?? null); } }}
          placeholder={inCity ? `Search places in ${inCity.name}…` : placeholder}
          autoComplete="off"
          enterKeyHint="done"
          className="pr-11"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
          {loading || busy ? <Spinner /> : <PinIcon size={18} />}
        </div>
      </div>
      {open && (items.length > 0 || q.trim().length >= 2) && (
        <ul className="absolute z-20 left-0 right-0 mt-1.5 rounded-2xl border border-line bg-paper shadow-card overflow-hidden max-h-72 overflow-y-auto">
          {cityOffer && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => searchIn(cityOffer)}
                className="w-full text-left px-4 py-2.5 bg-terracotta-tint/60 hover:bg-terracotta-tint flex items-start gap-2.5 border-b border-line/70"
              >
                <PinIcon size={16} className="mt-0.5 text-terracotta shrink-0" />
                <span className="min-w-0 text-[13px] leading-snug">
                  <span className="block font-semibold text-terracotta-deep">Looking for a place in {cityOffer.name}?</span>
                  <span className="block text-[12px] text-ink-muted">Type its name</span>
                </span>
              </button>
            </li>
          )}
          {items.map((s) => (
            <li key={s.providerId}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} className="w-full text-left px-4 py-2.5 hover:bg-cream-deep/50 flex items-start gap-2.5">
                <PinIcon size={16} className="mt-0.5 text-terracotta shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium truncate">{s.mainText}</span>
                  <span className="block text-[11.5px] text-ink-muted truncate">{s.secondaryText}</span>
                </span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !cityOffer && !items.some((s) => s.mainText.toLowerCase() === q.trim().toLowerCase()) && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)} className="w-full text-left px-4 py-2.5 hover:bg-cream-deep/50 flex items-center gap-2.5 text-[13px] text-ink-muted border-t border-line/70">
                <PlusIcon size={15} /> Add “{q.trim()}” as named
              </button>
            </li>
          )}
          {onDropPin && q.trim().length >= 2 && !cityOffer && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { const name = q.trim(); setOpen(false); setQ(""); setItems([]); onDropPin(name); }}
                className="w-full text-left px-4 py-2.5 hover:bg-cream-deep/50 flex items-center gap-2.5 text-[13px] text-terracotta-deep font-medium border-t border-line/70"
              >
                <PinIcon size={15} /> Not on Google? Drop a pin for “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
