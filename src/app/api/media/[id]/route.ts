import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();
  const row = await db.query.media.findFirst({ where: eq(media.id, id) });
  if (!row) return new NextResponse(null, { status: 404 });
  const body = new Uint8Array(row.data);
  return new NextResponse(body, {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
