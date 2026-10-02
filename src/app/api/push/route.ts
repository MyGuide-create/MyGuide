import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { newId } from "@/lib/utils";

/** Save this browser's push subscription for the signed-in user. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  const db = await getDb();
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint));
  await db.insert(pushSubscriptions).values({ id: newId(), userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, createdAt: new Date() });
  return NextResponse.json({ ok: true });
}

/** Forget this browser's subscription. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) {
    const db = await getDb();
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, body.endpoint));
  }
  return NextResponse.json({ ok: true });
}
