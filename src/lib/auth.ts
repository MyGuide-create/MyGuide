import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { users, type User } from "./db/schema";

const COOKIE = "mg_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET?.trim();
  if (s) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production (see .env.example)");
  }
  return new TextEncoder().encode("myguide-dev-secret-change-me");
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

async function sessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Current user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const id = await sessionUserId();
  if (!id) return null;
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  return user ?? null;
});

/** Redirect to login (remembering where we were) when signed out. */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export type PublicUser = Pick<User, "id" | "username" | "displayName" | "bio" | "avatarMediaId" | "accountType" | "profileVisibility">;

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    avatarMediaId: u.avatarMediaId,
    accountType: u.accountType,
    profileVisibility: u.profileVisibility,
  };
}
