import { NextResponse } from "next/server";
import { getPlacesProvider } from "@/lib/places";
import { isRegionResult } from "@/lib/places/google";
import { typedCityHint } from "@/lib/places/regionHint";

/**
 * Place suggestions as you type. `places=1` (adding a spot): cities and regions are left out — a city isn't a
 * spot — and when the typed text is a city, `city` says so for "Looking for a place in Cincinnati?".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const city = url.searchParams.get("city") ?? undefined;
  const placesOnly = url.searchParams.get("places") === "1";
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const near = url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  if (q.length < 2) return NextResponse.json({ suggestions: [], city: null });
  try {
    const all = await getPlacesProvider().autocomplete(q.slice(0, 120), city, near, { placesOnly });
    if (!placesOnly) return NextResponse.json({ suggestions: all, city: null });
    const regions = all.filter((s) => isRegionResult(s.types));
    const suggestions = all.filter((s) => !isRegionResult(s.types));
    return NextResponse.json({ suggestions, city: await typedCityHint(q, regions) });
  } catch (e) {
    console.warn("[api/places/autocomplete]", e);
    return NextResponse.json({ suggestions: [], city: null });
  }
}
