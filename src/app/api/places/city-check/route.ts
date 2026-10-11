import { NextResponse } from "next/server";
import { citySpellingSuggestion } from "@/lib/places/correctCity";

/**
 * Before a city is used "as typed": is it a misspelling of a real one? "Brussles" → Brussels, Belgium.
 * Returns { suggestion } to offer as "Did you mean…?", or { suggestion: null } when the text looks fine
 * (an exact match exists, or nothing close was found). The server corrects clear misspellings on save too.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  return NextResponse.json({ suggestion: await citySpellingSuggestion(q) });
}
