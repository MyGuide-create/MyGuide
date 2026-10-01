// Reset a MyGuide user's password on the LIVE database (pilot-only helper).
// Usage, from the MyGuide folder:
//   node scripts/reset-password.mjs someone@email.com NewPassword123
// Reads the live database address and token from .env.vercel.
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client/web";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error("Usage: node scripts/reset-password.mjs <email or username> <new password, 8+ characters>");
  process.exit(1);
}
const env = Object.fromEntries(
  fs.readFileSync(".env.vercel", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const db = createClient({ url: env.DATABASE_URL.replace(/^libsql:/, "https:"), authToken: env.DATABASE_AUTH_TOKEN });
const who = email.trim().toLowerCase().replace(/^@/, "");
const found = await db.execute({ sql: "select id, email, username from users where email = ? or username = ?", args: [who, who] });
if (!found.rows.length) {
  console.error(`No account found for "${email}".`);
  process.exit(1);
}
const user = found.rows[0];
await db.execute({ sql: "update users set password_hash = ? where id = ?", args: [await bcrypt.hash(password, 10), user.id] });
console.log(`Password reset for @${user.username} (${user.email}). They can log in with the new password now.`);
