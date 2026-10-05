import { NextResponse } from "next/server";
import { getUserById } from "@/lib/guides";

/** Profile link by user id (push notifications), so it survives a later @username change. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserById(id);
  return NextResponse.redirect(new URL(user ? `/u/${user.username}` : "/", req.url), 307);
}
