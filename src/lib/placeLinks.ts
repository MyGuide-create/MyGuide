import { internationalPhone } from "./phone";

/**
 * Place contact/booking links. Shared by the editor (live validation) and the
 * server action (authoritative). Each normaliser returns:
 *   { ok: true, value }  — value is the cleaned form to store (null = cleared)
 *   { ok: false, error } — user-facing message
 */
export type Normalised = { ok: true; value: string | null } | { ok: false; error: string };

function asUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

export function normaliseWebsite(raw: string | null | undefined): Normalised {
  if (!raw?.trim()) return { ok: true, value: null };
  const u = asUrl(raw);
  return u ? { ok: true, value: u.toString() } : { ok: false, error: "That doesn't look like a web address." };
}

export function normaliseReserve(raw: string | null | undefined): Normalised {
  if (!raw?.trim()) return { ok: true, value: null };
  const u = asUrl(raw);
  return u ? { ok: true, value: u.toString() } : { ok: false, error: "Paste the full booking link (e.g. from the venue's site, OpenTable or Eat App)." };
}

const IG_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** Accepts "@zumadubai", "zumadubai" or an instagram.com link. Stores the bare handle. */
export function normaliseInstagram(raw: string | null | undefined): Normalised {
  const s = raw?.trim() ?? "";
  if (!s) return { ok: true, value: null };
  let handle = s.replace(/^@/, "");
  if (/instagram\.com|instagr\.am/i.test(s)) {
    const u = asUrl(s);
    handle = u?.pathname.split("/").filter(Boolean)[0] ?? "";
  }
  handle = handle.replace(/\/+$/, "");
  return IG_HANDLE.test(handle) && !["p", "reel", "explore", "stories"].includes(handle)
    ? { ok: true, value: handle.toLowerCase() }
    : { ok: false, error: "Enter an Instagram handle like @zumadubai, or the profile link." };
}

/** Accepts "+971 50 123 4567", a local number (uses the place's country), or a wa.me link. Stores "+<digits>". */
export function normaliseWhatsapp(raw: string | null | undefined, country?: string | null): Normalised {
  const s = raw?.trim() ?? "";
  if (!s) return { ok: true, value: null };
  let num = s;
  const wa = s.match(/wa\.me\/(\+?\d+)/i) ?? s.match(/api\.whatsapp\.com\/send\?phone=(\+?\d+)/i);
  if (wa) num = wa[1].startsWith("+") ? wa[1] : `+${wa[1]}`;
  else if (s.startsWith("00")) num = `+${s.slice(2)}`;
  const intl = internationalPhone(num, country);
  const digits = intl.replace(/[^\d]/g, "");
  if (!intl.startsWith("+") || digits.length < 8 || digits.length > 15) {
    return { ok: false, error: "Enter the WhatsApp number with country code, e.g. +971 50 123 4567." };
  }
  return { ok: true, value: `+${digits}` };
}

export const instagramHref = (handle: string) => `https://instagram.com/${handle}`;
export const whatsappHref = (num: string) => `https://wa.me/${num.replace(/[^\d]/g, "")}`;

/** "zuma.co.ae" from "https://www.zuma.co.ae/dubai/" — for compact button labels. */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}
