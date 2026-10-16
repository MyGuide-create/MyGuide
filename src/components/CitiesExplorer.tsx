"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";
import { ChevronLeft, XIcon } from "./Icons";
import { Avatar, cx } from "./ui";

export interface MapCity {
  city: string;
  href: string;
  lat: number;
  lng: number;
  spots: number;
  /** You have places here. */
  mine: boolean;
  /** People you follow with spots here. */
  friends: PublicUser[];
  /** Not yours or your friends': everyone else's on MyGuide. */
  more?: boolean;
}

type Box = { x: number; y: number; w: number; h: number };
type Cluster = { key: string; x: number; y: number; members: MapCity[] };

const MAP_H = 230;
/** Dots closer than this (px) merge into a group. */
const MERGE_PX = 50;
/** Closest zoom: about 5 degrees of longitude across the map. */
const MIN_W = 5;
/** Map units: x = lng + 180, y = 76 − lat (the dots file uses the same). */
const ux = (c: { lng: number }) => c.lng + 180;
const uy = (c: { lat: number }) => 76 - c.lat;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const STORE = "mg_cities_view";

/**
 * Explore's cities (16 Oct 2026): a world map with a dot per city (solid = yours, ringed =
 * friends', small = elsewhere on MyGuide) and the old two rows of tiles as the second view.
 * Nearby dots group into a count; tap a group to zoom, a dot for a preview card, Open for the city.
 */
export function CitiesExplorer({ cities, tiles }: { cities: MapCity[]; tiles: ReactNode }) {
  // Tiles first (16 Oct 2026: they look better); the map is there for anyone who prefers it.
  const [view, setView] = useState<"map" | "tiles">("tiles");
  useEffect(() => {
    try {
      if (localStorage.getItem(STORE) === "map") queueMicrotask(() => setView("map"));
    } catch {
      /* storage blocked: map */
    }
  }, []);
  const pick = (v: "map" | "tiles") => {
    setView(v);
    try {
      localStorage.setItem(STORE, v);
    } catch {
      /* fine */
    }
  };
  return (
    <section className="pt-4 flex flex-col gap-2">
      <div className="px-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px]">Cities</h2>
        <div role="tablist" aria-label="Cities view" className="flex rounded-full bg-cream-deep/70 p-[3px]">
          {(["map", "tiles"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => pick(v)}
              className={cx("px-3.5 py-1.5 rounded-full text-[13px]", view === v ? "bg-paper font-semibold shadow-sm" : "text-ink-muted")}
            >
              {v === "map" ? "Map" : "Tiles"}
            </button>
          ))}
        </div>
      </div>
      {view === "map" ? (
        <div className="px-4">
          <WorldMap cities={cities} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">{tiles}</div>
      )}
    </section>
  );
}

function WorldMap({ cities }: { cities: MapCity[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  const [vb, setVb] = useState<Box>({ x: 35, y: -18, w: 300, h: (300 * MAP_H) / 358 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // A new width resets the view to the whole world, at that width's proportions.
    const fit = () => {
      const w = el.clientWidth || 358;
      setWidth(w);
      setVb({ x: 35, y: -18, w: 300, h: (300 * MAP_H) / w });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);
  const world = useMemo<Box>(() => ({ x: 35, y: -18, w: 300, h: (300 * MAP_H) / width }), [width]);
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const [settled, setSettled] = useState(true);
  const [sel, setSel] = useState<MapCity | null>(null);
  /** A group that cannot be pulled apart on the map: shown as a list under it. */
  const [group, setGroup] = useState<MapCity[] | null>(null);
  const anim = useRef<number | null>(null);

  const proj = useCallback((c: { x: number; y: number }, b: Box) => [((c.x - b.x) / b.w) * width, ((c.y - b.y) / b.h) * MAP_H] as const, [width]);

  // Group dots closer than ~50 px into one bubble, for the box we're settled on.
  const clusters = useMemo<Cluster[]>(() => {
    let groups = cities.map((c) => ({ m: [c], x: ux(c), y: uy(c) }));
    for (;;) {
      let best: [number, number] | null = null;
      let bd = MERGE_PX;
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) {
          const [ax, ay] = proj(groups[i], vb);
          const [bx, by] = proj(groups[j], vb);
          const d = Math.hypot(ax - bx, ay - by);
          if (d < bd) {
            bd = d;
            best = [i, j];
          }
        }
      if (!best) break;
      const [a, b] = best;
      const m = [...groups[a].m, ...groups[b].m];
      const merged = { m, x: m.reduce((s, c) => s + ux(c), 0) / m.length, y: m.reduce((s, c) => s + uy(c), 0) / m.length };
      groups = groups.filter((_, k) => k !== a && k !== b).concat(merged);
    }
    return groups.filter((g) => g.m.length > 1).map((g) => ({ key: g.m.map((c) => c.city).sort().join("|"), x: g.x, y: g.y, members: g.m }));
    // Re-group only once the map stops moving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, settled, width]);
  const clustered = useMemo(() => new Set(clusters.flatMap((k) => k.members.map((c) => c.city))), [clusters]);

  const tween = (to: Box) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = { ...vbRef.current };
    const t0 = performance.now();
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 700;
    setSettled(false);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const k = ease(t);
      setVb({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k });
      if (t < 1) anim.current = requestAnimationFrame(step);
      else setSettled(true);
    };
    anim.current = requestAnimationFrame(step);
  };
  /**
   * Tap a group: zoom in just enough to show its cities (no fixed floor, so nested groups keep
   * getting closer). When they can't be pulled apart (same spot, or already zoomed right in),
   * list them instead of zooming to the same view again (16 Oct 2026).
   */
  const zoomTo = (members: MapCity[]) => {
    setSel(null);
    setGroup(null);
    const xs = members.map(ux);
    const ys = members.map(uy);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Closest pair, in map units: the view must be at most this wide for them to sit apart.
    let minD = Infinity;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) minD = Math.min(minD, Math.hypot(xs[i] - xs[j], ys[i] - ys[j]));
    const needW = (minD * width) / (MERGE_PX * 1.15);
    const fitW = Math.max(x1 - x0, ((y1 - y0) * width) / MAP_H) * 1.6;
    const w = Math.max(fitW, MIN_W);
    const cur = vbRef.current;
    if (needW < MIN_W || w > cur.w * 0.85) {
      setGroup(members);
      return;
    }
    const h = (w * MAP_H) / width;
    tween({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h });
  };
  const zoomed = vb.w < world.w * 0.9;

  // Drag to pan, pinch to zoom (two fingers), and trackpad / mouse-wheel zoom (16 Oct 2026).
  const drag = useRef<{ x: number; y: number; vb: Box; moved: boolean } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; vb: Box; ax: number; ay: number } | null>(null);
  /** A pinch just ended: the lifting finger isn't a tap. */
  const pinched = useRef(false);
  const clampW = (w: number) => Math.min(world.w, Math.max(MIN_W, w));
  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  /** Zoom `base` by `scale`, keeping map point (ax, ay) under screen point (mx, my). */
  const zoomAt = (base: Box, scale: number, ax: number, ay: number, mx: number, my: number): Box => {
    const w = clampW(base.w * scale);
    const h = (w * MAP_H) / width;
    return { x: ax - (mx / width) * w, y: ay - (my / MAP_H) * h, w, h };
  };
  const startPinch = () => {
    const [p1, p2] = [...pts.current.values()];
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    const v = { ...vbRef.current };
    if (anim.current) cancelAnimationFrame(anim.current);
    pinch.current = { d0: Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y)), vb: v, ax: v.x + (mx / width) * v.w, ay: v.y + (my / MAP_H) * v.h };
    drag.current = null;
    setSettled(false);
  };
  const onDown = (e: React.PointerEvent) => {
    pts.current.set(e.pointerId, local(e));
    if (pts.current.size === 2) {
      // Keep both fingers' events on the map while pinching (taps on dots still work with one finger).
      for (const id of pts.current.keys()) {
        try {
          boxRef.current?.setPointerCapture(id);
        } catch {
          /* pointer already gone */
        }
      }
      startPinch();
      return;
    }
    if ((e.target as HTMLElement).closest("button,a")) return;
    drag.current = { x: e.clientX, y: e.clientY, vb: { ...vbRef.current }, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, local(e));
    const pc = pinch.current;
    if (pc && pts.current.size >= 2) {
      const [p1, p2] = [...pts.current.values()];
      const d = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
      setVb(zoomAt(pc.vb, pc.d0 / d, pc.ax, pc.ay, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      if (!d.moved) setSettled(false);
      d.moved = true;
    }
    if (d.moved) setVb({ ...d.vb, x: d.vb.x - (dx / width) * d.vb.w, y: d.vb.y - (dy / MAP_H) * d.vb.h });
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pinch.current) {
      if (pts.current.size < 2) {
        pinch.current = null;
        pinched.current = true;
        setSettled(true);
      }
      return;
    }
    if (pinched.current) {
      // The last finger of a pinch lifting: not a tap.
      if (pts.current.size === 0) pinched.current = false;
      drag.current = null;
      return;
    }
    if (drag.current?.moved) setSettled(true);
    else if (drag.current) {
      setSel(null);
      setGroup(null);
    }
    drag.current = null;
  };
  // Trackpad pinch and mouse wheel (desktop). Non-passive so the page doesn't scroll instead.
  const wheelEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (anim.current) cancelAnimationFrame(anim.current);
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const v = vbRef.current;
      // ctrlKey = a trackpad pinch: its deltas are small, so it gets a stronger factor.
      const scale = Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setSettled(false);
      setVb(zoomAt(v, scale, v.x + (mx / width) * v.w, v.y + (my / MAP_H) * v.h, mx, my));
      if (wheelEnd.current) clearTimeout(wheelEnd.current);
      wheelEnd.current = setTimeout(() => setSettled(true), 180);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // zoomAt only depends on width/world, both in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, world]);

  const dotR = 0.9 * Math.pow(vb.w / 300, 0.55);
  // The dot grid is coarse (about 2° apart): fade it when zoomed right in, where it would only show a few big blobs.
  const landOpacity = Math.max(0.12, Math.min(1, (vb.w - 6) / 40));
  return (
    <div className="flex flex-col gap-2.5">
      <div
        ref={boxRef}
        className="relative rounded-[20px] overflow-hidden border border-line bg-[#f7efe5] touch-none select-none"
        style={{ height: MAP_H }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onPointerCancel={onUp}
      >
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden style={{ ["--r" as string]: `${dotR}px`, opacity: landOpacity }}>
          <Land />
        </svg>
        {cities.map((c) => {
          const [x, y] = proj({ x: ux(c), y: uy(c) }, vb);
          const hidden = settled && clustered.has(c.city);
          const out = x < -24 || x > width + 24 || y < -24 || y > MAP_H + 24;
          if (out) return null;
          const size = c.more ? 9 : 12 + Math.min(10, Math.round(c.spots * 0.6));
          const on = sel?.city === c.city;
          return (
            <span key={c.city}>
              <button
                type="button"
                aria-label={`${c.city}, ${c.spots} spots`}
                onClick={(e) => {
                  e.stopPropagation();
                  setGroup(null);
                  setSel(c);
                }}
                className={cx(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-300",
                  c.mine ? "bg-terracotta border-[2.5px] border-white" : c.more ? "bg-ink-faint/70 border-2 border-white" : "bg-white border-[3px] border-terracotta",
                  hidden ? "opacity-0 pointer-events-none" : "opacity-100",
                  on && "scale-[1.45] ring-[6px] ring-terracotta/20",
                )}
                style={{ left: x, top: y, width: size, height: size, boxShadow: "0 1px 3px rgb(60 30 10 / 0.3)" }}
              />
              {(zoomed || on) && !hidden && (
                <span className="absolute -translate-x-1/2 pointer-events-none text-[10.5px] font-semibold whitespace-nowrap [text-shadow:0_0_3px_#f7efe5,0_0_3px_#f7efe5,0_0_3px_#f7efe5]" style={{ left: x, top: y + size / 2 + 3 }}>
                  {c.city}
                </span>
              )}
            </span>
          );
        })}
        {settled &&
          clusters.map((k) => {
            const [x, y] = proj(k, vb);
            return (
              <button
                key={k.key}
                type="button"
                aria-label={`${k.members.length} cities: ${k.members.map((c) => c.city).join(", ")}. Zoom in`}
                onClick={(e) => {
                  e.stopPropagation();
                  zoomTo(k.members);
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 min-w-[34px] h-[34px] px-2.5 rounded-full bg-ink text-cream border-[2.5px] border-white text-[13px] font-semibold flex items-center justify-center shadow-md"
                style={{ left: x, top: y }}
              >
                {k.members.length}
              </button>
            );
          })}
        {zoomed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSel(null);
              setGroup(null);
              tween(world);
            }}
            className="absolute left-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full border border-line bg-paper pl-1.5 pr-3 py-1 text-[12px] font-medium"
          >
            <ChevronLeft size={15} /> World
          </button>
        )}
        {cities.some((c) => !c.more) && (
        <span className="absolute right-2.5 bottom-2 flex gap-2.5 rounded-full bg-paper/85 px-2.5 py-1 text-[10.5px] text-ink-muted">
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-terracotta" /> Yours</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-full bg-white border-2 border-terracotta" /> Friends&apos;</span>
        </span>
        )}
      </div>
      {group && !sel && (
        <div className="rounded-[20px] border border-line bg-paper p-3 flex flex-col gap-1 fade-up" role="region" aria-label="Cities here">
          <div className="flex items-center justify-between px-1">
            <span className="text-[15px] font-semibold">{group.length} cities here</span>
            <button type="button" aria-label="Close" onClick={() => setGroup(null)} className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-ink-muted">
              <XIcon size={16} />
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {[...group].sort((a, b) => b.spots - a.spots).map((c) => (
              <li key={c.city}>
                <Link href={c.href} className="flex items-center gap-3 px-1 py-2.5">
                  <span className={cx("w-3 h-3 rounded-full shrink-0", c.mine ? "bg-terracotta" : c.more ? "bg-ink-faint/70" : "bg-white border-2 border-terracotta")} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14.5px] font-semibold truncate">{c.city}</span>
                    <span className="block text-[12.5px] text-ink-muted truncate">
                      {[c.friends.length ? `${c.friends.length} friend${c.friends.length === 1 ? "" : "s"}` : "", c.mine ? "you" : "", `${c.spots} spot${c.spots === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span aria-hidden className="text-ink-faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sel && (
        <div className="rounded-[20px] border border-line bg-paper p-3 flex flex-col gap-3 fade-up" role="region" aria-label={`${sel.city} preview`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[18px] font-semibold leading-tight">{sel.city}</div>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-ink-muted">
                {sel.friends.length > 0 && (
                  <span className="flex">
                    {sel.friends.slice(0, 3).map((u, i) => (
                      <Avatar key={u.id} user={u} size={22} className={cx("ring-2 ring-paper", i > 0 && "-ml-1.5")} />
                    ))}
                  </span>
                )}
                <span>
                  {[
                    sel.friends.length ? `${sel.friends.length} friend${sel.friends.length === 1 ? "" : "s"}` : "",
                    sel.mine ? "you" : "",
                    `${sel.spots} spot${sel.spots === 1 ? "" : "s"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            </div>
            <button type="button" aria-label="Close preview" onClick={() => setSel(null)} className="w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-ink-muted">
              <XIcon size={16} />
            </button>
          </div>
          <Link href={sel.href} className="h-11 rounded-full bg-terracotta text-white text-[14.5px] font-semibold flex items-center justify-center">
            Open {sel.city}
          </Link>
        </div>
      )}
    </div>
  );
}

/** The land as dots, loaded once (public/world-dots.json, ~36 KB). */
const Land = memo(function Land() {
  const [dots, setDots] = useState<[number, number][] | null>(cache);
  useEffect(() => {
    if (cache) return;
    let live = true;
    fetch("/world-dots.json")
      .then((res) => res.json())
      .then((d: [number, number][]) => {
        cache = d;
        if (live) setDots(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!dots) return null;
  return (
    // Dots keep their size while zooming via the CSS `r` (set on the <svg>); the attribute is the fallback.
    <g fill="#cdb497" className="[&>circle]:[r:var(--r)]">
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} />
      ))}
    </g>
  );
});
let cache: [number, number][] | null = null;
