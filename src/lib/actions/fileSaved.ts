"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guides, placeLocations, placePhotos, placeTips, places, type Place } from "../db/schema";
import { canonicalCity, findCityExact } from "../places/cities";
import { STASH_TITLE } from "../stash";
import { UserError } from "../userError";
import { newId, newToken, slugify } from "../utils";

async function uniqueSlug(title: string): Promise<string> {
  const db = await getDb();
  const base = slugify(title) || "guide";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${newId().slice(0, 6)}`;
    if (!(await db.query.guides.findFirst({ where: eq(guides.slug, slug) }))) return slug;
  }
  return `${base}-${newId()}`;
}

/** The most common city among these places ("" when none). */
function mainCity(rows: Place[]): { city: string; country: string } {
  const counts = new Map<string, { city: string; country: string; n: number }>();
  for (const p of rows) {
    if (!p.city?.trim()) continue;
    const city = canonicalCity(p.city);
    const k = city.toLowerCase();
    const e = counts.get(k) ?? { city, country: findCityExact(city)?.country ?? p.country ?? "", n: 0 };
    e.n++;
    counts.set(k, e);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best ? { city: best.city, country: best.country } : { city: "", country: "" };
}

/**
 * Saved places → a guide. Moves the ticked places out of the user's "Saved places" list into a new
 * or existing guide (or copies them, keeping the originals, when `keepCopy`). Notes, tips, photos and
 * branches go with them.
 */
export async function fileSavedPlaces(input: {
  placeIds: string[];
  guideId?: string;
  newTitle?: string;
  keepCopy?: boolean;
}): Promise<{ slug: string; created: boolean; count: number }> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Please log in.", "auth");
  const db = await getDb();
  const stash = await db.query.guides.findFirst({ where: and(eq(guides.ownerId, user.id), eq(guides.title, STASH_TITLE)) });
  if (!stash) throw new UserError("You don't have any saved places yet.", "invalid");
  const ids = [...new Set(input.placeIds)].slice(0, 200);
  if (!ids.length) throw new UserError("Tick at least one place.", "invalid");
  const picked = await db.select().from(places).where(and(eq(places.guideId, stash.id), inArray(places.id, ids)));
  if (!picked.length) throw new UserError("Those places aren't in your Saved places any more.", "invalid");
  // Keep the order they had in Saved places.
  picked.sort((a, b) => a.position - b.position);

  const now = new Date();
  let target;
  let created = false;
  if (input.guideId) {
    target = await db.query.guides.findFirst({ where: eq(guides.id, input.guideId) });
    if (!target || target.ownerId !== user.id) throw new UserError("You can only add to your own guides.", "forbidden");
    if (target.id === stash.id) throw new UserError("They're already in Saved places.", "invalid");
  } else {
    const title = (input.newTitle ?? "").trim().slice(0, 120);
    if (!title) throw new UserError("Give your guide a title.", "invalid");
    const where = mainCity(picked);
    const known = findCityExact(where.city);
    const id = newId();
    await db.insert(guides).values({
      id,
      ownerId: user.id,
      slug: await uniqueSlug(title),
      title,
      city: where.city,
      country: where.country,
      lat: known?.lat ?? null,
      lng: known?.lng ?? null,
      shareToken: newToken(),
      createdAt: now,
      updatedAt: now,
    });
    target = (await db.query.guides.findFirst({ where: eq(guides.id, id) }))!;
    created = true;
  }

  // New places go to the top of the guide, in their Saved places order.
  const [{ min }] = await db.select({ min: sql<number>`coalesce(min(${places.position}), 0)` }).from(places).where(eq(places.guideId, target.id));
  const start = Number(min) - picked.length;

  if (!input.keepCopy) {
    for (let i = 0; i < picked.length; i++) {
      await db.update(places).set({ guideId: target.id, position: start + i }).where(eq(places.id, picked[i].id));
    }
  } else {
    const pairs: Array<[string, string]> = picked.map((p) => [p.id, newId()]);
    const newIdOf = new Map(pairs);
    await db.insert(places).values(picked.map((p, i) => ({ ...p, id: newIdOf.get(p.id)!, guideId: target.id, position: start + i, createdAt: now, sharedAt: null })));
    const [tips, photos, branches] = await Promise.all([
      db.select().from(placeTips).where(inArray(placeTips.placeId, picked.map((p) => p.id))),
      db.select().from(placePhotos).where(inArray(placePhotos.placeId, picked.map((p) => p.id))),
      db.select().from(placeLocations).where(inArray(placeLocations.placeId, picked.map((p) => p.id))),
    ]);
    if (tips.length) await db.insert(placeTips).values(tips.map((t) => ({ ...t, id: newId(), placeId: newIdOf.get(t.placeId)!, createdAt: now })));
    if (photos.length) await db.insert(placePhotos).values(photos.map((t) => ({ ...t, id: newId(), placeId: newIdOf.get(t.placeId)!, createdAt: now })));
    if (branches.length) await db.insert(placeLocations).values(branches.map((t) => ({ ...t, id: newId(), placeId: newIdOf.get(t.placeId)!, createdAt: now })));
  }

  await db.update(guides).set({ updatedAt: now }).where(inArray(guides.id, [target.id, stash.id]));
  for (const slug of [target.slug, stash.slug]) {
    revalidatePath(`/g/${slug}`);
    revalidatePath(`/g/${slug}/edit`);
  }
  revalidatePath("/saved");
  return { slug: target.slug, created, count: picked.length };
}
