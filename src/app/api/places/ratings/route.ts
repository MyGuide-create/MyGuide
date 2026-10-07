import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canViewGuide, getGuideById } from "@/lib/guides";
import { places } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getGoogleRatings } from "@/lib/places/ratings";

/**
 * GET /api/places/ratings?guideId=…&key=…
 * Google ratings for a guide's places, keyed by MyGuide place id. Loaded after
 * the guide renders so a slow Google lookup never holds up the page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const guideId = url.searchParams.get("guideId");
  const key = url.searchParams.get("key");
  if (!guideId) return NextResponse.json({ ratings: {} }, { status: 400 });
  const guide = await getGuideById(guideId);
  const user = await getCurrentUser();
  if (!guide || !(await canViewGuide(guide, user?.id, key))) return NextResponse.json({ ratings: {} }, { status: 404 });

  const db = await getDb();
  const rows = await db.select({ id: places.id, googlePlaceId: places.googlePlaceId }).from(places).where(eq(places.guideId, guide.id));
  const byGoogleId = await getGoogleRatings(rows.map((r) => r.googlePlaceId));
  const ratings = Object.fromEntries(
    rows.filter((r) => r.googlePlaceId && byGoogleId[r.googlePlaceId]).map((r) => [r.id, byGoogleId[r.googlePlaceId!]]),
  );
  return NextResponse.json({ ratings }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
