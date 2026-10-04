import { NextResponse } from "next/server";
import { parsePlaceList } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { resolvePlaceByName, type PlaceResult } from "@/lib/places";
import { cleanImportedList, MAPS_LIST_FALLBACK } from "@/lib/places/importText";

export interface ParsedPlacesResponse {
  title: string;
  city: string;
  country: string;
  places: Array<{ name: string; cityHint?: string; resolved: PlaceResult | null }>;
  ai: boolean;
}

/** Turn a spoken/typed place list into structured, Maps-resolved places. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { transcript?: string; cityHint?: string };
  const transcript = (body.transcript ?? "").trim();
  if (!transcript) return NextResponse.json({ error: "Nothing to parse." }, { status: 400 });

  // Pasted lists can contain WhatsApp chat prefixes, bullets, emojis and Google Maps links — tidy those first.
  const imported = /https?:\/\/|\n/.test(transcript) ? await cleanImportedList(transcript) : { text: transcript, listLinks: 0, listUrls: [] };
  const cleaned = imported.text;
  if (imported.listLinks > 0 && !cleaned.trim()) {
    // Only list links were pasted: the client reads them with /api/import/maps-list and shows
    // `error` (the copy/Takeout/screenshots fallback) if that fails.
    return NextResponse.json({ error: MAPS_LIST_FALLBACK, code: "maps_list", listUrls: imported.listUrls }, { status: 422 });
  }
  const parsed = await parsePlaceList(cleaned.slice(0, 4000), body.cityHint);
  const cityHint = parsed.city || body.cityHint;
  const places = await Promise.all(
    parsed.places.slice(0, 40).map(async (p) => ({
      name: p.name,
      cityHint: p.cityHint,
      resolved: await resolvePlaceByName(p.name, p.cityHint ?? cityHint),
    })),
  );
  // If the guide city was unknown, borrow it from the first resolved place.
  const first = places.find((p) => p.resolved?.city)?.resolved;
  const res: ParsedPlacesResponse = {
    title: parsed.title,
    city: parsed.city || first?.city || "",
    country: parsed.country || first?.country || "",
    places,
    ai: !!process.env.ANTHROPIC_API_KEY,
  };
  return NextResponse.json(res);
}
