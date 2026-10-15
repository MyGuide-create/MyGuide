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
  /** Local hour on the camera's clock (0-23), when the photo says. */
  h?: number;
  /** How far off the phone said its GPS could be (metres), when the photo says. */
  acc?: number;
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
  /** Photos per local hour of day (24 numbers), to tell breakfast from dinner from a night out. */
  hours?: number[];
  /** Longest single visit, in minutes (first to last photo on one go). Under ~10 is usually walking past. */
  dwell?: number;
  /** How spread out the photos are (median metres from the centre). */
  spread?: number;
  /** Typical GPS error the phone reported for these photos (metres), when known. */
  acc?: number;
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

/** Local hour of a photo: the camera's own clock when known, else a rough guess from the longitude. */
function hourOf(p: PhotoPoint): number {
  if (typeof p.h === "number" && p.h >= 0 && p.h < 24) return Math.floor(p.h);
  return new Date((p.t + Math.round(p.lng / 15) * 3600) * 1000).getUTCHours();
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Longest run of photos with no gap over 3 hours, in minutes. */
function longestVisit(times: number[]): number {
  const t = [...times].sort((a, b) => a - b);
  let best = 0;
  let start = t[0] ?? 0;
  for (let k = 1; k < t.length; k++) {
    if (t[k] - t[k - 1] > 3 * 3600) start = t[k];
    best = Math.max(best, t[k] - start);
  }
  return Math.round(best / 60);
}

/** Groups photos into spots, busiest first. Spots that look like home/work are counted separately. */
export function groupPhotos(points: PhotoPoint[]): { spots: PhotoSpot[]; homeLike: number } {
  type Acc = { lat: number; lng: number; n: number; days: Set<string>; first: number; last: number; items: number[]; pts: PhotoPoint[] };
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
      best.pts.push(p);
    } else {
      const c: Acc = { lat: p.lat, lng: p.lng, n: 1, days: new Set([dayOf(p)]), first: p.t, last: p.t, items: p.i != null ? [p.i] : [], pts: [p] };
      all.push(c);
      const k = `${ci},${cj}`;
      grid.set(k, [...(grid.get(k) ?? []), c]);
    }
  }
  const spots = all
    .filter((c) => c.days.size <= HOME_DAYS)
    .map((c) => {
      // The middle photo position (a stray reading can't drag it the way an average would).
      const lat = median(c.pts.map((p) => p.lat));
      const lng = median(c.pts.map((p) => p.lng));
      const hours = Array.from({ length: 24 }, () => 0);
      for (const p of c.pts) hours[hourOf(p)]++;
      const accs = c.pts.map((p) => p.acc).filter((a): a is number => typeof a === "number" && a > 0 && a < 5000);
      return {
        lat,
        lng,
        photos: c.n,
        days: c.days.size,
        first: c.first,
        last: c.last,
        items: c.items,
        hours,
        dwell: longestVisit(c.pts.map((p) => p.t)),
        spread: Math.round(median(c.pts.map((p) => distanceM({ lat, lng }, p)))),
        acc: accs.length ? Math.round(median(accs)) : undefined,
      };
    })
    .sort((a, b) => b.days - a.days || b.photos - a.photos);
  return { spots, homeLike: all.length - spots.length };
}
