import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasUnsplashKey, searchUnsplash } from "@/lib/covers/unsplash";

/** Search Unsplash for a guide cover. Logged-in users only (keeps us inside the free rate limit). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!hasUnsplashKey()) return NextResponse.json({ enabled: false, results: [] });
  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").slice(0, 100);
  const page = Math.min(Math.max(Number(params.get("page") ?? 1) || 1, 1), 10);
  const results = await searchUnsplash(q, page);
  return NextResponse.json({ enabled: true, results });
}
