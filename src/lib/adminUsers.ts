import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, users } from "./db/schema";
import { toPublicUser, type PublicUser } from "./auth";
import { signUpInfo, type SignUpInfo } from "./oauthUsers";

export type AdminUserFilter = "all" | "new" | "never";

export interface AdminUserRow {
  user: PublicUser;
  email: string;
  createdAt: Date;
  signUp: SignUpInfo;
  /** Guides with a publish date (public or private). */
  guidesPublished: number;
  followers: number;
  following: number;
}

export interface AdminUsersSummary {
  total: number;
  newToday: number;
  newThisWeek: number;
  /** People with at least one published guide. */
  publishers: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** "Today" means today in the UAE, where the pilot runs. */
const PILOT_TZ = process.env.PILOT_TIMEZONE || "Asia/Dubai";

/** Midnight today in the pilot's time zone, as a UTC instant. */
export function startOfToday(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PILOT_TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}

/** Everyone, newest first, with what the Users tab shows. Small pilot: one pass, filtered in memory. */
export async function adminUsers(filter: AdminUserFilter = "all"): Promise<{ summary: AdminUsersSummary; rows: AdminUserRow[] }> {
  const db = await getDb();
  const [all, published, followerCounts, followingCounts] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select({ id: guides.ownerId, n: sql<number>`count(*)` }).from(guides).where(isNotNull(guides.publishedAt)).groupBy(guides.ownerId),
    db.select({ id: follows.followingId, n: sql<number>`count(*)` }).from(follows).where(eq(follows.status, "accepted")).groupBy(follows.followingId),
    db.select({ id: follows.followerId, n: sql<number>`count(*)` }).from(follows).where(and(eq(follows.status, "accepted"))).groupBy(follows.followerId),
  ]);
  const pub = new Map(published.map((r) => [r.id, Number(r.n)]));
  const fers = new Map(followerCounts.map((r) => [r.id, Number(r.n)]));
  const fing = new Map(followingCounts.map((r) => [r.id, Number(r.n)]));
  const methods = await signUpInfo(all);

  const today = startOfToday().getTime();
  const weekAgo = Date.now() - WEEK_MS;
  const summary: AdminUsersSummary = {
    total: all.length,
    newToday: all.filter((u) => u.createdAt.getTime() >= today).length,
    newThisWeek: all.filter((u) => u.createdAt.getTime() >= weekAgo).length,
    publishers: all.filter((u) => (pub.get(u.id) ?? 0) > 0).length,
  };
  const rows = all
    .filter((u) => (filter === "new" ? u.createdAt.getTime() >= weekAgo : filter === "never" ? !(pub.get(u.id) ?? 0) : true))
    .map((u) => ({
      user: toPublicUser(u),
      email: u.email,
      createdAt: u.createdAt,
      signUp: methods.get(u.id) ?? { method: "email" as const, linked: [] },
      guidesPublished: pub.get(u.id) ?? 0,
      followers: fers.get(u.id) ?? 0,
      following: fing.get(u.id) ?? 0,
    }));
  return { summary, rows };
}
