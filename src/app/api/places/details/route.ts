import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPlacesProvider } from "@/lib/places";

/** What Google knows about a place, for the "Filled in from Google" preview while recording it. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ info: null });
  try {
    const p = await getPlacesProvider().details(id);
    if (!p) return NextResponse.json({ info: null });
    return NextResponse.json({
      info: {
        address: p.address,
        phone: p.phone,
        website: p.website,
        instagram: p.instagram,
        hours: p.hours,
        photoCount: p.photoUrls.length || (p.photoUrl ? 1 : 0),
        country: p.country,
        city: p.city,
        lng: p.lng,
        businessStatus: p.businessStatus,
      },
    });
  } catch (e) {
    console.warn("[api/places/details]", e);
    return NextResponse.json({ info: null });
  }
}
