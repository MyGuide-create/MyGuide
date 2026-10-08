/**
 * Errors we mean people to see ("That place isn't in this guide.").
 *
 * In production Next.js hides the message of anything thrown in a server action (people saw
 * "Minified React error #441…"). It does keep an error's `digest`, so a UserError carries its
 * message there too ("MGU|code|message"), and errorText() on the client reads it back.
 * Usable on the server and in the browser.
 */
export type UserErrorCode = "auth" | "forbidden" | "gone" | "invalid" | "google" | "upload" | "user";

export const USER_ERROR_PREFIX = "MGU|";

export class UserError extends Error {
  readonly code: UserErrorCode;
  readonly digest: string;
  constructor(message: string, code: UserErrorCode = "user") {
    super(message);
    this.name = "UserError";
    this.code = code;
    this.digest = `${USER_ERROR_PREFIX}${code}|${message}`;
  }
}

/** The code and message from a UserError, whether thrown here or passed through a server action. */
export function readUserError(e: unknown): { code: UserErrorCode; message: string } | null {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith(USER_ERROR_PREFIX)) return null;
  const rest = digest.slice(USER_ERROR_PREFIX.length);
  const bar = rest.indexOf("|");
  if (bar < 0) return null;
  return { code: rest.slice(0, bar) as UserErrorCode, message: rest.slice(bar + 1) };
}
