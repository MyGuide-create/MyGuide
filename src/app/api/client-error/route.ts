import { desc, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { appErrors } from "@/lib/db/schema";
import { newId } from "@/lib/utils";

const KEEP = 500;

/** The browser reports an unexpected error someone saw (errorText / error page). Always 204. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { context?: unknown; message?: unknown; digest?: unknown; page?: unknown } | null;
    const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
    const message = str(body?.message, 500);
    if (!message) return new NextResponse(null, { status: 204 });
    const user = await getCurrentUser().catch(() => null);
    const db = await getDb();
    await db.insert(appErrors).values({
      id: newId(),
      userId: user?.id ?? null,
      context: str(body?.context, 200) || "Unknown",
      message,
      digest: str(body?.digest, 120) || null,
      page: str(body?.page, 300) || null,
      createdAt: new Date(),
    });
    // Keep the table small: drop anything older than the newest KEEP rows.
    const [cut] = await db.select({ at: appErrors.createdAt }).from(appErrors).orderBy(desc(appErrors.createdAt)).limit(1).offset(KEEP);
    if (cut) await db.delete(appErrors).where(lt(appErrors.createdAt, cut.at));
  } catch (e) {
    console.warn("[client-error]", e);
  }
  return new NextResponse(null, { status: 204 });
}
