import { NextResponse } from "next/server";
import { placesFromScreenshot } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** One screenshot in, place names out. The client sends screenshots one at a time (Vercel's ~4.5 MB body limit). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { image?: string; mediaType?: string } | null;
  const image = body?.image?.replace(/^data:[^,]+,/, "") ?? "";
  const mediaType = (TYPES as readonly string[]).includes(body?.mediaType ?? "") ? (body!.mediaType as (typeof TYPES)[number]) : "image/jpeg";
  if (!image) return NextResponse.json({ error: "No image." }, { status: 400 });
  if (image.length > 4_000_000) return NextResponse.json({ error: "That screenshot is too large." }, { status: 413 });
  try {
    return NextResponse.json(await placesFromScreenshot(image, mediaType));
  } catch (e) {
    if (e instanceof Error && e.message === "no_ai") {
      return NextResponse.json({ error: "Reading screenshots needs MyGuide's AI turned on — ask Hisham to add the AI key.", code: "no_ai" }, { status: 501 });
    }
    console.warn("[screenshot-places]", e);
    return NextResponse.json({ error: "Couldn't read that screenshot — try a clearer one." }, { status: 502 });
  }
}
