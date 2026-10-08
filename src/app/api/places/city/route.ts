import { NextResponse } from "next/server";
import { getPlacesProvider } from "@/lib/places";

/** One picked city: name, country and centre. */
export async function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ city: null }, { status: 400 });
  try {
    return NextResponse.json({ city: await getPlacesProvider().city(id.slice(0, 300)) });
  } catch (e) {
    console.warn("[api/places/city]", e);
    return NextResponse.json({ city: null });
  }
}
