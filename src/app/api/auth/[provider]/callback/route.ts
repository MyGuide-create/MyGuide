import { NextResponse, after } from "next/server";
import { notifyUserJoined } from "@/lib/notify";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { setSessionOn } from "@/lib/auth";
import { exchangeCode, isProvider, redirectUri, type Provider } from "@/lib/oauth";
import { OAUTH_COOKIE, oauthCookieOptions, oauthSecret } from "@/lib/oauthCookie";
import { userForProvider } from "@/lib/oauthUsers";

interface Pending {
  provider: Provider;
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  mode: "login" | "signup";
}

async function finish(req: Request, provider: string, fields: { code: string | null; state: string | null; error: string | null; user: string | null }) {
  const origin = new URL(req.url).origin;
  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value;
  let pending: Pending | null = null;
  try {
    if (raw) pending = (await jwtVerify(raw, oauthSecret())).payload as unknown as Pending;
  } catch {
    pending = null;
  }
  const back = (q: string) => {
    const mode = pending?.mode ?? "login";
    const p = new URLSearchParams(q);
    if (pending?.next) p.set("next", pending.next);
    const qs = p.toString();
    const res = NextResponse.redirect(new URL(`/${mode}${qs ? `?${qs}` : ""}`, origin), 303);
    res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    return res;
  };

  // Cancelled at Google/Apple → straight back, no error shown.
  if (fields.error) return back("");
  if (!isProvider(provider) || !pending || pending.provider !== provider || !fields.code || fields.state !== pending.state) {
    return back("oauth=failed");
  }
  try {
    const profile = await exchangeCode(provider, {
      code: fields.code,
      redirectUri: redirectUri(origin, provider),
      verifier: pending.verifier,
      nonce: pending.nonce,
      appleUser: fields.user,
    });
    const { user, isNew } = await userForProvider(provider, profile);
    if (isNew) after(() => notifyUserJoined(user.id));
    const next = pending.next || "/";
    const dest = isNew ? `/welcome?new=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}` : next;
    const res = NextResponse.redirect(new URL(dest, origin), 303);
    await setSessionOn(res, user.id);
    res.cookies.set(OAUTH_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
    return res;
  } catch (e) {
    console.warn(`[oauth/${provider}]`, e);
    return back("oauth=failed");
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const q = new URL(req.url).searchParams;
  return finish(req, provider, { code: q.get("code"), state: q.get("state"), error: q.get("error"), user: null });
}

/** Apple (response_mode=form_post). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const form = await req.formData().catch(() => null);
  const get = (k: string) => (form?.get(k) as string | null) ?? null;
  return finish(req, provider, { code: get("code"), state: get("state"), error: get("error"), user: get("user") });
}
