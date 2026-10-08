import { NextResponse } from "next/server";
import { getPlacesProvider } from "@/lib/places";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const city = url.searchParams.get("city") ?? undefined;
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const near = url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  try {
    const suggestions = await getPlacesProvider().autocomplete(q.slice(0, 120), city, near);
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.warn("[api/places/autocomplete]", e);
    return NextResponse.json({ suggestions: [] });
  }
}
