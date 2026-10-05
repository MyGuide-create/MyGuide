import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { pushSubscriptions } from "./db/schema";

let configured: boolean | null = null;

export function pushPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function configure(): boolean {
  if (configured !== null) return configured;
  const pub = pushPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:hello@myguide.app", pub, priv);
  return (configured = true);
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Buttons on the notification (Android / desktop; iPhone ignores them and just opens `url`). */
  actions?: { action: string; title: string }[];
  /** For the "follow-back" action: who to follow. */
  followUserId?: string;
}

/** Best-effort push to every device a user has subscribed. Never throws. */
export async function sendPush(userIds: string[], message: PushMessage): Promise<void> {
  if (!userIds.length || !configure()) return;
  try {
    const db = await getDb();
    const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, [...new Set(userIds)]));
    const payload = JSON.stringify(message);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // 404/410: the browser unsubscribed — forget it.
          if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
      }),
    );
  } catch (e) {
    console.warn("[push]", e);
  }
}
