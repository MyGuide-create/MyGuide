import { and, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { hashPassword } from "./auth";
import { getDb } from "./db";
import { oauthAccounts, users, type User } from "./db/schema";
import type { Provider, ProviderProfile } from "./oauth";
import { newId } from "./utils";

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

function baseUsername(profile: ProviderProfile): string {
  const fromName = (profile.name ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  const fromEmail = (profile.email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9_.]+/g, "");
  // Apple's private relay addresses are random strings — a name reads better.
  const relay = profile.email?.endsWith("@privaterelay.appleid.com");
  let u = (relay ? fromName || fromEmail : fromEmail || fromName).slice(0, 20).replace(/^\.+|\.+$/g, "");
  if (u.length < 3) u = `guide${u}`;
  return u;
}

async function uniqueUsername(base: string): Promise<string> {
  const db = await getDb();
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 20)}${i + 1}`;
    if (!USERNAME_RE.test(candidate)) continue;
    const taken = await db.query.users.findFirst({ where: eq(users.username, candidate) });
    if (!taken) return candidate;
  }
  return `guide${newId().slice(0, 8)}`;
}

/**
 * Find or create the MyGuide account for a Google/Apple sign-in.
 * 1. Already linked → that account.  2. Same verified email as an existing account → link it.
 * 3. Otherwise a new account (username made from the name/email; they can change it on the welcome screen).
 */
export async function userForProvider(provider: Provider, profile: ProviderProfile): Promise<{ user: User; isNew: boolean }> {
  const db = await getDb();
  const linked = await db.query.oauthAccounts.findFirst({ where: and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerUserId, profile.sub)) });
  if (linked) {
    const u = await db.query.users.findFirst({ where: eq(users.id, linked.userId) });
    if (u) return { user: u, isNew: false };
  }
  const now = new Date();
  if (profile.email && profile.emailVerified) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, profile.email) });
    if (existing) {
      await db.insert(oauthAccounts).values({ provider, providerUserId: profile.sub, userId: existing.id, email: profile.email, createdAt: now }).onConflictDoNothing();
      return { user: existing, isNew: false };
    }
  }
  const id = newId();
  // No password: store a hash of random bytes nobody knows, so password login can never match.
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
  const username = await uniqueUsername(baseUsername(profile));
  const email = profile.email && profile.emailVerified ? profile.email : `${provider}-${profile.sub}@users.myguide.invalid`;
  await db.insert(users).values({ id, email, username, displayName: profile.name?.trim() || username, passwordHash, createdAt: now });
  await db.insert(oauthAccounts).values({ provider, providerUserId: profile.sub, userId: id, email: profile.email, createdAt: now });
  const user = (await db.query.users.findFirst({ where: eq(users.id, id) }))!;
  return { user, isNew: true };
}

/** Which sign-in methods an account has, for a helpful message when a password login fails. */
export async function providersFor(userId: string): Promise<Provider[]> {
  const db = await getDb();
  const rows = await db.select({ p: oauthAccounts.provider }).from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  return rows.map((r) => r.p as Provider);
}
