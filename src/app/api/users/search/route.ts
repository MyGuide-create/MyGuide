import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hiddenUserIds } from "@/lib/blocks";
import { getDb } from "@/lib/db";
import { follows } from "@/lib/db/schema";
import { searchUsers } from "@/lib/guides";

/** People search for pickers (share with, co-editors, ask for a guide): people you follow first. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ users: [] }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return NextResponse.json({ users: [] });
  const [found, hidden] = await Promise.all([searchUsers(q, user.id, 12), hiddenUserIds(user.id)]);
  const visible = found.filter((u) => !hidden.has(u.id));
  if (!visible.length) return NextResponse.json({ users: [] });
  const db = await getDb();
  const mine = await db.select({ id: follows.followingId }).from(follows).where(and(eq(follows.followerId, user.id), inArray(follows.followingId, visible.map((u) => u.id))));
  const followed = new Set(mine.map((m) => m.id));
  visible.sort((a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id)));
  return NextResponse.json({ users: visible.slice(0, 8) });
}
