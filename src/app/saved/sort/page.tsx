import { asc, eq } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { SortSaved } from "@/components/SortSaved";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { listGuidesByOwner } from "@/lib/guides";
import { canonicalCity } from "@/lib/places/cities";
import { placeArea } from "@/lib/places/neighbourhood";
import { loadMyPlaces, unguidedByCity } from "@/lib/myPlaces";
import { myPlacesHref } from "@/lib/stash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Make a guide from My spots" };

/**
 * Tick places in My spots and copy (or move) them into a new or existing guide.
 * `?city=Lisbon` (the "Make them a guide?" nudge): that city's places not yet in a guide are ticked, starting at step 2.
 */
export default async function SortSavedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const cityParam = typeof sp.city === "string" ? sp.city.trim().slice(0, 80) : "";
  const user = await requireUser(cityParam ? `/saved/sort?city=${encodeURIComponent(cityParam)}` : "/saved/sort");
  const db = await getDb();
  const { stash, items } = await loadMyPlaces(user.id);
  const rows = stash ? await db.select().from(places).where(eq(places.guideId, stash.id)).orderBy(asc(places.position), asc(places.createdAt)) : [];
  const mine = (await listGuidesByOwner(user.id, user.id)).filter((g) => g.guide.id !== stash?.id);
  const city = cityParam ? canonicalCity(cityParam) : "";
  const preTicked = city ? [...unguidedByCity(items).entries()].find(([c]) => c.toLowerCase() === city.toLowerCase())?.[1] ?? [] : [];
  return (
    <AppShell nav={false}>
      <TopBar back={myPlacesHref(city)} title="Make a guide" avatarUser={toPublicUser(user)} />
      {rows.length === 0 ? (
        <div className="px-4 pt-6">
          <EmptyState
            title="Nothing in My spots yet"
            body="Tap + when you're somewhere you love to add it. Group your places into guides here whenever you like."
            action={<LinkButton href="/record" size="sm">Add a place</LinkButton>}
          />
        </div>
      ) : (
        <SortSaved
          places={rows.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            photoUrl: p.photoUrl,
            photoMediaId: p.photoMediaId,
            city: p.city?.trim() ? canonicalCity(p.city) : "",
            area: placeArea(p),
          }))}
          guides={mine.map((g) => ({ id: g.guide.id, title: g.guide.title, city: g.guide.city, placeCount: g.placeCount }))}
          preTicked={preTicked}
        />
      )}
    </AppShell>
  );
}
