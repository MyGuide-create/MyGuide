import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { AppShell, TopBar } from "@/components/AppShell";
import { PinIcon, PlusIcon } from "@/components/Icons";
import { PlaceTile } from "@/components/PlaceTile";
import { RecommendToggle } from "@/components/RecommendToggle";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guides, places } from "@/lib/db/schema";
import { canonicalCity } from "@/lib/places/cities";
import { placeArea } from "@/lib/places/neighbourhood";
import { STASH_TITLE } from "@/lib/stash";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved places" };

/**
 * Places you recorded on the go, grouped by city. Private unless you recommend them: a recommended
 * place shows on its city page's spots without needing a guide. Sort them into guides any time.
 */
export default async function SavedPlacesPage() {
  const user = await requireUser("/saved/places");
  const db = await getDb();
  const stash = await db.query.guides.findFirst({ where: and(eq(guides.ownerId, user.id), eq(guides.title, STASH_TITLE)) });
  const rows = stash ? await db.select().from(places).where(eq(places.guideId, stash.id)).orderBy(asc(places.position), asc(places.createdAt)) : [];

  const groups = new Map<string, typeof rows>();
  for (const p of rows) {
    const city = p.city?.trim() ? canonicalCity(p.city) : "";
    groups.set(city, [...(groups.get(city) ?? []), p]);
  }
  const sharedCount = rows.filter((p) => p.sharedAt).length;
  const sorted = [...groups.entries()].sort((a, b) => (!a[0] ? 1 : !b[0] ? -1 : b[1].length - a[1].length));

  return (
    <AppShell>
      <TopBar back={`/u/${user.username}`} title={null} avatarUser={toPublicUser(user)} />
      <header className="px-5 pt-2 pb-4">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><PinIcon size={24} /></span>
          <div className="min-w-0">
            <h1 className="font-display text-[32px] leading-none">Saved places</h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              {rows.length
                ? `${rows.length} place${rows.length === 1 ? "" : "s"} you recorded on the go · ${sharedCount ? `${sharedCount} recommended` : "only you can see these"}`
                : "Only you can see these"}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <p className="mt-3 text-[12.5px] leading-snug text-ink-muted">
            Tap <span className="font-semibold text-ink">Private</span> to recommend a place. Recommended places show on their city&apos;s page for friends, no guide needed.
          </p>
        )}
        {rows.length > 0 && (
          <div className="mt-4 flex gap-2.5">
            <LinkButton href="/saved/sort" className="flex-1">Make a guide from these</LinkButton>
            <LinkButton href="/record" variant="outline"><PlusIcon size={15} /> Add</LinkButton>
          </div>
        )}
      </header>

      <main className="px-4 pb-8 flex flex-col gap-6">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            body="Out somewhere you love? Tap + › Record a place, then Save to my Saved places. Sort them into guides whenever you're ready."
            action={<LinkButton href="/record" size="sm">Record a place</LinkButton>}
          />
        ) : (
          sorted.map(([city, items]) => (
            <section key={city || "_none"}>
              <h2 className="px-1 flex items-baseline gap-2 border-b border-line pb-1.5 mb-2.5">
                <span className="font-display text-[21px]">{city || "Other places"}</span>
                <span className="text-[12px] text-ink-faint">{items.length}</span>
                {city && items.filter((p) => !p.sharedAt).length > 1 && (
                  <span className="ml-auto">
                    <RecommendToggle variant="all" placeIds={items.filter((p) => !p.sharedAt).map((p) => p.id)} shared={false} city={city} />
                  </span>
                )}
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-line/70 bg-paper pr-2.5 hover:border-terracotta-soft">
                    <Link href={`/g/${stash!.slug}/p/${p.id}`} className="flex-1 min-w-0 flex gap-3 items-center p-2.5">
                      <PlaceTile place={p} size={56} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-[14.5px] truncate">{p.name}</span>
                        <span className="block text-[12px] text-ink-muted truncate">{[p.category, placeArea(p)].filter(Boolean).join(" · ")}</span>
                        {p.note?.trim() || p.special?.trim() ? (
                          <span className="block text-[12px] text-ink italic truncate">“{(p.special || p.note).trim()}”</span>
                        ) : (
                          <span className="block text-[11.5px] text-ink-faint">Saved {timeAgo(p.createdAt)}</span>
                        )}
                      </span>
                    </Link>
                    <RecommendToggle variant="pill" placeIds={[p.id]} shared={!!p.sharedAt} city={city} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {rows.length > 0 && stash && (
          <Link href={`/g/${stash.slug}/edit`} className="self-center text-[12.5px] font-medium text-ink-muted underline underline-offset-2">Edit or remove places</Link>
        )}
      </main>
    </AppShell>
  );
}
