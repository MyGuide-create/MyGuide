"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { guides, places, type Place } from "../db/schema";
import { canonicalCity, findCityExact } from "../places/cities";
import { isReservedTitle } from "../stash";
import { copyPlaceExtras, findStash } from "../myPlaces";
import { spotKey } from "../citySpots";
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
 * My places → a guide. Copies the ticked places into a new or existing guide, keeping them in My
 * places (`keepCopy`, the default since 12 Oct 2026), or moves them. Notes, tips, photos and branches
 * go with them. Places the guide already has are skipped.
 */
export async function fileSavedPlaces(input: {
  placeIds: string[];
  guideId?: string;
  newTitle?: string;
  keepCopy?: boolean;
}): Promise<{ slug: string; created: boolean; count: number; already: number }> {
  const user = await getCurrentUser();
  if (!user) throw new UserError("Please log in.", "auth");
  const db = await getDb();
  const stash = await findStash(user.id);
  if (!stash) throw new UserError("You haven't added any places yet.", "invalid");
  const ids = [...new Set(input.placeIds)].slice(0, 200);
  if (!ids.length) throw new UserError("Tick at least one place.", "invalid");
  let picked = await db.select().from(places).where(and(eq(places.guideId, stash.id), inArray(places.id, ids)));
  if (!picked.length) throw new UserError("Those places aren't in My places any more.", "invalid");
  // Keep the order they had in My places.
  picked.sort((a, b) => a.position - b.position);

  const now = new Date();
  let target;
  let created = false;
  if (input.guideId) {
    target = await db.query.guides.findFirst({ where: eq(guides.id, input.guideId) });
    if (!target || target.ownerId !== user.id) throw new UserError("You can only add to your own guides.", "forbidden");
    if (target.id === stash.id) throw new UserError("They're already in My places.", "invalid");
  } else {
    const title = (input.newTitle ?? "").trim().slice(0, 120);
    if (!title) throw new UserError("Give your guide a title.", "invalid");
    if (isReservedTitle(title)) throw new UserError("“My places” is the name of your own list — give the guide another title.", "invalid");
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

  // New places go to the top of the guide, in their My places order. Ones the guide already has are skipped.
  const inTarget = await db.select().from(places).where(eq(places.guideId, target.id));
  const have = new Set(inTarget.map(spotKey));
  const total = picked.length;
  picked = picked.filter((p) => !have.has(spotKey(p)));
  const min = inTarget.reduce((m, p) => Math.min(m, p.position), 0);
  const start = min - picked.length;

  if (!input.keepCopy) {
    for (let i = 0; i < picked.length; i++) {
      await db.update(places).set({ guideId: target.id, position: start + i }).where(eq(places.id, picked[i].id));
    }
  } else if (picked.length) {
    const pairs: Array<[string, string]> = picked.map((p) => [p.id, newId()]);
    const newIdOf = new Map(pairs);
    await db.insert(places).values(picked.map((p, i) => ({ ...p, id: newIdOf.get(p.id)!, guideId: target.id, position: start + i, createdAt: now, sharedAt: null })));
    await copyPlaceExtras(pairs);
  }

  await db.update(guides).set({ updatedAt: now }).where(inArray(guides.id, [target.id, stash.id]));
  for (const slug of [target.slug, stash.slug]) {
    revalidatePath(`/g/${slug}`);
    revalidatePath(`/g/${slug}/edit`);
  }
  revalidatePath("/saved");
  revalidatePath("/my-places");
  return { slug: target.slug, created, count: picked.length, already: total - picked.length };
}
