"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guides, places, savedPlaces } from "../db/schema";
import { spotKey } from "../citySpots";
import { loadMyPlaces } from "../myPlaces";
import { TOP_PICK_MAX } from "../topPicks";
import { UserError } from "../userError";


/**
 * Top pick (crown, 1 Nov 2026): one of your best vouched spots in a city. Public, up to
 * TOP_PICK_MAX per city. Only spots you vouch for can be top picks. Making one clears its Must try.
 */
export async function setTopPick(placeId: string, on: boolean): Promise<{ on: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Sign in first.", "auth");
  const db = await getDb();
  const { items } = await loadMyPlaces(user.id);
  const me = items.find((it) => it.place.id === placeId);
  if (!me) throw new UserError("That isn't one of your spots.", "forbidden");
  if (on) {
    if (!me.recommended) throw new UserError("Vouch for it first. Top picks are spots you vouch for.", "invalid");
    const key = spotKey(me.place);
    const picks = items.filter((it) => it.city === me.city && it.recommended && it.place.topPickAt && spotKey(it.place) !== key).length;
    if (picks >= TOP_PICK_MAX)
      throw new UserError(`You have ${TOP_PICK_MAX} top picks${me.city ? ` in ${me.city}` : ""}. Remove one to add another.`, "invalid");
  }
  await db.update(places).set(on ? { topPickAt: new Date(), mustTryAt: null } : { topPickAt: null }).where(eq(places.id, placeId));
  revalidatePath("/my-places");
  revalidatePath("/city");
  return { on };
}

/**
 * Must try (star, 1 Nov 2026): a spot you haven't been to and want to prioritise. Private. Works on
 * your own spots (e.g. added from 50 Best, kept private) and on friends' spots you saved.
 */
export async function setMustTry(placeId: string, on: boolean): Promise<{ on: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Sign in first.", "auth");
  const db = await getDb();
  const at = on ? new Date() : null;
  const own = await db
    .select({ id: places.id })
    .from(places)
    .innerJoin(guides, eq(guides.id, places.guideId))
    .where(and(eq(places.id, placeId), eq(guides.ownerId, user.id)))
    .limit(1);
  if (own.length) {
    await db.update(places).set({ mustTryAt: at }).where(eq(places.id, placeId));
  } else {
    const res = await db.update(savedPlaces).set({ mustTryAt: at }).where(and(eq(savedPlaces.userId, user.id), eq(savedPlaces.placeId, placeId)));
    if (!res.rowsAffected) throw new UserError("Save it first to star it.", "invalid");
  }
  revalidatePath("/my-places");
  return { on };
}
