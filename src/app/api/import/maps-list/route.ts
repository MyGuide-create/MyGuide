// src/app/api/import/maps-list/route.ts
// POST { url } → { title?, places: [{ name, lat, lng, address?, note? }] }  or  422 { error: code }
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchGoogleMapsList, MapsListError } from "@/lib/places/googleMapsList";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

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
