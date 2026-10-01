import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, like, not } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { getPlacesProvider, hasGoogleKey } from "@/lib/places";

/**
 * TEMPORARY one-off maintenance route: backfills phone numbers from Google
 * Places for existing `places` rows that predate the `phone` column. Safe
 * to call more than once — only touches rows still missing a phone.
 * Requires a logged-in user (not public). Remove this route once run.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasGoogleKey()) return NextResponse.json({ error: "No GOOGLE_MAPS_API_KEY configured" }, { status: 400 });

  const db = await getDb();
  const provider = getPlacesProvider();

  const candidates = await db
    .select({ id: places.id, name: places.name, googlePlaceId: places.googlePlaceId })
    .from(places)
    .where(and(isNotNull(places.googlePlaceId), not(like(places.googlePlaceId, "mock:%")), isNull(places.phone)));

  const results: { name: string; phone?: string; status: "updated" | "no-phone" | "error" }[] = [];

  for (const p of candidates) {
    if (!p.googlePlaceId) continue;
    try {
      const detail = await provider.details(p.googlePlaceId);
      if (detail?.phone) {
        await db.update(places).set({ phone: detail.phone }).where(eq(places.id, p.id));
        results.push({ name: p.name, phone: detail.phone, status: "updated" });
      } else {
        results.push({ name: p.name, status: "no-phone" });
      }
    } catch {
      results.push({ name: p.name, status: "error" });
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return NextResponse.json({
    candidateCount: candidates.length,
    updated: results.filter((r) => r.status === "updated").length,
    noPhone: results.filter((r) => r.status === "no-phone").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  });
}
