import { and, asc, eq } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { SortSaved } from "@/components/SortSaved";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, places } from "@/lib/db/schema";
import { listGuidesByOwner } from "@/lib/guides";
import { canonicalCity } from "@/lib/places/cities";
import { placeArea } from "@/lib/places/neighbourhood";
import { STASH_TITLE } from "@/lib/stash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Make a guide from Saved places" };

/** Tick places in your Saved places and move (or copy) them into a new or existing guide. */
export default async function SortSavedPage() {
  const user = await requireUser("/saved/sort");
  const db = await getDb();
  const stash = await db.query.guides.findFirst({ where: and(eq(guides.ownerId, user.id), eq(guides.title, STASH_TITLE)) });
  const rows = stash ? await db.select().from(places).where(eq(places.guideId, stash.id)).orderBy(asc(places.position), asc(places.createdAt)) : [];
  const mine = (await listGuidesByOwner(user.id, user.id)).filter((g) => g.guide.id !== stash?.id);
  return (
    <AppShell nav={false}>
      <TopBar back="/saved/places" title="Make a guide" avatarUser={toPublicUser(user)} />
      {rows.length === 0 ? (
        <div className="px-4 pt-6">
          <EmptyState
            title="Nothing in Saved places yet"
            body="Use Record a place (the + button) when you're out, then tap Save to my Saved places. Sort them into guides here later."
            action={<LinkButton href="/record" size="sm">Record a place</LinkButton>}
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
        />
      )}
    </AppShell>
  );
}
