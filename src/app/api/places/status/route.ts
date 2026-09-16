import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, places } from "@/lib/db/schema";
import { getPlacesProvider, hasGoogleKey } from "@/lib/places";

const checked = new Map<string, number>();
const TTL = 1000 * 60 * 60 * 6;

/**
 * Re-checks the business status of a guide's places against Google Maps when
 * the owner views their guide. Lightweight, on-demand, no background job.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ flagged: [] }, { status: 401 });
  if (!hasGoogleKey()) return NextResponse.json({ flagged: [], live: false });
  const { guideId } = (await req.json().catch(() => ({}))) as { guideId?: string };
  if (!guideId) return NextResponse.json({ flagged: [] }, { status: 400 });

  const db = await getDb();
  const guide = await db.query.guides.findFirst({ where: and(eq(guides.id, guideId), eq(guides.ownerId, user.id)) });
  if (!guide) return NextResponse.json({ flagged: [] }, { status: 403 });

  const rows = await db.select().from(places).where(eq(places.guideId, guideId));
  const provider = getPlacesProvider();
  const toCheck = rows.filter((p) => p.googlePlaceId && !p.googlePlaceId.startsWith("mock:") && (Date.now() - (checked.get(p.id) ?? 0)) > TTL);
  await Promise.all(
    toCheck.slice(0, 20).map(async (p) => {
      try {
        const status = await provider.businessStatus(p.googlePlaceId!);
        checked.set(p.id, Date.now());
        if (status && status !== p.businessStatus) {
          await db.update(places).set({ businessStatus: status }).where(eq(places.id, p.id));
          p.businessStatus = status;
        }
      } catch (e) {
        console.warn("[api/places/status]", e);
      }
    }),
  );
  const flagged = rows.filter((p) => p.businessStatus && p.businessStatus !== "OPERATIONAL").map((p) => ({ id: p.id, status: p.businessStatus }));
  void inArray;
  return NextResponse.json({ flagged, live: true });
}
