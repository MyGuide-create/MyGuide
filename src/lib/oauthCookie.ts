/** The short-lived cookie that carries OAuth state between the start and the callback. */
export const OAUTH_COOKIE = "mg_oauth";

export function oauthSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET?.trim() || (process.env.NODE_ENV === "production" ? "" : "myguide-dev-secret-change-me");
  if (!s) throw new Error("AUTH_SECRET must be set in production");
  return new TextEncoder().encode(`${s}:oauth`);
}

/** Apple returns with a cross-site POST, which only carries SameSite=None cookies (and those must be Secure). */
export function oauthCookieOptions() {
  const prod = process.env.NODE_ENV === "production";
  return { httpOnly: true, secure: prod, sameSite: prod ? ("none" as const) : ("lax" as const), path: "/api/auth", maxAge: 600 };
}
