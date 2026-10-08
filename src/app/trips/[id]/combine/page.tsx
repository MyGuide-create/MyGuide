import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { CombineFlow, type CombineGuide, type CombinePlace } from "@/components/CombineFlow";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, places, trips } from "@/lib/db/schema";
import { planTrip } from "@/lib/guides";
import { placeArea } from "@/lib/places/neighbourhood";
import { isReusable, placeKey } from "@/lib/reuse";

export const dynamic = "force-dynamic";
export const metadata = { title: "Combine guides" };

export default async function CombinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/trips/${id}/combine`);
  const db = await getDb();
  const trip = await db.query.trips.findFirst({ where: and(eq(trips.id, id), eq(trips.userId, user.id)) });
  if (!trip) notFound();
  const plan = await planTrip(user.id, trip.city);

  const seen = new Set<string>();
  const cards = [
    ...plan.savedGuides.map((c) => ({ c, why: "saved" as const })),
    ...plan.fromFollowing.map((c) => ({ c, why: "following" as const })),
    ...plan.more.map((c) => ({ c, why: "more" as const })),
  ].filter(({ c }) => isReusable(c.guide) && c.guide.id !== trip.guideId && !seen.has(c.guide.id) && seen.add(c.guide.id));

  const guideIds = cards.map(({ c }) => c.guide.id);
  const rows = guideIds.length ? await db.select().from(places).where(inArray(places.guideId, guideIds)).orderBy(places.position) : [];
  const tripGuide = trip.guideId ? await db.query.guides.findFirst({ where: eq(guides.id, trip.guideId) }) : undefined;
  const tripKeys = tripGuide ? new Set((await db.select().from(places).where(eq(places.guideId, tripGuide.id))).map(placeKey)) : new Set<string>();

  const preselect = typeof sp.g === "string" ? sp.g : null;
  const guideList: CombineGuide[] = cards.map(({ c, why }) => ({
    id: c.guide.id,
    title: c.guide.title,
    owner: { username: c.owner.username, displayName: c.owner.displayName },
    placeCount: rows.filter((p) => p.guideId === c.guide.id).length,
    notesShared: c.guide.allowFork,
    why,
    preselected: preselect ? preselect === c.guide.id : why === "saved",
  }));
  const placeList: CombinePlace[] = rows.map((p) => ({
    id: p.id,
    guideId: p.guideId,
    key: placeKey(p),
    name: p.name,
    category: p.category,
    area: placeArea(p),
    hasNote: !!p.note,
    inTripGuide: tripKeys.has(placeKey(p)),
  }));

  return (
    <AppShell nav={false}>
      <TopBar back={`/trips/${trip.id}`} title={`Combine · ${trip.city}`} avatarUser={toPublicUser(user)} />
      {guideList.length === 0 ? (
        <div className="px-4 pt-6">
          <EmptyState
            title={`No ${trip.city} guides to combine yet`}
            body="Only published, public guides can be combined. Save a few as you find them, or start your own."
            action={<LinkButton href={`/trips/${trip.id}`} size="sm">Back to the trip</LinkButton>}
          />
        </div>
      ) : (
        <CombineFlow
          tripId={trip.id}
          city={trip.city}
          guides={guideList}
          places={placeList}
          existing={tripGuide ? { title: tripGuide.title, slug: tripGuide.slug } : null}
        />
      )}
    </AppShell>
  );
}
