import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell, TopBar } from "@/components/AppShell";
import { GuideCover } from "@/components/GuideCover";
import { HeartIcon, PlusIcon, SparkleIcon } from "@/components/Icons";
import { AskForGuideButton } from "@/components/AskForGuide";
import { GuideMap } from "@/components/GuideMap";
import { PlaceTile } from "@/components/PlaceTile";
import { Avatar, EmptyState, LinkButton, cx } from "@/components/ui";
import { getCurrentUser, toPublicUser, type PublicUser } from "@/lib/auth";
import { listFeed, listGuidesByOwner, type GuideCard } from "@/lib/guides";
import { cityKey, guideSaveCounts, wantedGuides } from "@/lib/homeV2";
import { acceptedFollowingIds, citySpots, type CitySpot } from "@/lib/citySpots";
import { CATEGORIES } from "@/lib/places";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";


type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }) {
  const name = one((await searchParams).name);
  return { title: name ? `${name} guides` : "City" };
}

const SPOTS_SHOWN = 20;
const first = (u: PublicUser) => u.displayName.split(" ")[0] || u.username;

/**
 * "Going somewhere?" lands here. Places first: pick whose taste you want (friend row), see their
 * guides, then every spot they recommend, merged so a spot several friends love shows once with all
 * of them. No friends there yet → the most recommended spots on MyGuide. Every guide for the city
 * stays below with its sort.
 */
export default async function CityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const city = one(sp.name).slice(0, 80);
  const country = one(sp.country).slice(0, 80);
  const lat = one(sp.lat);
  const lng = one(sp.lng);
  const sort = one(sp.sort) === "new" ? "new" : "saved";
  const friendParam = one(sp.friend).toLowerCase();
  const catParam = one(sp.cat);
  const showAll = one(sp.all) === "1";

  const [mine, everyone, wanted] = city
    ? await Promise.all([
        user ? listFeed({ viewerId: user.id, scope: "following", city }) : Promise.resolve([] as GuideCard[]),
        listFeed({ viewerId: user?.id, scope: "public", city, limit: 100 }),
        wantedGuides(user?.id, 50),
      ])
    : [[], [], { help: null, list: [] }];
  const saves = await guideSaveCounts(everyone.map((g) => g.guide.id));
  const all = [...everyone].sort((a, b) =>
    sort === "new"
      ? b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime()
      : (saves.get(b.guide.id) ?? 0) - (saves.get(a.guide.id) ?? 0) || b.guide.updatedAt.getTime() - a.guide.updatedAt.getTime(),
  );

  // Spots: friends' first; nobody you follow has any here → everyone's, so the page is never empty.
  const followingIds = city && user ? await acceptedFollowingIds(user.id) : [];
  const friendSpots = city ? await citySpots({ city, viewerId: user?.id, ownerIds: followingIds }) : [];
  const fromFriends = friendSpots.length > 0;
  const spots = fromFriends ? friendSpots : city ? await citySpots({ city, viewerId: user?.id }) : [];

  // The friend row: everyone you follow with spots or guides here, most spots first.
  const people = new Map<string, { user: PublicUser; spots: number; guides: number }>();
  const person = (u: PublicUser) => people.get(u.id) ?? people.set(u.id, { user: u, spots: 0, guides: 0 }).get(u.id)!;
  if (fromFriends) for (const s of friendSpots) for (const r of s.recommenders) person(r.user).spots++;
  for (const g of mine) person(g.owner).guides++;
  const friends = [...people.values()].sort((a, b) => b.spots - a.spots || b.guides - a.guides || first(a.user).localeCompare(first(b.user)));
  const friendCount = friends.length;
  const picked = friends.find((f) => f.user.username.toLowerCase() === friendParam)?.user ?? null;

  const bySomeone = picked ? spots.filter((s) => s.recommenders.some((r) => r.user.id === picked.id)) : spots;
  const cats = CATEGORIES.filter((c) => bySomeone.some((s) => s.place.category === c));
  const cat = cats.find((c) => c === catParam) ?? null;
  const shownSpots = cat ? bySomeone.filter((s) => s.place.category === cat) : bySomeone;
  const listed = showAll ? shownSpots : shownSpots.slice(0, SPOTS_SHOWN);
  const friendGuides = picked ? mine.filter((g) => g.owner.id === picked.id) : mine;

  // "Add your spots" opens your own guide for this city when you have one, else starts one.
  const ownCityGuide = user && city ? (await listGuidesByOwner(user.id, user.id)).find((g) => cityKey(g.guide.city) === cityKey(city)) : undefined;
  const wish = [wanted.help, ...wanted.list].find((w) => w && cityKey(w.group.city) === cityKey(city)) ?? null;

  const base = { name: city, ...(country ? { country } : {}), ...(lat && lng ? { lat, lng } : {}) };
  const state = { friend: picked?.username ?? "", cat: cat ?? "", sort: sort === "new" ? "new" : "", all: "" };
  const cityHref = (over: Partial<typeof state>) => {
    const q = { ...base } as Record<string, string>;
    for (const [k, v] of Object.entries({ ...state, ...over })) if (v) q[k] = v;
    return `/city?${new URLSearchParams(q).toString()}`;
  };
  const sortHref = (s: "saved" | "new") => cityHref({ sort: s === "new" ? "new" : "" });
  const startQs = new URLSearchParams({ city, ...(country ? { country } : {}), ...(lat && lng ? { lat, lng } : {}) }).toString();
  const startHref = user ? `/create?${startQs}` : `/signup?next=${encodeURIComponent(`/create?${startQs}`)}&why=create`;
  const addSpotsHref = ownCityGuide ? `/g/${ownCityGuide.guide.slug}/edit` : startHref;
  const tripHref = user ? `/trips?city=${encodeURIComponent(city)}` : `/signup?next=${encodeURIComponent(`/trips?city=${city}`)}`;
  const signupAsk = `/signup?next=${encodeURIComponent(`/city?${new URLSearchParams(base).toString()}`)}`;
  const askCity = { city, country, lat: lat ? Number(lat) : null, lng: lng ? Number(lng) : null };

  return (
    <AppShell>
      <TopBar back="/" title={null} avatarUser={user ? toPublicUser(user) : null} />
      <header className="px-5 pt-2 pb-4">
        <h1 className="font-display text-[38px] leading-[1.02]">{city || "Pick a city"}</h1>
        {city && (
          <p className="mt-1 text-[14px] text-ink-muted">
            {[
              country,
              spots.length ? `${spots.length} spot${spots.length === 1 ? "" : "s"}` : "",
              all.length ? `${all.length} guide${all.length === 1 ? "" : "s"}` : "",
              friendCount ? `${friendCount} friend${friendCount === 1 ? "" : "s"}` : "",
            ].filter(Boolean).join(" · ")}
          </p>
        )}
        {city && (
          <div className="mt-4 flex gap-2.5">
            {all.length > 0 && (
              <LinkButton href={addSpotsHref} className="flex-1">
                <PlusIcon size={15} /> Add your spots
              </LinkButton>
            )}
            <LinkButton href={tripHref} variant={all.length > 0 ? "outline" : "primary"} className="flex-1">Plan a trip</LinkButton>
          </div>
        )}
      </header>

      <main className="pb-8 flex flex-col">
        {city && all.length === 0 && wish && (
          <div className="px-4 pb-4">
            <div className="rounded-[20px] bg-ink text-cream p-4 flex flex-col gap-3">
              <p className="font-display text-[21px] leading-snug">
                {wish.others.length} {wish.others.length === 1 ? "person wants" : "people want"} a {city} guide. Be the first to make one.
              </p>
              <LinkButton href={user ? `/create?wish=${wish.others.map((p) => p.wish.id).join(",")}` : startHref} className="self-start">Make it for them</LinkButton>
            </div>
          </div>
        )}
        {city && all.length === 0 && (
          <div className="px-4">
            <EmptyState
              title={`No guides for ${city} yet`}
              body="Know someone who's been? Ask them to make you one. Or start your own and add places when you get there."
              action={
                <span className="flex flex-col items-center gap-3">
                  <LinkButton href={startHref}>
                    <PlusIcon size={15} /> Start a guide for {city}
                  </LinkButton>
                  {user ? (
                    <AskForGuideButton city={askCity} label="Ask a friend who knows it" variant="outline" size="md" />
                  ) : (
                    <Link href={signupAsk} className="text-[13px] font-medium text-terracotta-deep">Sign up to ask a friend for a {city} guide</Link>
                  )}
                </span>
              }
            />
          </div>
        )}

        {friends.length > 0 && (
          <section className="pt-1 flex flex-col gap-2.5">
            <h2 className="px-5 text-[13px] font-semibold text-ink-muted">Whose spots</h2>
            <div role="group" aria-label="Filter by friend" className="flex gap-3 overflow-x-auto no-scrollbar px-5 pb-1">
              <FriendChip href={cityHref({ friend: "", cat: "", all: "" })} active={!picked} label="Everyone" count={fromFriends ? friendSpots.length : 0}>
                <span className="w-12 h-12 rounded-full bg-cream-deep text-ink text-[13px] font-semibold flex items-center justify-center">All</span>
              </FriendChip>
              {friends.map((f) => {
                const on = picked?.id === f.user.id;
                return (
                  <FriendChip key={f.user.id} href={cityHref({ friend: on ? "" : f.user.username, cat: "", all: "" })} active={on} label={first(f.user)} count={f.spots}>
                    <Avatar user={f.user} size={48} />
                  </FriendChip>
                );
              })}
            </div>
          </section>
        )}

        {friendGuides.length > 0 && (
          <section className="pt-6 flex flex-col gap-3">
            <div className="px-5">
              <h2 className="font-display text-[22px]">{picked ? `${first(picked)}\u2019s guides` : "Guides from friends"}</h2>
              <p className="text-[13px] text-ink-muted">{picked ? `Their full take on ${city}` : `${friendGuides.length} guide${friendGuides.length === 1 ? "" : "s"} to ${city} from people you follow`}</p>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar px-5">
              {friendGuides.map((g) => (
                <Link key={g.guide.id} href={`/g/${g.guide.slug}`} className="shrink-0 w-[236px] rounded-2xl border border-line/80 bg-paper overflow-hidden">
                  <span className="relative block">
                    <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="h-[124px]" />
                    <span className="absolute left-2.5 bottom-2.5 rounded-full bg-paper/95 px-2.5 py-1 text-[12px] font-semibold">
                      {g.placeCount} place{g.placeCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="block p-3">
                    <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{g.guide.title}</span>
                    {g.guide.description.trim() && <span className="block mt-1 text-[13px] leading-snug text-ink/80 line-clamp-2">{g.guide.description}</span>}
                    <span className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-muted">
                      <Avatar user={g.owner} size={22} />
                      {first(g.owner)}
                      {(saves.get(g.guide.id) ?? 0) > 0 && <> · <HeartIcon size={12} filled aria-hidden className="text-terracotta-deep" /> {saves.get(g.guide.id)}</>}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {spots.length > 0 && (
          <section className="pt-7 flex flex-col gap-3">
            {cats.length > 1 && (
              <div role="group" aria-label="Filter by category" className="flex gap-2 overflow-x-auto no-scrollbar px-5">
                {[null, ...cats].map((c) => (
                  <Link
                    key={c ?? "all"}
                    href={cityHref({ cat: c ?? "", all: "" })}
                    replace
                    scroll={false}
                    aria-current={cat === c ? "true" : undefined}
                    className={cx(
                      "shrink-0 rounded-full px-4 py-2 text-[13.5px] whitespace-nowrap border",
                      cat === c ? "bg-ink text-cream border-ink font-semibold" : "bg-paper border-line text-ink font-medium",
                    )}
                  >
                    {c ?? "All"}
                  </Link>
                ))}
              </div>
            )}

            {shownSpots.some((s) => s.place.lat != null && s.place.lng != null) && (
              <div className="px-4">
                <GuideMap
                  height={220}
                  locate={false}
                  places={shownSpots
                    .filter((s) => s.place.lat != null && s.place.lng != null)
                    .slice(0, 150)
                    .map((s) => {
                      const r = leadFor(s, picked);
                      return {
                        id: s.key,
                        name: s.place.name,
                        lat: s.place.lat,
                        lng: s.place.lng,
                        category: s.place.category,
                        n: s.recommenders.length,
                        href: `/g/${r.guideSlug}/p/${r.placeId}`,
                        photoUrl: s.place.photoUrl,
                        photoMediaId: s.place.photoMediaId,
                        subtitle: recommendLabel(s, picked, fromFriends),
                      };
                    })}
                />
              </div>
            )}

            <div className="px-4 flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="font-display text-[22px]">{picked ? `${first(picked)}\u2019s ${city}` : fromFriends ? "Most recommended" : "Most recommended on MyGuide"}</h2>
                <span className="text-[13px] text-ink-muted">{shownSpots.length} spot{shownSpots.length === 1 ? "" : "s"}</span>
              </div>
              {!fromFriends && (
                <p className="px-1 -mt-1 text-[13px] text-ink-muted">Nobody you follow has added {city} spots yet, so here&apos;s what MyGuide travellers recommend.</p>
              )}
              {listed.length === 0 && (
                <p className="rounded-2xl border border-dashed border-cream-line p-5 text-center text-[14px] text-ink-muted">
                  {picked ? `${first(picked)} hasn\u2019t added any ${cat ?? ""} spots here yet.` : `No ${cat ?? ""} spots yet.`}
                </p>
              )}
              {listed.map((s) => <SpotRow key={s.key} spot={s} picked={picked} fromFriends={fromFriends} />)}
              {!showAll && shownSpots.length > SPOTS_SHOWN && (
                <LinkButton href={cityHref({ all: "1" })} variant="outline">Show all {shownSpots.length} spots</LinkButton>
              )}
            </div>
          </section>
        )}

        {all.length > 0 && (
          <section className="px-4 pt-8 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1">
              <h2 className="font-display text-[22px]">{spots.length ? `Every ${city} guide` : `All ${city} guides`}</h2>
              <div role="group" aria-label="Sort guides" className="flex rounded-full bg-cream-deep/70 p-[3px]">
                {(["saved", "new"] as const).map((s) => (
                  <Link
                    key={s}
                    href={sortHref(s)}
                    replace
                    scroll={false}
                    aria-current={sort === s ? "true" : undefined}
                    className={cx("px-3 py-1.5 rounded-full text-[13px]", sort === s ? "bg-ink text-cream font-semibold" : "text-ink")}
                  >
                    {s === "saved" ? "Most favourited" : "Newest"}
                  </Link>
                ))}
              </div>
            </div>
            {all.map((g) => <GuideRow key={g.guide.id} g={g} hearts={saves.get(g.guide.id) ?? 0} />)}
          </section>
        )}

        {city && all.length > 0 && (
          <div className="px-4 pt-8">
            <div className="rounded-[20px] bg-sage-tint p-4 flex flex-col gap-2.5">
              <p className="font-display text-[20px]">Know {city} well?</p>
              {wish ? (
                <>
                  <p className="text-[14px] leading-snug">
                    {wish.others.length} {wish.others.length === 1 ? "person has" : "people have"} {city} on their wish list. Your guide would go straight to them.
                  </p>
                  <LinkButton href={user ? `/create?wish=${wish.others.map((p) => p.wish.id).join(",")}` : startHref} className="self-start">Start a {city} guide</LinkButton>
                </>
              ) : (
                <>
                  <p className="text-[14px] leading-snug">Share what you know, or ask a friend who&apos;s been.</p>
                  <span className="flex flex-wrap gap-2.5">
                    <LinkButton href={startHref}>Start a {city} guide</LinkButton>
                    {user && <AskForGuideButton city={askCity} label="Ask a friend" variant="outline" />}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {!city && (
          <p className="px-5 text-[14px] text-ink-muted">
            <SparkleIcon size={13} className="inline -mt-0.5" /> Pick a city from <Link href="/" className="text-terracotta-deep font-medium">Home</Link>.
          </p>
        )}
      </main>
    </AppShell>
  );
}

/** A guide in the city list. ♥ N = how many people favourited it (the same heart as on the guide). */
function GuideRow({ g, hearts }: { g: GuideCard; hearts: number }) {
  return (
    <Link href={`/g/${g.guide.slug}`} className="flex items-center gap-3 rounded-2xl border border-line/80 bg-paper p-2.5 hover:border-terracotta-soft">
      <GuideCover guide={g.guide} ownerUsername={g.owner.username} bare thumb className="w-16 h-16 rounded-xl shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-[15px] leading-snug line-clamp-2">{g.guide.title}</span>
        <span className="block mt-0.5 text-[12.5px] text-ink-muted">{g.owner.displayName} · {g.placeCount} place{g.placeCount === 1 ? "" : "s"}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-muted">
          {hearts > 0 && (
            <>
              <span className="inline-flex items-center gap-1 font-semibold text-terracotta-deep" aria-label={`Favourited by ${hearts} ${hearts === 1 ? "person" : "people"}`}>
                <HeartIcon size={13} filled aria-hidden /> {hearts}
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>Updated {timeAgo(g.guide.updatedAt)}</span>
        </span>
      </span>
    </Link>
  );
}

function FriendChip({ href, active, label, count, children }: { href: string; active: boolean; label: string; count: number; children: ReactNode }) {
  return (
    <Link href={href} replace scroll={false} aria-current={active ? "true" : undefined} className="shrink-0 w-[60px] flex flex-col items-center gap-1">
      <span className={cx("rounded-full p-[2px] border-2", active ? "border-ink" : "border-transparent")}>{children}</span>
      <span className={cx("text-[12px] max-w-full truncate", active ? "font-semibold" : "font-medium text-ink/85")}>{label}</span>
      {count > 0 && <span className="text-[11px] text-ink-muted -mt-1">{count} spot{count === 1 ? "" : "s"}</span>}
    </Link>
  );
}

/** Whose tip and place page lead: the picked friend's, else the first with a tip. */
function leadFor(s: CitySpot, picked: PublicUser | null) {
  return (picked && s.recommenders.find((r) => r.user.id === picked.id)) || s.recommenders[0];
}

function recommendLabel(s: CitySpot, picked: PublicUser | null, fromFriends: boolean): string {
  const rs = s.recommenders;
  const n = rs.length;
  if (picked) {
    const others = rs.filter((r) => r.user.id !== picked.id);
    if (!others.length) return `Only ${first(picked)}`;
    return others.length === 1 ? `${first(picked)} & ${first(others[0].user)}` : `${first(picked)} + ${others.length} more`;
  }
  if (n === 1) return first(rs[0].user);
  if (n === 2) return `${first(rs[0].user)} & ${first(rs[1].user)}`;
  return fromFriends ? `${n} friends recommend` : `${n} people recommend`;
}

/** A spot in the list: who recommends it (faces + count) and one of their tips. */
function SpotRow({ spot, picked, fromFriends }: { spot: CitySpot; picked: PublicUser | null; fromFriends: boolean }) {
  const lead = leadFor(spot, picked);
  const faces = [lead, ...spot.recommenders.filter((r) => r !== lead)].slice(0, 3);
  const p = spot.place;
  const many = spot.recommenders.length >= 3;
  return (
    <Link href={`/g/${lead.guideSlug}/p/${lead.placeId}`} className="flex gap-3 rounded-2xl border border-line/80 bg-paper p-3 hover:border-terracotta-soft">
      <PlaceTile place={p} size={68} />
      <span className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="font-semibold text-[15px] leading-snug">{p.name}</span>
        <span className="text-[12.5px] text-ink-muted truncate">{[p.category, p.area].filter(Boolean).join(" · ")}</span>
        {lead.tip && (
          <span className="text-[13px] leading-snug text-ink/85 line-clamp-2">
            &ldquo;{lead.tip}&rdquo; <span className="text-ink-muted">{first(lead.user)}</span>
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-2">
          <span className="flex">
            {faces.map((r, i) => (
              <Avatar key={r.user.id} user={r.user} size={24} className={cx("ring-2 ring-paper", i > 0 && "-ml-2")} />
            ))}
          </span>
          <span className={cx("text-[12.5px] font-semibold", many ? "text-sage" : "text-ink-muted")}>{recommendLabel(spot, picked, fromFriends)}</span>
        </span>
      </span>
    </Link>
  );
}
