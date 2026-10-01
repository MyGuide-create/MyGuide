import { NextResponse } from "next/server";
import { resolvePhotoUri } from "@/lib/places/google";
import { hasGoogleKey } from "@/lib/places";

const cache = new Map<string, { uri: string; at: number }>();
const TTL = 1000 * 60 * 60 * 12;

/** Redirects a Google photo reference to its CDN URL without exposing the API key. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ref = params.get("ref");
  const width = Math.min(Math.max(Number(params.get("w") ?? 900) || 900, 200), 1600);
  if (!ref || !hasGoogleKey()) return new NextResponse(null, { status: 404 });
  const cacheKey = `${ref}|${width}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.redirect(hit.uri, 302);
  const uri = await resolvePhotoUri(ref, width);
  if (!uri) return new NextResponse(null, { status: 404 });
  cache.set(cacheKey, { uri, at: Date.now() });
  return NextResponse.redirect(uri, 302);
}
