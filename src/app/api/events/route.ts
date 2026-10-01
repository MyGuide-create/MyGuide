import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { events, guides } from "@/lib/db/schema";
import { EVENT_TYPES, type EventType } from "@/lib/track";
import { newId } from "@/lib/utils";

const VISITOR_COOKIE = "mg_vid";
const ID_RE = /^[a-z0-9]{1,40}$/i;

/** Record one usage event (guide opens, shares, link taps). Always answers 204 so tracking never breaks the app. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { type?: string; guideId?: string; placeId?: string } | null;
    if (!body || !EVENT_TYPES.includes(body.type as EventType) || !body.guideId || !ID_RE.test(body.guideId)) {
      return new NextResponse(null, { status: 204 });
    }
    const placeId = body.placeId && ID_RE.test(body.placeId) ? body.placeId : null;

    const db = await getDb();
    const guide = await db.query.guides.findFirst({ where: eq(guides.id, body.guideId), columns: { id: true, ownerId: true } });
    if (!guide) return new NextResponse(null, { status: 204 });

    const user = await getCurrentUser();
    const store = await cookies();
    let visitorId = store.get(VISITOR_COOKIE)?.value;
    if (!visitorId || !ID_RE.test(visitorId)) {
      visitorId = newId();
      store.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    await db.insert(events).values({
      id: newId(),
      type: body.type as EventType,
      guideId: guide.id,
      placeId,
      userId: user?.id ?? null,
      visitorId,
      isOwner: !!user && user.id === guide.ownerId,
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("event tracking failed", e);
  }
  return new NextResponse(null, { status: 204 });
}
