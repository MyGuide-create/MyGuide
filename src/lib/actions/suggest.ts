"use server";

import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { suggestionDismissals } from "../db/schema";

/** ✕ on a follow suggestion: never suggest this person again. */
export async function dismissSuggestion(targetId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !targetId || targetId === user.id) return;
  const db = await getDb();
  await db.insert(suggestionDismissals).values({ userId: user.id, targetId, createdAt: new Date() }).onConflictDoNothing();
}
