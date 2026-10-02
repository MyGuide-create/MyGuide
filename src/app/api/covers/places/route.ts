import { asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { placePhotos, places } from "@/lib/db/schema";
import { getGuideById } from "@/lib/guides";
import { hasGoogleKey } from "@/lib/places";
import { isCollaborator } from "@/lib/guides";
import { getPlacePhotos } from "@/lib/places/google";

export type PlaceCoverOption =
  | { kind: "media"; mediaId: string; thumb: string; label: string }
  | { kind: "google"; placeId: string; ref: string; thumb: string; label: string; author: string };

/** Cover candidates taken from the guide's own places: the creator's photos first, then Google Maps photos. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const guideId = new URL(req.url).searchParams.get("guide") ?? "";
  const guide = await getGuideById(guideId);
  if (!guide || (guide.ownerId !== user.id && !(await isCollaborator(guide.id, user.id)))) return NextResponse.json({ error: "Not your guide." }, { status: 403 });

  const db = await getDb();
  const rows = await db.select().from(places).where(eq(places.guideId, guide.id)).orderBy(asc(places.position));
  const options: PlaceCoverOption[] = [];

  // 1. Photos the creator took/uploaded for their places.
  const seen = new Set<string>();
  const addMedia = (mediaId: string, label: string) => {
    if (seen.has(mediaId)) return;
    seen.add(mediaId);
    options.push({ kind: "media", mediaId, thumb: `/api/media/${mediaId}`, label });
  };
  for (const p of rows) if (p.photoMediaId) addMedia(p.photoMediaId, p.name);
  if (rows.length) {
    const extra = await db.select().from(placePhotos).where(inArray(placePhotos.placeId, rows.map((r) => r.id))).orderBy(asc(placePhotos.position));
    const nameOf = new Map(rows.map((r) => [r.id, r.name]));
    for (const ph of extra) addMedia(ph.mediaId, nameOf.get(ph.placeId) ?? "");
  }

  // 2. Google Maps photos for up to 10 places, 3 each.
  if (hasGoogleKey()) {
    const withGoogle = rows.filter((r) => r.googlePlaceId).slice(0, 10);
    const lists = await Promise.all(withGoogle.map((r) => getPlacePhotos(r.googlePlaceId!, 3).catch(() => [])));
    withGoogle.forEach((r, i) => {
      for (const ph of lists[i]) {
        options.push({ kind: "google", placeId: r.id, ref: ph.ref, thumb: `/api/places/photo?ref=${encodeURIComponent(ph.ref)}`, label: r.name, author: ph.author });
      }
    });
  }
  return NextResponse.json({ options });
}
