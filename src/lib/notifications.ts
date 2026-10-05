import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { follows, guides, notifications, places, users } from "./db/schema";
import { sendPush, type PushMessage } from "./push";

type NewNotification = typeof notifications.$inferInsert;

/** Insert in-app notifications and send a matching phone push (if the person turned push on). */
export async function addNotifications(rows: NewNotification[]): Promise<void> {
  if (!rows.length) return;
  const db = await getDb();
  await db.insert(notifications).values(rows);
  try {
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const guideIds = [...new Set(rows.map((r) => r.guideId).filter((x): x is string => !!x))];
    const placeIds = [...new Set(rows.map((r) => r.placeId).filter((x): x is string => !!x))];
    const [actors, gs, ps] = await Promise.all([
      actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : [],
      guideIds.length ? db.select().from(guides).where(inArray(guides.id, guideIds)) : [],
      placeIds.length ? db.select().from(places).where(inArray(places.id, placeIds)) : [],
    ]);
    const actor = new Map(actors.map((a) => [a.id, a]));
    const guide = new Map(gs.map((g) => [g.id, g]));
    const place = new Map(ps.map((p) => [p.id, p]));
    await Promise.all(
      rows.map(async (r) => {
        const a = r.actorId ? actor.get(r.actorId) : undefined;
        const g = r.guideId ? guide.get(r.guideId) : undefined;
        const p = r.placeId ? place.get(r.placeId) : undefined;
        const who = a?.displayName ?? "Someone";
        const n = r.count ?? 1;
        let title = "MyGuide";
        let body = "";
        let url = "/notifications";
        let extra: Pick<PushMessage, "actions" | "followUserId"> = {};
        switch (r.type) {
          case "guide_shared":
            title = `${who} shared a guide with you`;
            body = g?.title ?? "";
            if (g) url = `/g/${g.slug}`;
            break;
          case "new_follower":
            title = `${who} started following you`;
            if (a) {
              url = `/u/${a.username}`;
              // Offer "Follow back" right on the notification unless they already follow them.
              const already = await db.query.follows.findFirst({ where: and(eq(follows.followerId, r.userId), eq(follows.followingId, a.id)) });
              if (!already) {
                body = "Follow them back to see their guides in your feed.";
                extra = { actions: [{ action: "follow-back", title: "Follow back" }], followUserId: a.id };
              }
            }
            break;
          case "follow_request":
            title = `${who} wants to follow you`;
            body = "Accept or decline in Activity.";
            break;
          case "follow_accepted":
            title = `${who} accepted your follow request`;
            if (a) url = `/u/${a.username}`;
            break;
          case "place_comment":
            title = `${who} commented on ${p?.name ?? "a place"}`;
            body = g?.title ?? "";
            if (g) url = p ? `/g/${g.slug}/p/${p.id}` : `/g/${g.slug}`;
            break;
          case "guide_published":
            title = `${who} published a new guide`;
            body = [g?.title, g?.city].filter(Boolean).join(" · ");
            if (g) url = `/g/${g.slug}`;
            break;
          case "places_added":
            title = n === 1 && p ? `${who} added ${p.name}` : `${who} added ${n} places`;
            body = g ? `to ${g.title}` : "";
            if (g) url = n === 1 && p ? `/g/${g.slug}/p/${p.id}` : `/g/${g.slug}`;
            break;
          case "guide_used":
            title = `${who} used ${n} ${n === 1 ? "place" : "places"} from your guide`;
            body = g ? `${g.title} — for their own trip guide` : "";
            if (g) url = `/g/${g.slug}`;
            break;
          case "user_joined":
            title = `${shortName(a?.displayName ?? "Someone new")} just joined MyGuide`;
            if (a) {
              // By id: Google/Apple sign-ups may still change their @username on the welcome screen.
              url = `/people/${a.id}`;
              body = "Follow them to see their guides when they post.";
              extra = { actions: [{ action: "follow-back", title: "Follow" }], followUserId: a.id };
            }
            break;
          case "collab_invite":
            title = `${who} invited you to edit a guide`;
            body = g?.title ?? "";
            if (g) url = `/g/${g.slug}/edit`;
            break;
        }
        return sendPush([r.userId], { title, body, url, tag: r.guideId ? `${r.type}:${r.guideId}` : r.actorId ? `${r.type}:${r.actorId}` : r.type, ...extra });
      }),
    );
  } catch (e) {
    console.warn("[addNotifications] push failed", e);
  }
}

/** "Lina Khoury" → "Lina K." (push titles stay short and a little more private). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
