import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { claps, users } from "./db/schema";
import { hiddenUserIds } from "./blocks";
import { clapKey, type ClapKind, type ClapSummary } from "./clapTargets";

/** Claps on these posts, for the viewer (blocked people left out). */
export async function loadClaps(viewerId: string | null | undefined, targets: Array<{ kind: ClapKind; target: string }>): Promise<Map<string, ClapSummary>> {
  const out = new Map<string, ClapSummary>();
  const keys = [...new Set(targets.map((t) => t.target))];
  if (!keys.length) return out;
  const db = await getDb();
  const [rows, hidden] = await Promise.all([
    db
      .select({ kind: claps.kind, target: claps.target, userId: claps.userId, note: claps.note, name: users.displayName })
      .from(claps)
      .innerJoin(users, eq(users.id, claps.userId))
      .where(inArray(claps.target, keys))
      .orderBy(desc(claps.createdAt)),
    hiddenUserIds(viewerId),
  ]);
  for (const r of rows) {
    if (hidden.has(r.userId)) continue;
    const k = clapKey(r.kind as ClapKind, r.target);
    const s = out.get(k) ?? { count: 0, mine: false, myNote: null, names: [] };
    s.count++;
    if (r.userId === viewerId) {
      s.mine = true;
      s.myNote = r.note;
      s.names.unshift("You");
    } else s.names.push(r.name.split(" ")[0]);
    out.set(k, s);
  }
  return out;
}
