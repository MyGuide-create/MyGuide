"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaceSuggestion } from "@/lib/places/types";
import { PinIcon, PlusIcon } from "./Icons";
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
}: {
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

  useEffect(() => {
    if (q.trim().length < 2) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}${cityHint ? `&city=${encodeURIComponent(cityHint)}` : ""}${near ? `&lat=${near.lat}&lng=${near.lng}` : ""}`, { signal: ctrl.signal });
        const data = (await res.json()) as { suggestions: PlaceSuggestion[] };
        setItems(data.suggestions);
        setOpen(true);
      } catch { /* aborted */ } finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, cityHint, near?.lat, near?.lng]);

  const pick = async (s: PlaceSuggestion | null) => {
    const name = s?.mainText ?? q.trim();
    if (!name) return;
    setOpen(false);
    setQ("");
    setItems([]);
    await onPick({ providerId: s?.providerId, name });
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setItems([]); }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void pick(items[0] ?? null); } }}
          placeholder={placeholder}
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
          {q.trim().length >= 2 && !items.some((s) => s.mainText.toLowerCase() === q.trim().toLowerCase()) && (
            <li>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)} className="w-full text-left px-4 py-2.5 hover:bg-cream-deep/50 flex items-center gap-2.5 text-[13px] text-ink-muted border-t border-line/70">
                <PlusIcon size={15} /> Add “{q.trim()}” as named
              </button>
            </li>
          )}
          {onDropPin && q.trim().length >= 2 && (
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
