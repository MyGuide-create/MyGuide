/** Why someone landed on the login / sign-up screen, so we can tell them. */
export type AuthReason = "follow" | "fork" | "create" | "record" | "notifications" | "comment" | "following" | "save";

export const SUPPORT_CONTACT = "Hisham";

const REASONS: Record<AuthReason, string> = {
  follow: "Create a free account to follow creators and see their new guides.",
  fork: "Create a free account to copy this guide — keep the places you like and add your own.",
  create: "Create a free account to make your first guide.",
  record: "Create a free account to add places as you go.",
  notifications: "Sign up or log in to see guides people have shared with you.",
  comment: "Create a free account to comment on places.",
  following: "Sign up or log in to see guides from people you follow.",
  save: "Create a free account to keep favourite places in your own shortlist.",
};

export function parseReason(v: unknown): AuthReason | null {
  return typeof v === "string" && v in REASONS ? (v as AuthReason) : null;
}

export function reasonText(r: AuthReason | null): string | null {
  return r ? REASONS[r] : null;
}

/** Only allow same-site relative paths as redirect targets. */
export function safeNext(v: unknown): string | undefined {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : undefined;
}

/** Where the close (×) button on the auth screens should go. */
export function closeHref(next?: string): string {
  if (next && /^\/(g|u|search)\b/.test(next)) return next;
  return "/";
}

export function authHref(mode: "login" | "signup", next?: string, why?: AuthReason | null): string {
  const p = new URLSearchParams();
  if (next) p.set("next", next);
  if (why) p.set("why", why);
  const q = p.toString();
  return `/${mode}${q ? `?${q}` : ""}`;
}
