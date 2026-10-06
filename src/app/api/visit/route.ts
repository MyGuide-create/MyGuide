import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordVisit } from "@/lib/visits";

/** "I opened the app" ping from VisitPing. Signed-in only; always 204 so it never breaks anything. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (user) {
      const body = (await req.json().catch(() => null)) as { standalone?: boolean } | null;
      await recordVisit(user.id, body?.standalone === true);
    }
  } catch (e) {
    console.warn("[api/visit]", e);
  }
  return new NextResponse(null, { status: 204 });
}
