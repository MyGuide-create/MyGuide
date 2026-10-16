"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GuideMap } from "./GuideMap";
import { CheckIcon, ChevronDown, LocateIcon } from "./Icons";
import { PlaceTile } from "./PlaceTile";
import { RecommendToggle } from "./RecommendToggle";
import { cx } from "./ui";

export interface MySpot {
  id: string;
  name: string;
  category: string;
  photoUrl: string | null;
  photoMediaId: string | null;
  lat: number | null;
  lng: number | null;
  href: string;
  area: string;
  /** Your description, or "" */
  words: string;
  /** "Added 3 days ago" */
  added: string;
  guides: string[];
  /** Anyone can see it (recommended on its own, or in a public guide). */
  recommended: boolean;
  /** Recommended on its own (switchable here). */
  shared: boolean;
  /** In your My spots list (so Recommend can be switched here). */
  inStash: boolean;
}

type Here = { lat: number; lng: number };

/** The city you last opened in My spots, so it opens there next time when we can't tell where you are. */
export const LAST_CITY_COOKIE = "mg_last_city";
/** Set when you turn Near me off, so it stays off. */
const NEAR_OFF = "mg_near_off";

/** Metres between two points. */
function metres(a: Here, b: Here): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distLabel = (m: number) => (m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : m < 9_500 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`);

/**
 * One city in My spots, used like your own guide (16 Oct 2026): category chips and "Near me" filter
 * the map and the list together. All → grouped by category; a chip → that category; Near me →
 * nearest first with distances.
 */
export function MySpotsCity({
  city,
  spots,
  categories,
  autoNear = false,
  remember = false,
}: {
  city: string;
  spots: MySpot[];
  categories: string[];
  /** You're in this city: start nearest first (unless you turned it off), when location is already allowed. */
  autoNear?: boolean;
  /** Remember this as the city to open next time. */
  remember?: boolean;
}) {
  const [cat, setCat] = useState<string | null>(null);
  const [here, setHere] = useState<Here | null>(null);
  const [near, setNear] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const locate = () => {
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNear(true);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocError("Couldn't get your location. Check that location is allowed for MyGuide.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  const toggleNear = () => {
    const keep = (off: boolean) => {
      try {
        if (off) localStorage.setItem(NEAR_OFF, "1");
        else localStorage.removeItem(NEAR_OFF);
      } catch {}
    };
    if (near) {
      keep(true);
      return setNear(false);
    }
    keep(false);
    if (here) return setNear(true);
    if (!("geolocation" in navigator)) return setLocError("Your browser can't share your location.");
    locate();
  };

  useEffect(() => {
    if (remember && city) document.cookie = `${LAST_CITY_COOKIE}=${encodeURIComponent(city)}; path=/; max-age=31536000; samesite=lax`;
  }, [remember, city]);

  // In the city: nearest first, without a prompt — only when location is already allowed.
  useEffect(() => {
    if (!autoNear || !("geolocation" in navigator) || !navigator.permissions) return;
    try {
      if (localStorage.getItem(NEAR_OFF) === "1") return;
    } catch {}
    let live = true;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((st) => {
        if (live && st.state === "granted") locate();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [autoNear]);

  const shown = useMemo(() => {
    const list = cat ? spots.filter((s) => s.category === cat) : spots;
    if (!near || !here) return list.map((s) => ({ s, d: null as number | null }));
    return list
      .map((s) => ({ s, d: s.lat != null && s.lng != null ? metres(here, { lat: s.lat, lng: s.lng }) : null }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity));
  }, [spots, cat, near, here]);

  const privateIds = spots.filter((s) => s.inStash && !s.recommended).map((s) => s.id);
  const pinned = shown.filter(({ s }) => s.lat != null && s.lng != null);
  const grouped = !cat && !near;
  const count = (c: string) => spots.filter((s) => s.category === c).length;

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 bg-cream/95 backdrop-blur border-b border-line/70 py-2.5">
        <div role="group" aria-label="Filter spots" className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4">
          <button
            type="button"
            onClick={toggleNear}
            aria-pressed={near}
            className={cx(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-[13.5px] whitespace-nowrap border",
              near ? "bg-ink text-cream border-ink font-semibold" : "bg-paper border-line text-ink font-medium",
            )}
          >
            <LocateIcon size={15} /> {locating ? "Finding you…" : "Near me"}
          </button>
          {categories.length > 1 && <span aria-hidden className="shrink-0 w-px h-5 bg-line" />}
          {categories.length > 1 &&
            [null, ...categories].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                onClick={() => setCat(c)}
                aria-pressed={cat === c}
                className={cx(
                  "shrink-0 rounded-full px-3.5 py-[7px] text-[13.5px] whitespace-nowrap border",
                  cat === c ? "bg-ink text-cream border-ink font-semibold" : "bg-paper border-line text-ink font-medium",
                )}
              >
                {c ?? "All"}
                {c && <span className={cx("ml-1.5 text-[12px]", cat === c ? "text-cream/70" : "text-ink-faint")}>{count(c)}</span>}
              </button>
            ))}
        </div>
        {locError && <p className="px-4 pt-2 text-[12.5px] text-danger">{locError}</p>}
      </div>

      {pinned.length > 0 && (
        <GuideMap
          height={260}
          locate
          places={pinned.slice(0, 200).map(({ s, d }) => ({
            id: s.id,
            name: s.name,
            lat: s.lat,
            lng: s.lng,
            category: s.category,
            href: s.href,
            photoUrl: s.photoUrl,
            photoMediaId: s.photoMediaId,
            subtitle: [s.category, d != null ? distLabel(d) : s.area].filter(Boolean).join(" · "),
          }))}
        />
      )}

      {city && grouped && privateIds.length > 1 && (
        <div className="-mb-3 flex justify-end px-1">
          <RecommendToggle variant="all" placeIds={privateIds} shared={false} city={city} />
        </div>
      )}

      {grouped ? (
        categories.map((c) => {
          const inCat = spots.filter((s) => s.category === c);
          return (
            <details key={c || "_none"} open className="group/cat">
              <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none px-1 flex items-center gap-2 min-h-[32px] group-open/cat:mb-2">
                <h2 className="flex items-baseline gap-2 min-w-0">
                  <span className="font-display text-[19px] truncate">{c || "Other"}</span>
                  <span className="text-[12px] text-ink-faint">{inCat.length}</span>
                </h2>
                <ChevronDown size={17} aria-hidden className="shrink-0 text-ink-muted transition-transform -rotate-90 group-open/cat:rotate-0" />
              </summary>
              <ul className="flex flex-col gap-2">
                {inCat.map((s) => (
                  <Row key={s.id} s={s} city={city} d={null} showCat={false} />
                ))}
              </ul>
            </details>
          );
        })
      ) : (
        <section className="flex flex-col gap-2">
          <p className="px-1 text-[12.5px] text-ink-muted">
            {shown.length} {cat ?? "spot"}
            {shown.length === 1 || cat ? "" : "s"}
            {near ? " · nearest first" : ""}
          </p>
          <ul className="flex flex-col gap-2">
            {shown.map(({ s, d }) => (
              <Row key={s.id} s={s} city={city} d={d} showCat={!cat} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Row({ s, city, d, showCat }: { s: MySpot; city: string; d: number | null; showCat: boolean }) {
  const meta = [showCat ? s.category : "", s.area].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-line/70 bg-paper pr-2.5 hover:border-terracotta-soft">
      <Link href={s.href} className="flex-1 min-w-0 flex gap-3 items-center p-2.5">
        <PlaceTile place={s} size={56} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[14.5px] truncate">{s.name}</span>
          {(meta || d != null) && (
            <span className="block text-[12px] text-ink-muted truncate">
              {d != null && <b className="font-semibold text-ink">{distLabel(d)}</b>}
              {d != null && meta ? " · " : ""}
              {meta}
            </span>
          )}
          {s.words ? <span className="block text-[12px] text-ink italic truncate">“{s.words}”</span> : <span className="block text-[11.5px] text-ink-faint">{s.added}</span>}
          {s.guides.length > 0 && <span className="block text-[11.5px] text-sage truncate">In {s.guides.join(", ")}</span>}
        </span>
      </Link>
      {s.recommended && !s.shared ? (
        // Public through a published guide: recommended already, nothing to switch here.
        <span title="In a public guide" className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold border bg-sage-tint border-sage-soft text-ink">
          <CheckIcon size={12} /> Recommended
        </span>
      ) : (
        s.inStash && <RecommendToggle variant="pill" placeIds={[s.id]} shared={s.shared} city={city} />
      )}
    </li>
  );
}
