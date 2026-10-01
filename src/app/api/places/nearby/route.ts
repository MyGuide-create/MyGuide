import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlacesProvider } from "@/lib/places";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = typeof body?.lat === "number" ? body.lat : null;
  const lng = typeof body?.lng === "number" ? body.lng : null;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "Missing coordinates." }, { status: 400 });
  }
  try {
    const results = await getPlacesProvider().nearby(lat, lng);
    return NextResponse.json({
      results: results.map((r) => ({
        providerId: r.providerId,
        name: r.name,
        address: r.address,
        city: r.city,
        country: r.country,
        category: r.category,
        distanceMeters: Math.round(r.distanceMeters),
      })),
    });
  } catch (e) {
    console.warn("[api/places/nearby]", e);
    return NextResponse.json({ results: [] });
  }
}
