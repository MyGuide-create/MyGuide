"use client";

import { useEffect, useRef, useState } from "react";
import type { CityInfo, CitySuggestion } from "@/lib/places/types";
import { GlobeIcon, SearchIcon } from "./Icons";
import { Spinner, cx } from "./ui";

export type PickedCity = CityInfo & { label: string };

/**
 * Type a city or region and pick it from Google's suggestions: "Tashkent" → Tashkent, Uzbekistan;
 * "Paris" → Paris, France or Paris, Texas. Returns the name, country and centre in one go,
 * so nobody has to type the country again.
 */
export function CityPicker({
  initial = "",
  onPick,
  onFreeText,
  placeholder = "Where to? e.g. Tashkent",
  autoFocus,
  big,
  id,
}: {
  initial?: string;
  onPick: (city: PickedCity) => void | Promise<void>;
  /** Offer "Use “…” as typed" for places Google doesn't list (an island, a valley). */
  onFreeText?: (text: string) => void | Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  /** Large rounded box (home screen). */
  big?: boolean;
  id?: string;
}) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!touched || q.trim().length < 2) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places/cities?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const data = (await res.json()) as { suggestions: CitySuggestion[] };
        setItems(data.suggestions);
        setOpen(true);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, touched]);

  const choose = async (s: CitySuggestion) => {
    setOpen(false);
    setResolving(true);
    try {
      const res = await fetch(`/api/places/city?id=${encodeURIComponent(s.id)}`);
      const data = (await res.json()) as { city: CityInfo | null };
      const info = data.city ?? { city: s.mainText, country: s.secondaryText.split(",").pop()?.trim() ?? "", lat: NaN, lng: NaN };
      const label = [info.city, info.country].filter(Boolean).join(", ");
      setQ(label);
      setTouched(false);
      await onPick({ ...info, label });
    } finally {
      setResolving(false);
    }
  };

  const freeText = async () => {
    const text = q.trim();
    if (!text || !onFreeText) return;
    setOpen(false);
    setTouched(false);
    await onFreeText(text);
  };

  const showList = open && touched && q.trim().length >= 2;

  return (
    <div className="relative">
      <div className="relative">
        <span className={cx("absolute top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none", big ? "left-5" : "left-3.5")}>
          <SearchIcon size={big ? 20 : 17} />
        </span>
        <input
          id={id}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setTouched(true);
            if (e.target.value.trim().length < 2) setItems([]);
          }}
          onFocus={(e) => {
            if (items.length) setOpen(true);
            // A picked city shows "Tashkent, Uzbekistan": select it so typing replaces it.
            if (!touched && q) e.currentTarget.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (items[0]) void choose(items[0]);
            else void freeText();
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="go"
          className={cx(
            "w-full border bg-paper outline-none placeholder:text-ink-faint focus:border-terracotta-soft focus:ring-2 focus:ring-terracotta/10",
            big ? "h-[60px] rounded-full pl-13 pr-12 text-[18px] border-line shadow-[0_6px_20px_oklch(22%_0.02_60/0.08)]" : "h-12 rounded-xl pl-10 pr-10 text-[15px] border-line",
          )}
        />
        {(loading || resolving) && (
          <span className={cx("absolute top-1/2 -translate-y-1/2 text-ink-faint", big ? "right-5" : "right-3.5")}>
            <Spinner />
          </span>
        )}
      </div>
      {showList && (items.length > 0 || onFreeText) && (
        <ul className="absolute z-30 left-0 right-0 mt-1.5 rounded-2xl border border-line bg-paper shadow-card overflow-hidden max-h-80 overflow-y-auto">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className="w-full text-left px-4 py-3 hover:bg-cream-deep/50 flex items-center gap-3"
              >
                <GlobeIcon size={17} className="text-terracotta shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium truncate">{s.mainText}</span>
                  {s.secondaryText && <span className="block text-[12.5px] text-ink-muted truncate">{s.secondaryText}</span>}
                </span>
              </button>
            </li>
          ))}
          {!loading && items.length === 0 && !onFreeText && <li className="px-4 py-3 text-[13px] text-ink-muted">No matches yet — keep typing.</li>}
          {onFreeText && !items.some((s) => s.mainText.toLowerCase() === q.trim().toLowerCase()) && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={freeText}
                className="w-full text-left px-4 py-2.5 hover:bg-cream-deep/50 text-[13px] text-ink-muted border-t border-line/70"
              >
                Use “{q.trim()}” as typed
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
