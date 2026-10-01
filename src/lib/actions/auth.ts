"use server";

import { eq, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "../auth";
import { getDb } from "../db";
import { users } from "../db/schema";
import { newId } from "../utils";

export interface AuthState {
  error?: string;
}

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim().toLowerCase().replace(/^@/, "");
  const displayName = String(formData.get("displayName") ?? "").trim() || username;
  const next = safeNext(formData.get("next"));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  if (password !== String(formData.get("confirmPassword") ?? "")) return { error: "The two passwords don't match." };
  if (!USERNAME_RE.test(username)) return { error: "Usernames are 3–24 characters: letters, numbers, dots or underscores." };

  const db = await getDb();
  const existing = await db.query.users.findFirst({ where: or(eq(users.email, email), eq(users.username, username)) });
  if (existing) return { error: existing.email === email ? "That email already has an account." : "That username is taken." };

  const id = newId();
  await db.insert(users).values({
    id,
    email,
    username,
    displayName,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  });
  await createSession(id);
  redirect(next);
}

export async function logIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: or(eq(users.email, email), eq(users.username, email)) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Email or password didn't match." };
  }
  await createSession(user.id);
  redirect(next);
}

export async function logOut(): Promise<void> {
  await destroySession();
  redirect("/");
}
