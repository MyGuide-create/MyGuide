"use server";

import { eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { isAdmin } from "../admin";
import { getCurrentUser, hashPassword } from "../auth";
import { getDb } from "../db";
import { users } from "../db/schema";
import { signUpInfo } from "../oauthUsers";

// Short, easy to read out or type on a phone: "olive-harbour-tram-47".
const WORDS = [
  "olive", "harbour", "tram", "lantern", "cedar", "market", "saffron", "dune", "lagoon", "ferry", "garden", "maple",
  "pepper", "terrace", "canyon", "bridge", "orchard", "piazza", "souk", "atlas", "coral", "fig", "glacier", "island",
  "jasmine", "kettle", "lemon", "meadow", "nectar", "oasis", "palm", "quarry", "river", "sunset", "tulip", "valley",
  "willow", "zest", "bazaar", "cobble", "delta", "ember", "fjord", "grove", "hazel", "inlet", "juniper", "kiosk",
  "lotus", "mango", "nutmeg", "opal", "pebble", "quince", "rooftop", "sorbet", "tide", "umber", "vista", "wharf",
];

function tempPassword(): string {
  const w = () => WORDS[randomInt(WORDS.length)];
  return `${w()}-${w()}-${w()}-${randomInt(10, 100)}`;
}

export type ResetPasswordResult =
  | { ok: true; password: string; username: string; email: string }
  | { ok: false; error: string };

/**
 * Admin › Users: give someone a temporary password (generated, or one the admin typed).
 * It's returned once for the admin to copy and send; only its hash is stored.
 * Refused for Google/Apple sign-ups — they have no password to reset.
 */
export async function resetUserPassword(userId: string, custom?: string): Promise<ResetPasswordResult> {
  const me = await getCurrentUser();
  if (!me || !isAdmin(me)) return { ok: false, error: "Admins only." };
  const db = await getDb();
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return { ok: false, error: "That account no longer exists." };
  const info = (await signUpInfo([target])).get(target.id);
  if (info && info.method !== "email") {
    return { ok: false, error: `@${target.username} signs in with ${info.method === "google" ? "Google" : "Apple"} — there's no password to reset.` };
  }
  const password = (custom ?? "").trim() || tempPassword();
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, target.id));
  return { ok: true, password, username: target.username, email: target.email };
}
