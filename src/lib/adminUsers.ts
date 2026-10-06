import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, pushSubscriptions, users, userVisits } from "./db/schema";
import { dayKey } from "./visits";
import { toPublicUser, type PublicUser } from "./auth";
import { signUpInfo, type SignUpInfo } from "./oauthUsers";

export type AdminUserFilter = "all" | "new" | "never" | "gone";

export interface AdminUserRow {
  user: PublicUser;
  email: string;
  createdAt: Date;
  signUp: SignUpInfo;
  /** Guides with a publish date (public or private). */
  guidesPublished: number;
  followers: number;
  following: number;
  /** Last time they opened the app signed in (null before visit tracking, if they never opened a guide). */
  lastSeenAt: Date | null;
  /** Days they opened the app, sign-up day included. */
  daysActive: number;
  /** Opened it on a day after the day they signed up. */
  cameBack: boolean;
  /** Has opened it from the home-screen app. */
  homeScreen: boolean;
  /** Has alerts (push) turned on on at least one device. */
  alertsOn: boolean;
}

export interface RetentionSummary {
  /** Of people who signed up before today: how many opened it again on a later day. */
  cameBack: number;
  cameBackOf: number;
  /** Of people who signed up 7+ days ago: how many opened it 7+ days after signing up. */
  weekLater: number;
  weekLaterOf: number;
  /** People who opened it in the last 7 days (today included). */
  active7d: number;
  homeScreen: number;
  alertsOn: number;
}

/** Per-person visit facts and the pilot's retention numbers, from user_visits (+ push subscriptions). */
export async function retention(): Promise<{ summary: RetentionSummary; perUser: Map<string, { days: number; cameBack: boolean; homeScreen: boolean; alertsOn: boolean }> }> {
  const db = await getDb();
  const [people, visits, subs] = await Promise.all([
    db.select({ id: users.id, createdAt: users.createdAt }).from(users),
    db.select({ userId: userVisits.userId, day: userVisits.day, standalone: userVisits.standalone }).from(userVisits),
    db.selectDistinct({ userId: pushSubscriptions.userId }).from(pushSubscriptions),
  ]);
  const byUser = new Map<string, { days: string[]; standalone: boolean }>();
  for (const v of visits) {
    const e = byUser.get(v.userId) ?? { days: [], standalone: false };
    e.days.push(v.day);
    e.standalone ||= v.standalone;
    byUser.set(v.userId, e);
  }
  const alerts = new Set(subs.map((r) => r.userId));
  const DAY = 86_400_000;
  const today = dayKey();
  const weekAgoDay = dayKey(new Date(Date.now() - 6 * DAY));
  const summary: RetentionSummary = { cameBack: 0, cameBackOf: 0, weekLater: 0, weekLaterOf: 0, active7d: 0, homeScreen: 0, alertsOn: 0 };
  const perUser = new Map<string, { days: number; cameBack: boolean; homeScreen: boolean; alertsOn: boolean }>();
  for (const u of people) {
    const e = byUser.get(u.id) ?? { days: [], standalone: false };
    const signupDay = dayKey(u.createdAt);
    const weekDay = dayKey(new Date(u.createdAt.getTime() + 7 * DAY));
    const cameBack = e.days.some((d) => d > signupDay);
    const days = new Set([...e.days, signupDay]).size;
    if (signupDay < today) {
      summary.cameBackOf++;
      if (cameBack) summary.cameBack++;
    }
    if (weekDay <= today) {
      summary.weekLaterOf++;
      if (e.days.some((d) => d >= weekDay)) summary.weekLater++;
    }
    if (e.days.some((d) => d >= weekAgoDay)) summary.active7d++;
    if (e.standalone) summary.homeScreen++;
    if (alerts.has(u.id)) summary.alertsOn++;
    perUser.set(u.id, { days, cameBack, homeScreen: e.standalone, alertsOn: alerts.has(u.id) });
  }
  return { summary, perUser };
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
export async function adminUsers(filter: AdminUserFilter = "all"): Promise<{ summary: AdminUsersSummary; retention: RetentionSummary; rows: AdminUserRow[] }> {
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
  const [methods, ret] = await Promise.all([signUpInfo(all), retention()]);
  const visitOf = (id: string) => ret.perUser.get(id) ?? { days: 1, cameBack: false, homeScreen: false, alertsOn: false };

  const today = startOfToday().getTime();
  const weekAgo = Date.now() - WEEK_MS;
  const summary: AdminUsersSummary = {
    total: all.length,
    newToday: all.filter((u) => u.createdAt.getTime() >= today).length,
    newThisWeek: all.filter((u) => u.createdAt.getTime() >= weekAgo).length,
    publishers: all.filter((u) => (pub.get(u.id) ?? 0) > 0).length,
  };
  const rows = all
    .filter((u) =>
      filter === "new"
        ? u.createdAt.getTime() >= weekAgo
        : filter === "never"
          ? !(pub.get(u.id) ?? 0)
          : filter === "gone"
            ? !visitOf(u.id).cameBack && u.createdAt.getTime() < today
            : true,
    )
    .map((u) => ({
      user: toPublicUser(u),
      email: u.email,
      createdAt: u.createdAt,
      signUp: methods.get(u.id) ?? { method: "email" as const, linked: [] },
      guidesPublished: pub.get(u.id) ?? 0,
      followers: fers.get(u.id) ?? 0,
      following: fing.get(u.id) ?? 0,
      lastSeenAt: u.lastSeenAt ?? null,
      daysActive: visitOf(u.id).days,
      cameBack: visitOf(u.id).cameBack,
      homeScreen: visitOf(u.id).homeScreen,
      alertsOn: visitOf(u.id).alertsOn,
    }));
  return { summary, retention: ret.summary, rows };
}
