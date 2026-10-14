/**
 * Photo places (test, 14 Oct 2026): group photo locations into spots. Runs in the browser, so only
 * spot centres (never photos or every photo's location) are sent to MyGuide.
 */

export interface PhotoPoint {
  lat: number;
  lng: number;
  /** Seconds since 1970 (UTC). */
  t: number;
  /** Which picked photo it came from (stays on the phone, to show the photos of a spot). */
  i?: number;
}

export interface PhotoSpot {
  lat: number;
  lng: number;
  photos: number;
  /** Distinct days with photos here. */
  days: number;
  first: number;
  last: number;
  /** The photos (indexes into the picked files) taken here. Never sent to MyGuide. */
  items?: number[];
}

/** Photos within this distance of a spot's centre count as the same spot. */
export const SPOT_RADIUS_M = 70;
/** A spot with photos on more days than this is probably home, work or school. */
export const HOME_DAYS = 25;

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Rough local day from the longitude (good enough to count visits). */
function dayOf(p: PhotoPoint): string {
  return new Date((p.t + Math.round(p.lng / 15) * 3600) * 1000).toISOString().slice(0, 10);
}

/** Groups photos into spots, busiest first. Spots that look like home/work are counted separately. */
export function groupPhotos(points: PhotoPoint[]): { spots: PhotoSpot[]; homeLike: number } {
  type Acc = { lat: number; lng: number; n: number; days: Set<string>; first: number; last: number; items: number[] };
  const grid = new Map<string, Acc[]>();
  const all: Acc[] = [];
  const cellOf = (p: { lat: number; lng: number }) => [Math.floor(p.lat / 0.001), Math.floor(p.lng / 0.001)];
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    const [ci, cj] = cellOf(p);
    let best: Acc | null = null;
    let bd = Infinity;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const c of grid.get(`${ci + i},${cj + j}`) ?? []) {
          const d = distanceM(c, p);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
    if (best && bd <= SPOT_RADIUS_M) {
      best.n++;
      best.lat += (p.lat - best.lat) / best.n;
      best.lng += (p.lng - best.lng) / best.n;
      best.days.add(dayOf(p));
      best.first = Math.min(best.first, p.t);
      best.last = Math.max(best.last, p.t);
      if (p.i != null) best.items.push(p.i);
    } else {
      const c: Acc = { lat: p.lat, lng: p.lng, n: 1, days: new Set([dayOf(p)]), first: p.t, last: p.t, items: p.i != null ? [p.i] : [] };
      all.push(c);
      const k = `${ci},${cj}`;
      grid.set(k, [...(grid.get(k) ?? []), c]);
    }
  }
  const spots = all
    .filter((c) => c.days.size <= HOME_DAYS)
    .map((c) => ({ lat: c.lat, lng: c.lng, photos: c.n, days: c.days.size, first: c.first, last: c.last, items: c.items }))
    .sort((a, b) => b.days - a.days || b.photos - a.photos);
  return { spots, homeLike: all.length - spots.length };
}
