import { NextResponse } from "next/server";
import { getPlacesProvider } from "@/lib/places";

/** City/region suggestions for the city picker ("Going somewhere?", a guide's city). */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  try {
    return NextResponse.json({ suggestions: await getPlacesProvider().cities(q.slice(0, 80)) });
  } catch (e) {
    console.warn("[api/places/cities]", e);
    return NextResponse.json({ suggestions: [] });
  }
}
