import { createHash, randomBytes } from "node:crypto";
import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";

/**
 * "Continue with Google" / "Continue with Apple" — plain OAuth 2 / OpenID Connect with `jose`.
 * Each provider is switched on by its env vars; without them its button is hidden.
 *
 * Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * Apple:  APPLE_CLIENT_ID (the Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 file's text)
 * Redirect URIs to register: <origin>/api/auth/google/callback and <origin>/api/auth/apple/callback
 */

export type Provider = "google" | "apple";

export interface ProviderProfile {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const env = (k: string) => process.env[k]?.trim() || "";

export function providerEnabled(p: Provider): boolean {
  if (p === "google") return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
  return !!(env("APPLE_CLIENT_ID") && env("APPLE_TEAM_ID") && env("APPLE_KEY_ID") && env("APPLE_PRIVATE_KEY"));
}

export function enabledProviders(): Provider[] {
  return (["google", "apple"] as const).filter(providerEnabled);
}

export const isProvider = (v: unknown): v is Provider => v === "google" || v === "apple";

export function redirectUri(origin: string, p: Provider): string {
  const base = env("NEXT_PUBLIC_APP_URL").replace(/\/$/, "") || origin;
  return `${base}/api/auth/${p}/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
export const randomToken = () => b64url(randomBytes(32));
export const pkceChallenge = (verifier: string) => b64url(createHash("sha256").update(verifier).digest());

export function authorizeUrl(p: Provider, o: { redirectUri: string; state: string; nonce: string; verifier: string }): string {
  if (p === "google") {
    const q = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: o.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: o.state,
      nonce: o.nonce,
      code_challenge: pkceChallenge(o.verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  // Apple posts the result back (form_post) — that's the only mode that returns the person's name.
  const q = new URLSearchParams({
    client_id: env("APPLE_CLIENT_ID"),
    redirect_uri: o.redirectUri,
    response_type: "code",
    response_mode: "form_post",
    scope: "name email",
    state: o.state,
    nonce: o.nonce,
  });
  return `https://appleid.apple.com/auth/authorize?${q}`;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

async function appleClientSecret(): Promise<string> {
  const key = await importPKCS8(env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"), "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APPLE_KEY_ID") })
    .setIssuer(env("APPLE_TEAM_ID"))
    .setSubject(env("APPLE_CLIENT_ID"))
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

/** Swap the code for tokens and read who signed in from the verified id token. */
export async function exchangeCode(
  p: Provider,
  o: { code: string; redirectUri: string; verifier: string; nonce: string; appleUser?: string | null },
): Promise<ProviderProfile> {
  const body =
    p === "google"
      ? new URLSearchParams({ code: o.code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: o.redirectUri, grant_type: "authorization_code", code_verifier: o.verifier })
      : new URLSearchParams({ code: o.code, client_id: env("APPLE_CLIENT_ID"), client_secret: await appleClientSecret(), redirect_uri: o.redirectUri, grant_type: "authorization_code" });
  const res = await fetch(p === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${p} token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error(`${p} returned no id token`);

  const { payload } =
    p === "google"
      ? await jwtVerify(tokens.id_token, GOOGLE_JWKS, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: env("GOOGLE_CLIENT_ID") })
      : await jwtVerify(tokens.id_token, APPLE_JWKS, { issuer: "https://appleid.apple.com", audience: env("APPLE_CLIENT_ID") });
  const nonce = typeof payload.nonce === "string" ? payload.nonce : null;
  if (nonce && nonce !== o.nonce && nonce !== createHash("sha256").update(o.nonce).digest("hex")) throw new Error("nonce mismatch");
  if (typeof payload.sub !== "string") throw new Error("id token without sub");

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  let name: string | null = typeof payload.name === "string" ? payload.name : null;
  if (p === "apple" && o.appleUser) {
    // Apple sends the name only the very first time, outside the token.
    try {
      const u = JSON.parse(o.appleUser) as { name?: { firstName?: string; lastName?: string } };
      name = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" ").trim() || null;
    } catch {
      /* ignore */
    }
  }
  return { sub: payload.sub, email, emailVerified, name };
}
