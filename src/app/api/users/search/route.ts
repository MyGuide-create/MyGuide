import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchUsers } from "@/lib/guides";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ users: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });
  return NextResponse.json({ users: await searchUsers(q, user.id) });
}
