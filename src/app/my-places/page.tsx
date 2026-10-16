import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideNudge } from "@/components/GuideNudge";
import { ChevronDown, EditIcon, PinIcon, PlusIcon } from "@/components/Icons";
import { PlaceTile } from "@/components/PlaceTile";
import { RecommendToggle } from "@/components/RecommendToggle";
import { EmptyState, LinkButton, cx } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadMyPlaces, NUDGE_MIN, unguidedByCity, type MyPlace } from "@/lib/myPlaces";
import { placeArea } from "@/lib/places/neighbourhood";
import { cityAnchor } from "@/lib/stash";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "My places" };

/**
 * My places: every place you've added, grouped by city ("My Lisbon"). Private unless you recommend
 * them: a recommended place shows on its city page's spots without needing a guide. Places you put
 * straight into one of your guides show here too. Group them into guides any time.
 */
export default async function MyPlacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/my-places");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { stash, items } = await loadMyPlaces(user.id);
  const unguided = unguidedByCity(items);

  // Just imported: say what happened (and link the guide if one was made).
  const imported = Number(one("imported") || NaN);
  const already = Number(one("already") || 0);
  const madeSlug = one("guide");
  const made = madeSlug ? await (await getDb()).query.guides.findFirst({ where: (g, { and, eq }) => and(eq(g.slug, madeSlug), eq(g.ownerId, user.id)) }) : undefined;

  const groups = new Map<string, MyPlace[]>();
  for (const it of items) groups.set(it.city, [...(groups.get(it.city) ?? []), it]);
  const focus = one("city").trim().toLowerCase();
  // The city you just added to first, then biggest first; places with no city last.
  const sorted = [...groups.entries()].sort((a, b) =>
    !a[0] ? 1 : !b[0] ? -1 : Number(b[0].toLowerCase() === focus) - Number(a[0].toLowerCase() === focus) || b[1].length - a[1].length,
  );
  // The import result sits at the top of the imported city (where the page scrolls to), else under the header.
  const focusShown = !!focus && sorted.some(([c]) => c.toLowerCase() === focus);
  const importBanner = (
    <div className="mb-2.5 rounded-2xl bg-sage-tint px-3.5 py-2.5 text-[13px] leading-snug" role="status">
      <b className="font-semibold">Added {imported} place{imported === 1 ? "" : "s"}.</b>
      {already > 0 && <> {already} {already === 1 ? "was" : "were"} already here.</>}
      {made && (
        <>
          {" "}Your guide <Link href={`/g/${made.slug}/edit`} className="font-semibold underline underline-offset-2">{made.title}</Link> is ready as a draft.
        </>
      )}
    </div>
  );
  const sharedCount = items.filter((p) => p.inStash && p.place.sharedAt).length;
  const n = items.length;

  return (
    <AppShell>
      <TopBar back={`/u/${user.username}`} title={null} avatarUser={toPublicUser(user)} />
      <header className="px-5 pt-2 pb-4">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-terracotta-tint text-terracotta flex items-center justify-center shrink-0"><PinIcon size={24} /></span>
          <div className="min-w-0">
            <h1 className="font-display text-[32px] leading-none">My places</h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              {n ? `${n} place${n === 1 ? "" : "s"} you've added · only you can see the private ones` : "Every place you add lands here"}
            </p>
          </div>
        </div>
        {Number.isFinite(imported) && !focusShown && <div className="mt-3">{importBanner}</div>}
        {n > 0 && (
          <p className="mt-3 text-[12.5px] leading-snug text-ink-muted">
            {sharedCount ? `${sharedCount} recommended. ` : ""}Tap <span className="font-semibold text-ink">Recommend</span> on a place to share it. Recommended places show on their city&apos;s page for friends, no guide needed.
          </p>
        )}
        {n > 0 && (
          <div className="mt-4 flex gap-2.5">
            {stash && items.some((i) => i.inStash) ? <LinkButton href="/saved/sort" className="flex-1">Make a guide from these</LinkButton> : <span className="flex-1" />}
            {stash && items.some((i) => i.inStash) && (
              <LinkButton href={`/g/${stash.slug}/edit`} variant="outline" aria-label="Edit or remove places"><EditIcon size={15} /> Edit</LinkButton>
            )}
            <LinkButton href="/record" variant="outline"><PlusIcon size={15} /> Add</LinkButton>
          </div>
        )}
      </header>

      <main className="px-4 pb-8 flex flex-col gap-6">
        {n === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Out somewhere you love? Tap + to add it. Got a Google Maps list? Import it and every place comes in."
            action={
              <div className="flex gap-2 justify-center">
                <LinkButton href="/record" size="sm">Add a place</LinkButton>
                <LinkButton href="/create?import=1" size="sm" variant="outline">Import a list</LinkButton>
              </div>
            }
          />
        ) : (
          sorted.map(([city, rows]) => {
            const privateIds = rows.filter((p) => p.inStash && !p.place.sharedAt).map((p) => p.place.id);
            const loose = unguided.get(city)?.length ?? 0;
            return (
              // Tap a city heading to collapse or expand it (native <details>, all open to start). The
              // "Recommend all" button sits outside <summary> so tapping it doesn't fold the city.
              <details key={city || "_none"} id={`city-${cityAnchor(city)}`} open className="group/city relative scroll-mt-16">
                <summary className={cx("list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none px-1 flex items-center gap-2 border-b border-line pb-1.5 group-open/city:mb-2.5 min-h-[36px]", city && privateIds.length > 1 && "pr-[136px]")}>
                  <h2 className="flex items-baseline gap-2 min-w-0">
                    <span className="font-display text-[21px] truncate">{city ? `My ${city}` : "Other places"}</span>
                    <span className="text-[12px] text-ink-faint">{rows.length}</span>
                  </h2>
                  <ChevronDown size={18} aria-hidden className="shrink-0 text-ink-muted transition-transform -rotate-90 group-open/city:rotate-0" />
                </summary>
                {city && privateIds.length > 1 && (
                  <span className="absolute right-1 top-0 h-[36px] flex items-center">
                    <RecommendToggle variant="all" placeIds={privateIds} shared={false} city={city} />
                  </span>
                )}
                {Number.isFinite(imported) && focusShown && city.toLowerCase() === focus && importBanner}
                {city && loose >= NUDGE_MIN && <GuideNudge city={city} count={loose} className="mb-2.5" />}
                <ul className="flex flex-col gap-2">
                  {rows.map((it) => {
                    const p = it.place;
                    const words = (p.special || p.note || "").trim();
                    return (
                      <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-line/70 bg-paper pr-2.5 hover:border-terracotta-soft">
                        <Link href={it.href} className="flex-1 min-w-0 flex gap-3 items-center p-2.5">
                          <PlaceTile place={p} size={56} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-semibold text-[14.5px] truncate">{p.name}</span>
                            <span className="block text-[12px] text-ink-muted truncate">{[p.category, placeArea(p)].filter(Boolean).join(" · ")}</span>
                            {words ? (
                              <span className="block text-[12px] text-ink italic truncate">“{words}”</span>
                            ) : (
                              <span className="block text-[11.5px] text-ink-faint">Added {timeAgo(p.createdAt)}</span>
                            )}
                            {it.inGuides.length > 0 && (
                              <span className="block text-[11.5px] text-sage truncate">In {it.inGuides.map((g) => g.title).join(", ")}</span>
                            )}
                          </span>
                        </Link>
                        {it.inStash && <RecommendToggle variant="pill" placeIds={[p.id]} shared={!!p.sharedAt} city={city} />}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })
        )}
      </main>
    </AppShell>
  );
}
