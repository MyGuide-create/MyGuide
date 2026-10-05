import type { User } from "./db/schema";

/** Admins are listed by username in ADMIN_USERNAMES (comma-separated). Defaults to the founder account. */
export function adminUsernames(): string[] {
  return (process.env.ADMIN_USERNAMES || "hishamsamawi")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAdmin(user: Pick<User, "username"> | null | undefined): boolean {
  if (!user) return false;
  return adminUsernames().includes(user.username.toLowerCase());
}
