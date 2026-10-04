// src/app/api/import/maps-list/route.ts
// POST { url } → { title?, places: [{ name, lat, lng, address?, note? }] }  or  422 { error: code }
import { NextResponse } from "next/server";
import { fetchGoogleMapsList, MapsListError } from "@/lib/places/googleMapsList";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  // TODO: add the same signed-in check used by /api/ai/screenshot-places (return 401 if no session).

  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    /* fall through */
  }
  if (typeof url !== "string" || !url.trim() || url.length > 2000) {
    return NextResponse.json({ error: "not_a_list" }, { status: 400 });
  }

  try {
    return NextResponse.json(await fetchGoogleMapsList(url));
  } catch (e) {
    const code = e instanceof MapsListError ? e.code : "fetch_failed";
    console.warn("[maps-list import] failed:", code, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: code }, { status: 422 });
  }
}
