import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { authorizeUrl, isProvider, providerEnabled, randomToken, redirectUri } from "@/lib/oauth";
import { safeNext } from "@/lib/authContext";
import { OAUTH_COOKIE, oauthCookieOptions, oauthSecret } from "@/lib/oauthCookie";

/** Start "Continue with Google / Apple": remember state in a short-lived signed cookie, then go to the provider. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "login" ? "login" : "signup";
  const next = safeNext(url.searchParams.get("next")) ?? "";
  if (!isProvider(provider) || !providerEnabled(provider)) {
    return NextResponse.redirect(new URL(`/${mode}?oauth=unavailable`, url.origin));
  }
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken();
  const token = await new SignJWT({ provider, state, nonce, verifier, next, mode })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(oauthSecret());
  const res = NextResponse.redirect(authorizeUrl(provider, { redirectUri: redirectUri(url.origin, provider), state, nonce, verifier }));
  res.cookies.set(OAUTH_COOKIE, token, oauthCookieOptions());
  return res;
}
