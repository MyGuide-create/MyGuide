import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideNudge } from "@/components/GuideNudge";
import { BookmarkIcon, EditIcon, PlusIcon } from "@/components/Icons";
import { CityImage, CityTileImage } from "@/components/CityImage";
import { GuideCover } from "@/components/GuideCover";
import { MySpotsCity, LAST_CITY_COOKIE, type MySpot } from "@/components/MySpotsCity";
import { cookies } from "next/headers";
import { nearestFirst, nearestKnownCity, nearKeyOf, viewerLocation } from "@/lib/nearby";
import { orderedCategories } from "@/lib/places/order";
import { EmptyState, LinkButton, cx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadMyPlaces, NUDGE_MIN, unguidedByCity, type MyPlace } from "@/lib/myPlaces";
import { placeArea } from "@/lib/places/neighbourhood";
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
  // The city you just added to first, then biggest first; places with no city last.
  const sorted = [...groups.entries()].sort((a, b) =>
    !a[0] ? 1 : !b[0] ? -1 : Number(b[0].toLowerCase() === focus) - Number(a[0].toLowerCase() === focus) || b[1].length - a[1].length,
  );
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

  // ---- One city, your own guide to it (16 Oct 2026): the city you're in opens first. ----
  const saved = await listSavedPlaces(user.id);
  const savedCity = (sv: (typeof saved)[number]) => tidyCity(sv.place.city) || sv.place.country || "";
  const ownCities = sorted.filter(([c]) => !!c).map(([city, rows]) => ({ city, spots: rows.length }));
  const here = await viewerLocation();
  const near = await nearestFirst(ownCities, here);
  const hereKey = near.nearKey;
  const isHere = (c: string) => !!hereKey && nearKeyOf(c) === hereKey;
  // Somewhere with none of your spots: that city as a trip ("My Lisbon", your saved spots there).
  const hereCity = hereKey ? null : nearestKnownCity(here);
  const lastCity = decodeURIComponent((await cookies()).get(LAST_CITY_COOKIE)?.value ?? "");
  const overview = tab === "saved" || one("all") === "1";
  let pick: { city: string; trip: boolean } | null = null;
  if (!overview) {
    if (focus) {
      const own = sorted.find(([c]) => isFocus(c));
      if (own) pick = { city: own[0], trip: false };
      else if (focus !== "_other") pick = { city: one("city").trim(), trip: true };
    } else if (hereKey) pick = { city: near.items[0].city, trip: false };
    else if (hereCity) pick = { city: hereCity.city, trip: true };
    else if (lastCity && groups.has(lastCity)) pick = { city: lastCity, trip: false };
    else if (ownCities.length) pick = { city: near.items[0].city, trip: false };
  }

  if (pick) {
    const focusCity = pick.city;
    const trip = pick.trip;
    const cityRows = trip ? [] : (groups.get(focusCity) ?? []);
    const savedHere = trip ? saved.filter((sv) => savedCity(sv).toLowerCase() === focusCity.toLowerCase()) : [];
    const cityShared = cityRows.filter((p) => p.recommended).length;
    const youreHere = trip ? !!hereCity && hereCity.city.toLowerCase() === focusCity.toLowerCase() : isHere(focusCity);
    // The city row: this one first, then yours by most spots, then Saved and Other.
    const chips = [
      ...(trip ? [{ city: focusCity, sub: savedHere.length ? `${savedHere.length} saved` : "New", trip: true }] : []),
      ...near.items.map((c) => ({ city: c.city, sub: String(c.spots), trip: false })),
    ].sort((x, y) => Number(y.city === focusCity) - Number(x.city === focusCity));
    const otherCount = groups.get("")?.length ?? 0;
    const chipPhotos = await cityPhotosFor(chips.map((c) => c.city), new Map());
    const cityCount = ownCities.length + (otherCount ? 1 : 0);
    const chipCls = (on: boolean) =>
      cx(
        "shrink-0 inline-flex items-center gap-1.5 rounded-full border pl-[3px] pr-3 py-[3px] text-[13px] whitespace-nowrap",
        on ? "bg-ink text-cream border-ink font-semibold" : "bg-paper border-line text-ink font-medium",
      );
    const spotsOf = (rows: MyPlace[]): MySpot[] =>
      rows.map((it) => ({
        id: it.place.id,
        name: it.place.name,
        category: it.place.category,
        photoUrl: it.place.photoUrl,
        photoMediaId: it.place.photoMediaId,
        lat: it.place.lat,
        lng: it.place.lng,
        href: it.href,
        area: placeArea(it.place),
        words: (it.place.special || it.place.note || "").trim(),
        added: `Added ${timeAgo(it.place.createdAt)}`,
        guides: it.inGuides.map((g) => g.title),
        recommended: it.recommended,
        shared: !!it.place.sharedAt,
        inStash: it.inStash,
      }));
    const savedSpots: MySpot[] = savedHere.map(({ place, guide }) => ({
      id: place.id,
      name: place.name,
      category: place.category,
      photoUrl: place.photoUrl,
      photoMediaId: place.photoMediaId,
      lat: place.lat,
      lng: place.lng,
      href: `/g/${guide.slug}/p/${place.id}${guide.visibility === "private" && guide.ownerId !== user.id ? `?key=${guide.shareToken}` : ""}`,
      area: placeArea(place),
      words: (place.special || place.note || "").trim(),
      added: "Saved",
      guides: [],
      recommended: false,
      shared: false,
      inStash: false,
    }));
    const cityLink = `/city?${new URLSearchParams({ name: focusCity }).toString()}`;
    return (
      <AppShell>
        <header className="pt-5 pb-3">
          <div className="px-5 flex items-baseline justify-between gap-3">
            <span className="font-display text-[24px] leading-none">My spots</span>
            <Link href="/my-places?all=1" className="text-[13px] font-semibold text-terracotta-deep whitespace-nowrap">
              {cityCount > 1 ? `All ${cityCount} cities` : "All"} ›
            </Link>
          </div>
          {/* Every city one tap away (16 Oct 2026), the one you're looking at first. */}
          <nav aria-label="Your cities" className="mt-3 flex gap-2 overflow-x-auto no-scrollbar px-5">
            {chips.map((c) => (
              <Link key={c.city} href={`/my-places?city=${encodeURIComponent(c.city)}`} replace aria-current={c.city === focusCity ? "page" : undefined} className={chipCls(c.city === focusCity)}>
                <CityImage photo={chipPhotos.get(cityPhotoKey(c.city))} className="w-7 h-7 rounded-full" />
                {c.city}
                <span className={cx("text-[11.5px] font-medium", c.city === focusCity ? "text-cream/70" : "text-ink-faint")}>{c.sub}</span>
              </Link>
            ))}
            {otherCount > 0 && (
              <Link href="/my-places?city=_other" replace className={chipCls(focus === "_other")}>
                <span className="w-7 h-7 rounded-full bg-cream-deep" />
                Other <span className="text-[11.5px] text-ink-faint">{otherCount}</span>
              </Link>
            )}
            <Link href="/my-places?tab=saved" className={cx(chipCls(false), "pl-3")}>
              <BookmarkIcon size={13} className="text-terracotta" /> Saved <span className="text-[11.5px] text-ink-faint">{saved.length}</span>
            </Link>
          </nav>
          <div className="px-5 mt-4 flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display text-[32px] leading-none">{focusCity ? `My ${focusCity}` : "Other places"}</h1>
            {youreHere && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-2.5 py-1 text-[12px] font-semibold text-sage">
                <span className="w-1.5 h-1.5 rounded-full bg-sage" /> You&apos;re here
              </span>
            )}
          </div>
          <p className="px-5 mt-1 text-[13px] text-ink-muted">
            {trip ? "No spots of yours here yet" : `${cityRows.length} spot${cityRows.length === 1 ? "" : "s"}${cityShared ? ` · ${cityShared} recommended` : ""}`}
          </p>
          {Number.isFinite(imported) && <div className="px-5 mt-3">{importBanner}</div>}
          {!trip && (
            // One row of compact buttons (16 Oct 2026): short labels so nothing wraps on a phone.
            <div className="px-5 mt-3 flex items-center gap-2">
              {stash && items.some((i) => i.inStash) && (
                <LinkButton href="/saved/sort" size="sm" className="flex-1 whitespace-nowrap">Make a guide</LinkButton>
              )}
              {stash && items.some((i) => i.inStash) && (
                <LinkButton href={`/g/${stash.slug}/edit`} size="sm" variant="outline" aria-label="Edit or remove places" className="whitespace-nowrap"><EditIcon size={14} /> Edit</LinkButton>
              )}
              <LinkButton href="/record" size="sm" variant="outline" className="whitespace-nowrap"><PlusIcon size={14} /> Add</LinkButton>
            </div>
          )}
        </header>

        <main className="px-4 pb-8 flex flex-col gap-5">
          {trip ? (
            <>
              <div className="rounded-[20px] border border-line bg-paper overflow-hidden">
                <span className="relative block">
                  <CityImage photo={chipPhotos.get(cityPhotoKey(focusCity))} className="h-[110px] w-full" />
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <span className="absolute left-4 bottom-3 font-display text-[26px] text-white drop-shadow">Your {focusCity}</span>
                </span>
                <div className="p-3.5 flex flex-col gap-3">
                  <p className="text-[13px] leading-snug text-ink-muted">Add the spots you find here. They stay private until you recommend them.</p>
                  <div className="flex gap-2">
                    <LinkButton href="/record" size="sm" className="flex-1 whitespace-nowrap"><PlusIcon size={14} /> Add a spot</LinkButton>
                    <LinkButton href={cityLink} size="sm" variant="outline" className="flex-1 whitespace-nowrap">Spots in {focusCity}</LinkButton>
                  </div>
                </div>
              </div>
              {savedSpots.length > 0 && (
                <>
                  <h2 className="px-1 -mb-2 font-display text-[21px]">You saved <span className="text-[12px] font-sans text-ink-faint">{savedSpots.length}</span></h2>
                  <MySpotsCity city={focusCity} spots={savedSpots} categories={orderedCategories(savedSpots)} autoNear={youreHere} />
                </>
              )}
            </>
          ) : (
            <>
              {focusCity && (unguided.get(focusCity)?.length ?? 0) >= NUDGE_MIN && <GuideNudge city={focusCity} count={unguided.get(focusCity)!.length} />}
              <MySpotsCity city={focusCity} spots={spotsOf(cityRows)} categories={orderedCategories(cityRows.map((r) => r.place))} autoNear={youreHere} remember />
            </>
          )}
        </main>
      </AppShell>
    );
  }

  // ---- The tab: city tiles ----
  const [savedGuides, ownGuides] = await Promise.all([listSavedGuides(user.id), listGuidesByOwner(user.id, user.id)]);
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
    .map(([city, rows]) => ({ city, country: rows.find((r) => r.place.country)?.place.country ?? "", n: rows.length, shared: rows.filter((r) => r.recommended).length }));
  const otherCount = groups.get("")?.length ?? 0;
  const savedTiles = [...savedByCity.values()].sort((a, b) => b.n - a.n);
  const photos = await cityPhotosFor(
    [...yourTiles, ...savedTiles].map((t) => t.city),
    new Map([...yourTiles, ...savedTiles].filter((t) => t.country).map((t) => [cityPhotoKey(t.city), t.country])),
  );
  const tabLink = (t: "yours" | "saved", label: string, count: number) => (
    <Link
      href={t === "saved" ? "/my-places?tab=saved" : "/my-places?all=1"}
      replace
      aria-current={tab === t ? "page" : undefined}
      className={cx("flex-1 text-center rounded-full py-2 text-[13.5px]", tab === t ? "bg-paper font-semibold shadow-sm" : "text-ink-muted font-medium")}
    >
      {label} <span className="tabular-nums text-ink-faint">· {count}</span>
    </Link>
  );

  return (
    <AppShell>
      {n > 0 && <TopBar back="/my-places" title={null} />}
      <header className={cx("px-5 pb-3", n > 0 ? "pt-1" : "pt-6")}>
        <h1 className="font-display text-[32px] leading-none">{tab === "saved" ? "Saved spots" : "All your cities"}</h1>
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
