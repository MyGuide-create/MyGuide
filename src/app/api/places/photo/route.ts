import { NextResponse } from "next/server";
import { resolvePhotoUri } from "@/lib/places/google";
import { hasGoogleKey } from "@/lib/places";

const cache = new Map<string, { uri: string; at: number }>();
const TTL = 1000 * 60 * 60 * 12;

/** Redirects a Google photo reference to its CDN URL without exposing the API key. */
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref || !hasGoogleKey()) return new NextResponse(null, { status: 404 });
  const hit = cache.get(ref);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.redirect(hit.uri, 302);
  const uri = await resolvePhotoUri(ref);
  if (!uri) return new NextResponse(null, { status: 404 });
  cache.set(ref, { uri, at: Date.now() });
  return NextResponse.redirect(uri, 302);
}
