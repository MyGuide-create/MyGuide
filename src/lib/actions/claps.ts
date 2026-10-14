"use server";

import { and, desc, eq, gt } from "drizzle-orm";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { claps, guides, notifications, users } from "../db/schema";
import { hiddenUserIds } from "../blocks";
import { addNotifications } from "../notifications";
import { CLAP_NOTES, type ClapKind } from "../clapTargets";
import { UserError } from "../userError";
import { newId } from "../utils";

interface ClapInput {
  kind: ClapKind;
  target: string;
  ownerId: string;
  /** The post's city (spots), for the notification. */
  city?: string;
  /** How many spots the post had. */
  count?: number;
}

async function checked(input: ClapInput) {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Log in to clap.", "auth");
  const { kind, target, ownerId } = input;
  if (kind !== "spots" && kind !== "guide") throw new UserError("Can't clap for that.", "invalid");
  if (!target || target.length > 300 || !ownerId) throw new UserError("Can't clap for that.", "invalid");
  if (ownerId === user.id) throw new UserError("That's your own post.", "invalid");
  if (kind === "spots" && !target.startsWith(`${ownerId}|`)) throw new UserError("Can't clap for that.", "invalid");
  const db = await getDb();
  if (kind === "guide") {
    const g = await db.query.guides.findFirst({ where: eq(guides.id, target), columns: { ownerId: true } });
    if (!g || g.ownerId !== ownerId) throw new UserError("That guide is gone.", "gone");
  }
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { id: true } });
  if (!owner || (await hiddenUserIds(user.id)).has(ownerId)) throw new UserError("Can't clap for that.", "forbidden");
  return { user, db };
}

/** The clap notification this person sent for this post lately (so re-clapping doesn't ping twice). */
async function recentClapNotification(db: Awaited<ReturnType<typeof getDb>>, actorId: string, input: ClapInput) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.type, "clap"), eq(notifications.actorId, actorId), eq(notifications.userId, input.ownerId), gt(notifications.createdAt, since)))
    .orderBy(desc(notifications.createdAt))
    .limit(20);
  return rows.find((n) => (input.kind === "guide" ? n.guideId === input.target : !n.guideId && (n.city ?? "").toLowerCase() === (input.city ?? "").trim().toLowerCase()));
}

/** 👏 on (or off) a friend's post. Clapping tells them once; nothing is saved to your places. */
export async function setClap(input: ClapInput & { on: boolean }): Promise<void> {
  const { user, db } = await checked(input);
  if (!input.on) {
    await db.delete(claps).where(and(eq(claps.userId, user.id), eq(claps.kind, input.kind), eq(claps.target, input.target)));
    return;
  }
  await db
    .insert(claps)
    .values({ id: newId(), userId: user.id, ownerId: input.ownerId, kind: input.kind, target: input.target, createdAt: new Date() })
    .onConflictDoNothing();
  if (await recentClapNotification(db, user.id, input)) return;
  await addNotifications([
    {
      id: newId(),
      userId: input.ownerId,
      type: "clap",
      actorId: user.id,
      guideId: input.kind === "guide" ? input.target : null,
      city: input.kind === "spots" ? (input.city ?? "").trim().slice(0, 80) || null : null,
      count: Math.max(1, Math.min(999, Math.round(input.count ?? 1))),
      createdAt: new Date(),
    },
  ]);
}

/** The one-tap note with your clap ("Must try"); null clears it. Shows on their notification. */
export async function setClapNote(input: ClapInput & { note: string | null }): Promise<void> {
  const { user, db } = await checked(input);
  const note = input.note && (CLAP_NOTES as readonly string[]).includes(input.note) ? input.note : null;
  await db.update(claps).set({ note }).where(and(eq(claps.userId, user.id), eq(claps.kind, input.kind), eq(claps.target, input.target)));
  const n = await recentClapNotification(db, user.id, input);
  if (n) await db.update(notifications).set({ note, readAt: null }).where(eq(notifications.id, n.id));
}
