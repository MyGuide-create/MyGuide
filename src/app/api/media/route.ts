import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { newId } from "@/lib/utils";

const MAX_BYTES = 6 * 1024 * 1024;

/** Upload an image or audio clip. Stored in the database so no bucket is needed for the soft launch. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 6 MB)." }, { status: 413 });
  const mime = file.type || "application/octet-stream";
  const kind = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") || mime.startsWith("video/") ? "audio" : null;
  if (!kind) return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
  const duration = Number(form.get("duration") ?? "") || null;
  const id = newId();
  const db = await getDb();
  await db.insert(media).values({
    id,
    ownerId: user.id,
    kind,
    mime,
    data: Buffer.from(await file.arrayBuffer()),
    durationSec: duration,
    createdAt: new Date(),
  });
  return NextResponse.json({ id, url: `/api/media/${id}`, kind, mime, duration });
}
