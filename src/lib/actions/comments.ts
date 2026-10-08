"use server";

import { UserError } from "../userError";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { placeComments, places } from "../db/schema";
import { canViewGuide, getGuideById } from "../guides";
import { addNotifications } from "../notifications";
import { hiddenUserIds } from "../blocks";
import { newId } from "../utils";

/** Leave a comment on a place inside a guide you can see (owner, approved follower, or explicit share). */
export async function addPlaceComment(placeId: string, body: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const text = body.trim().slice(0, 500);
  if (!text) throw new UserError("Say something first.", "invalid");

  const db = await getDb();
  const place = await db.query.places.findFirst({ where: eq(places.id, placeId) });
  if (!place) throw new UserError("That place no longer exists.", "gone");
  const guide = await getGuideById(place.guideId);
  if (!guide) throw new UserError("That guide no longer exists.", "gone");
  if (!(await canViewGuide(guide, user.id))) throw new UserError("You don't have access to this guide.", "forbidden");
  if ((await hiddenUserIds(user.id)).has(guide.ownerId)) throw new UserError("You can't comment on this guide.", "forbidden");

  await db.insert(placeComments).values({ id: newId(), placeId, authorId: user.id, body: text, createdAt: new Date() });

  if (guide.ownerId !== user.id) {
    await addNotifications([{
      id: newId(),
      userId: guide.ownerId,
      type: "place_comment",
      actorId: user.id,
      guideId: guide.id,
      placeId,
      createdAt: new Date(),
    }]);
  }
  revalidatePath(`/g/${guide.slug}`);
}

/** Edit your own comment. */
export async function editPlaceComment(commentId: string, body: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const text = body.trim().slice(0, 500);
  if (!text) throw new UserError("Say something first.", "invalid");
  const db = await getDb();
  const comment = await db.query.placeComments.findFirst({ where: eq(placeComments.id, commentId) });
  if (!comment || comment.authorId !== user.id) throw new UserError("You can only edit your own comments.", "forbidden");
  await db.update(placeComments).set({ body: text, editedAt: new Date() }).where(eq(placeComments.id, commentId));
  const place = await db.query.places.findFirst({ where: eq(places.id, comment.placeId) });
  if (place) {
    const guide = await getGuideById(place.guideId);
    if (guide) revalidatePath(`/g/${guide.slug}`);
  }
}

/** Remove your own comment. */
export async function deletePlaceComment(commentId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const comment = await db.query.placeComments.findFirst({ where: eq(placeComments.id, commentId) });
  if (!comment || comment.authorId !== user.id) return;
  const place = await db.query.places.findFirst({ where: eq(places.id, comment.placeId) });
  await db.delete(placeComments).where(eq(placeComments.id, commentId));
  if (place) {
    const guide = await getGuideById(place.guideId);
    if (guide) revalidatePath(`/g/${guide.slug}`);
  }
}
