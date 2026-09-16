import { NextResponse } from "next/server";
import { polishNote } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { note?: string; placeName?: string };
  const note = (body.note ?? "").slice(0, 2000);
  return NextResponse.json({ note: await polishNote(note, body.placeName) });
}
