import { NextResponse } from "next/server";
import { getPlacesProvider } from "@/lib/places";
import { looksLikeMisspelling } from "@/lib/places/spelling";
import type { CitySuggestion } from "@/lib/places/types";

/**
 * Before a city is used "as typed": is it a misspelling of a real one? "Brussles" → Brussels, Belgium.
 * Returns { suggestion } to offer as "Did you mean…?", or { suggestion: null } when the text looks fine
 * (an exact match exists, or nothing close was found).
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 3) return NextResponse.json({ suggestion: null });
  try {
    const provider = getPlacesProvider();
    const list = await provider.cities(q);
    if (list.some((s) => s.mainText.trim().toLowerCase() === q.toLowerCase())) return NextResponse.json({ suggestion: null });
    let suggestion: CitySuggestion | null = list.find((s) => looksLikeMisspelling(q, s.mainText)) ?? null;
    if (!suggestion) {
      const found = await provider.cityByText(q);
      if (found && looksLikeMisspelling(q, found.mainText)) suggestion = found;
    }
    return NextResponse.json({ suggestion });
  } catch (e) {
    console.warn("[api/places/city-check]", e);
    return NextResponse.json({ suggestion: null });
  }
}
