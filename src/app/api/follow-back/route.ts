import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { startFollowing } from "@/lib/follow";
import { getUserById } from "@/lib/guides";

/** "Follow back" straight from a phone notification (the service worker calls this). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { userId?: string } | null;
  if (!body?.userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  const target = await getUserById(body.userId);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const status = await startFollowing(user.id, target.id);
  if (status === "none") return NextResponse.json({ error: "Can't follow" }, { status: 403 });
  revalidatePath("/notifications");
  revalidatePath(`/u/${target.username}`);
  return NextResponse.json({ status, name: target.displayName, username: target.username });
}
