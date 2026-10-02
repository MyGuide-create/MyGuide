import type { User } from "./db/schema";

/** Admins are listed by username in ADMIN_USERNAMES (comma-separated). Defaults to the founder account. */
export function isAdmin(user: Pick<User, "username"> | null | undefined): boolean {
  if (!user) return false;
  const list = (process.env.ADMIN_USERNAMES || "hishamsamawi")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(user.username.toLowerCase());
}
