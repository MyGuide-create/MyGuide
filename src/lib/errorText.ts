import { readUserError } from "./userError";

/**
 * The one way to turn a caught error into words on screen. Never shows raw technical text
 * ("Minified React error", stack traces, status codes). See claude/error-messages.md in the project.
 *
 *   ours (UserError)        → our message
 *   no connection           → "You're offline — check your connection and try again."
 *   anything else           → `fallback` ("Couldn't set the cover photo.") + "Try again…", and it's reported
 */
export const OFFLINE_TEXT = "You’re offline — check your connection and try again.";
export const LOGGED_OUT_TEXT = "You’ve been logged out. Log in again to carry on.";

export function errorText(e: unknown, fallback: string): string {
  const mine = readUserError(e);
  if (mine) return mine.code === "auth" ? LOGGED_OUT_TEXT : mine.message;
  if (isOffline(e)) return OFFLINE_TEXT;
  reportError(e, fallback);
  return `${fallback.replace(/[.!]?\s*$/, ".")} Try again — if it keeps happening, tell us.`;
}

/** True for errors that are really "no internet" (fetch failures, offline browser). */
export function isOffline(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return e instanceof TypeError && /fetch|network|load failed|internet/i.test(msg);
}

/** Tell the admin page about an unexpected error (best effort, never throws). */
export function reportError(e: unknown, context: string): void {
  if (typeof window === "undefined") return;
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const body = JSON.stringify({
      context: context.slice(0, 200),
      message: err.message.slice(0, 500),
      digest: String((e as { digest?: unknown })?.digest ?? "").slice(0, 120) || null,
      page: window.location.pathname + window.location.search,
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}
