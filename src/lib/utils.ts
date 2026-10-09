import { customAlphabet } from "nanoid";

export const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 14);
export const newToken = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 24);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "guide";
}

export function timeAgo(date: Date | number | null | undefined): string {
  if (!date) return "";
  const t = typeof date === "number" ? date : date.getTime();
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Stable small integer hash for picking deterministic colours. */
export function hashInt(s: string, mod: number): number {
  let h = 5381;
  for (const c of s) h = (h * 33) ^ c.charCodeAt(0);
  return Math.abs(h) % mod;
}

export function formatDuration(sec: number | null | undefined): string {
  if (!sec || !isFinite(sec)) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

/** "12–18 Oct 2026", "12 Oct – 3 Nov 2026", or "" when no dates. */
export function formatTripDates(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const fmt = (x: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(x);
  if (start && !end) return `From ${fmt(d(start), { day: "numeric", month: "short", year: "numeric" })}`;
  if (!start && end) return `Until ${fmt(d(end), { day: "numeric", month: "short", year: "numeric" })}`;
  const a = d(start!);
  const b = d(end!);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** "Omar", "Omar and Lina", "Omar, Lina and 2 others". */
export function namesSentence(names: string[], max = 2): string {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const rest = names.length - max;
  return `${names.slice(0, max).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/** Map over items with at most `limit` calls in flight; results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Font size for a guide title so the whole title shows (it wraps, never cut off):
 * short titles keep the full size, longer ones step down.
 */
export function titleSize(title: string, base: number): string {
  const n = title.trim().length;
  const f = n <= 24 ? 1 : n <= 38 ? 0.86 : n <= 56 ? 0.74 : n <= 80 ? 0.64 : 0.56;
  return `${Math.round(base * f * 2) / 2}px`;
}

/** "Dubai, UAE" — the city label with the country added when it's the guide's own single city. */
export function cityLine(label: string | null | undefined, guide: { city?: string | null; country?: string | null }): string {
  if (label) return label === guide.city && guide.country ? `${label}, ${guide.country}` : label;
  return [guide.city, guide.country].filter(Boolean).join(", ");
}
