import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { users, userVisits } from "./db/schema";

const PILOT_TZ = process.env.PILOT_TIMEZONE || "Asia/Dubai";

/** Calendar day in the pilot's time zone, "YYYY-MM-DD". */
export function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PILOT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Note that a signed-in person opened the app: one user_visits row per day (marked standalone if
 * any open that day came from the home-screen app) and users.last_seen_at.
 */
export async function recordVisit(userId: string, standalone: boolean): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(userVisits)
    .values({ userId, day: dayKey(now), standalone, createdAt: now })
    .onConflictDoUpdate({
      target: [userVisits.userId, userVisits.day],
      set: { standalone: sql`${userVisits.standalone} or ${standalone ? 1 : 0}` },
    });
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId));
}
