"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth";
import { getDb } from "../db";
import { trips } from "../db/schema";
import { findCity } from "../places/cities";
import { newId } from "../utils";

export interface TripState {
  error?: string;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function createTrip(_prev: TripState, formData: FormData): Promise<TripState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/trips");
  const rawCity = String(formData.get("city") ?? "").trim();
  if (rawCity.length < 2) return { error: "Where are you going?" };
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  if (start && !isDate(start)) return { error: "Check the start date." };
  if (end && !isDate(end)) return { error: "Check the end date." };
  if (start && end && end < start) return { error: "The trip ends before it starts." };
  const known = findCity(rawCity);
  const id = newId();
  const db = await getDb();
  await db.insert(trips).values({
    id,
    userId: user.id,
    city: known?.city ?? rawCity.replace(/\b\w/g, (c) => c.toUpperCase()),
    country: known?.country ?? "",
    startDate: start || null,
    endDate: end || null,
    createdAt: new Date(),
  });
  revalidatePath("/trips");
  redirect(`/trips/${id}`);
}

export async function deleteTrip(tripId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  await db.delete(trips).where(and(eq(trips.id, tripId), eq(trips.userId, user.id)));
  revalidatePath("/trips");
  redirect("/trips");
}
