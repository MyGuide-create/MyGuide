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
