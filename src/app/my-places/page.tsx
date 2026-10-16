import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideNudge } from "@/components/GuideNudge";
import { BookmarkIcon, ChevronDown, EditIcon, PlusIcon } from "@/components/Icons";
import { CityTileImage } from "@/components/CityImage";
import { GuideCover } from "@/components/GuideCover";
import { PlaceTile } from "@/components/PlaceTile";
import { RecommendToggle } from "@/components/RecommendToggle";
import { EmptyState, LinkButton, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadMyPlaces, NUDGE_MIN, unguidedByCity, type MyPlace } from "@/lib/myPlaces";
import { placeArea } from "@/lib/places/neighbourhood";
import { cityAnchor } from "@/lib/stash";
import { cityPhotoKey, cityPhotosFor } from "@/lib/cityPhotos";
import { listGuidesByOwner, listSavedGuides, listSavedPlaces } from "@/lib/guides";
import { tidyCity } from "@/lib/places/cityName";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "My spots" };

/**
 * My spots (the tab, 16 Oct 2026): your cities as tiles, with Yours (every place you've added) and
 * Saved (other people's spots you bookmarked). A city tile opens that city's list ("My Lisbon"),
 * or for Saved, the city page filtered to your saved spots. Below Yours: your guides.
 *
 * My spots: every place you've added, grouped by city ("My Lisbon"). Private unless you recommend
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
  const tab = one("tab") === "saved" ? "saved" : "yours";
  // A city picked (or just imported into): that city's list. Otherwise the tiles.
  const isFocus = (c: string) => (focus === "_other" ? c === "" : !!c && c.toLowerCase() === focus);
  const cityView = !!focus && [...groups.keys()].some(isFocus);
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
  const n = items.length;

  if (cityView) {
    const focusCity = sorted.find(([c]) => isFocus(c))![0];
    const cityRows = groups.get(focusCity) ?? [];
    const cityShared = cityRows.filter((p) => p.inStash && p.place.sharedAt).length;
    return (
      <AppShell>
        <TopBar back="/my-places" title={null} />
        <header className="px-5 pt-2 pb-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-[32px] leading-none">{focusCity || "Other places"}</h1>
              <p className="mt-1 text-[13px] text-ink-muted">
                Your spots here{cityShared ? ` · ${cityShared} recommended` : ""}
              </p>
            </div>
          </div>
          {Number.isFinite(imported) && !focusShown && <div className="mt-3">{importBanner}</div>}
          <p className="mt-3 text-[12.5px] leading-snug text-ink-muted">
            Tap <span className="font-semibold text-ink">Recommend</span> on a place to share it. Recommended places show on {focusCity ? `the ${focusCity}` : "their city\u2019s"} page for friends, no guide needed.
          </p>
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
            sorted.filter(([c]) => isFocus(c)).map(([city, rows]) => {
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

  // ---- The tab: city tiles ----
  const [saved, savedGuides, ownGuides] = await Promise.all([listSavedPlaces(user.id), listSavedGuides(user.id), listGuidesByOwner(user.id, user.id)]);
  const savedByCity = new Map<string, { city: string; country: string; n: number }>();
  for (const sv of saved) {
    const city = tidyCity(sv.place.city) || sv.place.country || "";
    if (!city) continue;
    const k = city.toLowerCase();
    const cur = savedByCity.get(k) ?? { city, country: sv.place.country ?? "", n: 0 };
    cur.n++;
    savedByCity.set(k, cur);
  }
  const yourTiles = sorted
    .filter(([c]) => !!c)
    .map(([city, rows]) => ({ city, country: rows.find((r) => r.place.country)?.place.country ?? "", n: rows.length, shared: rows.filter((r) => r.inStash && r.place.sharedAt).length }));
  const otherCount = groups.get("")?.length ?? 0;
  const savedTiles = [...savedByCity.values()].sort((a, b) => b.n - a.n);
  const photos = await cityPhotosFor(
    [...yourTiles, ...savedTiles].map((t) => t.city),
    new Map([...yourTiles, ...savedTiles].filter((t) => t.country).map((t) => [cityPhotoKey(t.city), t.country])),
  );
  const tabLink = (t: "yours" | "saved", label: string, count: number) => (
    <Link
      href={t === "saved" ? "/my-places?tab=saved" : "/my-places"}
      replace
      aria-current={tab === t ? "page" : undefined}
      className={cx("flex-1 text-center rounded-full py-2 text-[13.5px]", tab === t ? "bg-paper font-semibold shadow-sm" : "text-ink-muted font-medium")}
    >
      {label} <span className="tabular-nums text-ink-faint">· {count}</span>
    </Link>
  );

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-[32px] leading-none">My spots</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">Your places in every city, and the ones you&apos;ve saved from friends.</p>
        <div role="tablist" aria-label="My spots" className="mt-4 flex rounded-full bg-cream-deep/70 p-[3px]">
          {tabLink("yours", "Yours", n)}
          {tabLink("saved", "Saved", saved.length)}
        </div>
        {Number.isFinite(imported) && <div className="mt-3">{importBanner}</div>}
      </header>

      <main className="px-5 pb-8 flex flex-col gap-7">
        {tab === "yours" ? (
          <>
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
              <>
                <div className="grid grid-cols-2 gap-3">
                  {yourTiles.map((t) => (
                    <Link key={t.city} href={`/my-places?city=${encodeURIComponent(t.city)}`} className="flex flex-col gap-1.5 min-w-0">
                      <CityTileImage photo={photos.get(cityPhotoKey(t.city))} city={t.city} className="h-[132px]" />
                      <span className="px-0.5 text-[12.5px] text-ink-muted">
                        <b className="font-semibold text-ink">{t.n} spot{t.n === 1 ? "" : "s"}</b>
                        {t.shared ? ` · ${t.shared} recommended` : ""}
                      </span>
                    </Link>
                  ))}
                  {otherCount > 0 && (
                    <Link href="/my-places?city=_other" className="h-[132px] rounded-2xl border border-line bg-paper flex flex-col items-center justify-center text-center px-3">
                      <span className="font-semibold text-[14px]">Other places</span>
                      <span className="text-[12px] text-ink-muted">{otherCount} without a city</span>
                    </Link>
                  )}
                  <span className="h-[132px] rounded-2xl border-[1.5px] border-dashed border-cream-line flex flex-col items-center justify-center gap-1.5 text-center px-3 text-ink-muted">
                    <Link href="/record" className="flex flex-col items-center gap-1 text-[13px] font-medium"><PlusIcon size={18} /> Add a spot</Link>
                    <Link href="/create?import=1" className="text-[12px] text-terracotta-deep font-medium">or import a list</Link>
                  </span>
                </div>
              </>
            )}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-[22px]">Your guides</h2>
                <Link href={stash && items.some((i) => i.inStash) ? "/saved/sort" : "/create"} className="text-[13px] font-semibold text-terracotta-deep">+ New guide</Link>
              </div>
              {ownGuides.length === 0 ? (
                <p className="text-[13px] text-ink-muted">Group spots into a guide to share a trip, a theme or a whole city.</p>
              ) : (
                <ul className="flex flex-col rounded-2xl border border-line bg-paper divide-y divide-line overflow-hidden">
                  {ownGuides.map((g) => (
                    <li key={g.guide.id}>
                      <Link href={`/g/${g.guide.slug}`} className="flex items-center gap-3 px-3 py-2.5">
                        <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="w-12 h-12 rounded-xl shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-[14.5px] truncate">{g.guide.title}</span>
                          <span className="block text-[12px] text-ink-muted truncate">
                            {g.placeCount} spot{g.placeCount === 1 ? "" : "s"} · {!g.guide.publishedAt ? "Draft" : g.guide.visibility === "public" ? "Public" : "Private"}
                          </span>
                        </span>
                        <span aria-hidden className="text-ink-faint">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            {savedTiles.length === 0 ? (
              <EmptyState
                title="Nothing saved yet"
                body="Tap Save on a friend’s spot to keep it here, your own shortlist for the trip. Been and loved it? Tap Recommend on the spot."
                action={<LinkButton href="/" size="sm">Explore cities</LinkButton>}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {savedTiles.map((t) => (
                  <Link key={t.city} href={`/city?${new URLSearchParams({ name: t.city, ...(t.country ? { country: t.country } : {}), list: "want" }).toString()}`} className="flex flex-col gap-1.5 min-w-0">
                    <CityTileImage photo={photos.get(cityPhotoKey(t.city))} city={t.city} className="h-[132px]" />
                    <span className="px-0.5 text-[12.5px] text-ink-muted inline-flex items-center gap-1">
                      <BookmarkIcon size={12} filled className="text-terracotta" />
                      <b className="font-semibold text-ink">{t.n} saved</b>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link href="/saved?tab=guides" className="flex items-center justify-between rounded-2xl border border-line bg-paper px-4 py-3">
              <span>
                <span className="block font-semibold text-[14.5px]">Saved guides</span>
                <span className="block text-[12.5px] text-ink-muted">{savedGuides.length ? `${savedGuides.length} whole guide${savedGuides.length === 1 ? "" : "s"}` : "Bookmark a guide to keep the whole thing"}</span>
              </span>
              <span aria-hidden className="text-ink-faint">›</span>
            </Link>
            <Link href="/saved" className="text-center text-[13px] font-medium text-ink-muted">See every saved spot as a list</Link>
          </>
        )}
      </main>
    </AppShell>
  );
}
