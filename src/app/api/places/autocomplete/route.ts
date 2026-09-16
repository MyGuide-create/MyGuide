import { NextResponse } from "next/server";
import { getPlacesProvider } from "@/lib/places";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const city = url.searchParams.get("city") ?? undefined;
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  try {
    const suggestions = await getPlacesProvider().autocomplete(q.slice(0, 120), city);
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.warn("[api/places/autocomplete]", e);
    return NextResponse.json({ suggestions: [] });
  }
}
