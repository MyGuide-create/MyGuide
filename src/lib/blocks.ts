import { eq, or } from "drizzle-orm";
import { getDb } from "./db";
import { blocks } from "./db/schema";

/** Everyone the viewer has blocked or been blocked by — their content is hidden both ways. */
export async function hiddenUserIds(viewerId: string | null | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const db = await getDb();
  const rows = await db.select().from(blocks).where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId)));
  return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
}

export async function viewerBlocked(viewerId: string, otherId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.query.blocks.findFirst({ where: (b, { and, eq }) => and(eq(b.blockerId, viewerId), eq(b.blockedId, otherId)) });
  return !!row;
}
