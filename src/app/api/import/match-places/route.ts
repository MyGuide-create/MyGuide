// POST { places: [{ name, lat, lng }] } (up to MAX_BATCH) → { matches: (PlaceResult | null)[] } in the same order.
// The client sends a long Google Maps list in batches so no single request runs long on Vercel.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { matchListPlace, type ListPlaceToMatch } from "@/lib/places/matchList";
import { validPin } from "@/lib/places/pins";
import { mapLimit } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BATCH = 25;
const CONCURRENCY = 5;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { places?: unknown } | null;
  const list = Array.isArray(body?.places) ? body.places : null;
  if (!list || !list.length || list.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send 1–${MAX_BATCH} places.` }, { status: 400 });
  }
  const places = list.map((p): ListPlaceToMatch | null => {
    const x = p as Partial<ListPlaceToMatch> | null;
    return x && typeof x.name === "string" && x.name.trim() && validPin(x.lat, x.lng)
      ? { name: x.name.trim().slice(0, 200), lat: x.lat, lng: x.lng as number }
      : null;
  });
  const matches = await mapLimit(places, CONCURRENCY, (p) => (p ? matchListPlace(p) : Promise.resolve(null)));
  return NextResponse.json({ matches });
}
