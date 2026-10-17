import { freshOf, sharedLabel } from "@/lib/fresh";
import type { Metadata } from "next";
import { CreditedNotes } from "@/components/CreditedNotes";
import Link from "next/link";
import { formatCoords, isDroppedPin, mapsUrl } from "@/lib/places/pins";
import { tidyCity } from "@/lib/places/cityName";
import { LocationsList } from "@/components/LocationsList";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { PlaceComments } from "@/components/PlaceComments";
import { GuideMap } from "@/components/GuideMap";
import { PlaceTile } from "@/components/PlaceTile";
import { TipsEditor } from "@/components/TipsEditor";
import { TrackView } from "@/components/Tracking";
import { AlertIcon, CalendarIcon, CheckIcon, GlobeIcon, InstagramIcon, PinIcon, SparkleIcon, WhatsAppIcon } from "@/components/Icons";
import { HoursSummary } from "@/components/HoursSummary";
import { SaveButton } from "@/components/SaveButton";
import { orderPlaces } from "@/lib/places/order";
import { placeTimeZone } from "@/lib/places/hours";
import { Tag } from "@/components/ui";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { canViewGuide, getGuideBySlug, getGuideDetail } from "@/lib/guides";
import { canViewSharedPlace, citySpots, spotKey } from "@/lib/citySpots";
import { Avatar } from "@/components/ui";
import { isStash, myPlacesHref } from "@/lib/stash";
import { canonicalCity } from "@/lib/places/cities";
import { RecommendToggle } from "@/components/RecommendToggle";
import { FixPlaceLocation } from "@/components/FixPlaceLocation";
import { PlaceOwnerActions } from "@/components/PlaceOwnerActions";
import { DescriptionEditor } from "@/components/DescriptionEditor";
import { ownCopyOf } from "@/lib/myPlaces";
import { getPlacesProvider } from "@/lib/places";
import { getGoogleRatings } from "@/lib/places/ratings";
import { GoogleRatingLine } from "@/components/GoogleRating";
import { displayPhone, telHref } from "@/lib/phone";
import { trackAttrs } from "@/lib/track";
import { BeenHere } from "@/components/BeenHere";
import { AddToGuideButton } from "@/components/AddToGuideButton";
import { isReusable, reuseTargets } from "@/lib/reuse";
import { namesSentence } from "@/lib/utils";
import { instagramHref, websiteLabel, whatsappHref } from "@/lib/placeLinks";

export const dynamic = "force-dynamic";

const pill = "inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-[12.5px] font-medium hover:border-terracotta-soft hover:text-terracotta";

type Props = {
  params: Promise<{ slug: string; placeId: string }>;
  searchParams: Promise<{ key?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, placeId } = await params;
  const guide = await getGuideBySlug(slug);
  if (!guide) return { title: "Place" };
  const db = await getDb();
  const place = await db.query.places.findFirst({ where: and(eq(places.id, placeId), eq(places.guideId, guide.id)) });
  if (!place) return { title: guide.title };
  const title = isStash(guide) ? place.name : `${place.name} · ${guide.title}`;
  if (guide.visibility !== "public" || !guide.publishedAt) return { title, robots: { index: false } };
  const description = (place.note.trim() || `In ${guide.title} on MyGuide`).slice(0, 200);
  const image = place.photoMediaId ? `/api/media/${place.photoMediaId}` : place.photoUrl ?? undefined;
  return {
    title,
    description,
    openGraph: { type: "article", siteName: "MyGuide", title: place.name, description, ...(image ? { images: [{ url: image, alt: place.name }] } : {}) },
  };
}

export default async function PlaceDetailPage({ params, searchParams }: Props) {
  const { slug, placeId } = await params;
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : null;
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();
  const user = await getCurrentUser();
  // A place recommended on its own from someone's My spots can be opened without the (private) list.
  let sharedOnly = false;
  if (!(await canViewGuide(guide, user?.id, key))) {
    const db = await getDb();
    const row = await db.query.places.findFirst({ where: and(eq(places.id, placeId), eq(places.guideId, guide.id)) });
    if (!row?.sharedAt || !(await canViewSharedPlace(guide.ownerId, user?.id))) notFound();
    sharedOnly = true;
  }

  const detail = await getGuideDetail(guide, user);
  // Only their other recommended places, never the rest of the private list.
  if (sharedOnly) detail.places = detail.places.filter((p) => p.sharedAt);
  const place = detail.places.find((p) => p.id === placeId);
  if (!place) notFound();
  const stashPlace = isStash(guide);

  const creatorPhotos = detail.placePhotos[place.id] ?? [];
  let gallery: string[] = creatorPhotos.map((p) => `/api/media/${p.mediaId}`);
  let gallerySource: "creator" | "google" | "none" = gallery.length ? "creator" : "none";
  if (!gallery.length && place.googlePlaceId && !place.googlePlaceId.startsWith("mock:")) {
    try {
      const fresh = await getPlacesProvider().details(place.googlePlaceId);
      if (fresh?.photoUrls.length) {
        gallery = fresh.photoUrls;
        gallerySource = "google";
      }
    } catch {
      // fall through to the single stored photo below
    }
  }
  if (!gallery.length && place.photoUrl) {
    gallery = [place.photoUrl];
    gallerySource = "google";
  }

  const googleRating = place.googlePlaceId ? (await getGoogleRatings([place.googlePlaceId]))[place.googlePlaceId] ?? null : null;
  const tips = detail.placeTips[place.id] ?? [];
  const branches = detail.placeLocations[place.id] ?? [];
  const hours = place.hoursJson ? (JSON.parse(place.hoursJson) as string[]) : [];
  const mapsHref = mapsUrl(place);
  const ordered = orderPlaces(detail.places);
  const pos = ordered.findIndex((p) => p.id === place.id);
  const keyQuery = key ? `?key=${key}` : "";
  const placeHref = (id: string) => `/g/${slug}/p/${id}${keyQuery}`;
  const canReuse = !detail.viewerCanEdit && isReusable(guide);
  const targets = canReuse && user ? await reuseTargets(user.id, tidyCity(guide.city || place.city)) : null;
  // Opened someone else's copy of a spot you have too: fix yours from here.
  const mine = user && !detail.viewerCanEdit ? await ownCopyOf(user.id, place) : null;
  // Where "← Back" (and Remove) goes: My spots for a My spots spot, else the guide.
  const backHref = stashPlace ? myPlacesHref(place.city ? canonicalCity(place.city) : "") : `/g/${slug}${keyQuery}`;
  // One page per spot (16 Oct 2026): everyone who recommends this spot, their words stacked.
  const spotCity = tidyCity(place.city || guide.city);
  const spot = spotCity
    ? (await citySpots({ city: spotCity, viewerId: user?.id ?? null, withOwn: !!user })).find((s) => s.recommenders.some((r) => r.placeId === place.id) || s.key === spotKey(place))
    : undefined;
  const recommenders = (spot?.recommenders ?? []).filter((r) => !r.isPrivate);
  const recNames = recommenders.map((r) => (r.user.id === user?.id ? "you" : r.user.displayName.split(" ")[0]));
  const noteAuthor = place.noteAuthorId && place.noteAuthorId !== detail.owner.id ? detail.noteAuthors[place.noteAuthorId] : null;

  return (
    <AppShell>
      <TrackView type="place_view" guideId={place.guideId} placeId={place.id} />
      <TopBar back={`/g/${slug}${key ? `?key=${key}` : ""}`} title={null} />

      {gallery.length > 0 ? (
        <div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-0">
            {gallery.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={place.name} className="h-[220px] w-[85%] shrink-0 object-cover first:rounded-none" />
            ))}
          </div>
          <p className="px-5 pt-1.5 text-[10.5px] text-ink-faint">
            {gallerySource === "creator" ? "Photos from the guide creator" : "Photos from Google Maps"}
          </p>
        </div>
      ) : (
        <div className="h-[160px] flex items-center justify-center bg-cream-deep/60">
          <PlaceTile place={place} size={72} />
        </div>
      )}

      <div className="px-5 pt-4 pb-8 flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag>{place.category}</Tag>
            {place.businessStatus === "CLOSED_TEMPORARILY" && <Tag tone="warn"><AlertIcon size={11} /> Temporarily closed</Tag>}
            {place.businessStatus === "CLOSED_PERMANENTLY" && <Tag tone="warn"><AlertIcon size={11} /> May have closed permanently</Tag>}
          </div>
          <div className="mt-2 flex items-start gap-3">
            <h1 className="flex-1 font-display text-[28px] leading-[1.05]">{place.name}</h1>
          </div>
          {stashPlace && detail.viewerCanEdit && (
            <div className="mt-2"><RecommendToggle placeIds={[place.id]} shared={!!place.sharedAt} city={place.city} /></div>
          )}
          {/* When it was last shared or updated, on every place page (15 Oct 2026). */}
          <p className="mt-1 text-[11.5px] text-ink-faint">
            {[
              stashPlace
                ? detail.viewerCanEdit
                  ? ""
                  : `Recommended by ${detail.owner.displayName.split(" ")[0]}`
                : "",
              `${stashPlace && detail.viewerCanEdit && !place.sharedAt ? "Added" : "Shared"} ${sharedLabel(freshOf(place))}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {isDroppedPin(place) ? (
            <p className="mt-1 text-[13px] text-ink-muted">
              <span className="text-sage font-medium">Dropped pin</span>
              {place.address ? ` · ${place.address}` : ""}
              <span className="block text-[11.5px] text-ink-faint tabular-nums">{formatCoords(place.lat!, place.lng!)}</span>
            </p>
          ) : (
            place.address && <p className="mt-1 text-[13px] text-ink-muted">{place.address}</p>
          )}
          {googleRating && <GoogleRatingLine rating={googleRating} href={mapsHref} />}
          {detail.viewerCanEdit && (
            <PlaceOwnerActions
              guideId={guide.id}
              placeId={place.id}
              name={place.name}
              editHref={stashPlace ? null : `/g/${slug}/edit#place-edit-${place.id}`}
              backHref={backHref}
              from={stashPlace ? "My spots" : detail.guide.title}
            />
          )}
          {detail.viewerCanEdit && (
            <FixPlaceLocation
              guideId={guide.id}
              placeId={place.id}
              name={place.name}
              // A guide's city is what it should be; in My spots the saved city may be the wrong one.
              cityHint={stashPlace ? undefined : tidyCity(guide.city) || undefined}
              droppedPin={isDroppedPin(place)}
              at={place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null}
            />
          )}
          {mine && (
            <div className="mt-3 rounded-2xl bg-sage-tint px-3.5 py-3">
              <p className="text-[13.5px] font-semibold text-sage inline-flex items-center gap-1.5">
                <CheckIcon size={15} /> One of your spots
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">
                {mine.recommended ? "You recommend it too — friends see you both." : mine.inStash ? "It's in My spots, private for now." : "It's in one of your guides."}{" "}
                <Link href={`/g/${mine.slug}/p/${mine.placeId}`} className="font-semibold text-terracotta">Open yours →</Link>
              </p>
              {mine.inStash && !mine.recommended && (
                <div className="mt-2"><RecommendToggle placeIds={[mine.placeId]} shared={false} city={mine.city} /></div>
              )}
              <FixPlaceLocation
                guideId={mine.guideId}
                placeId={mine.placeId}
                name={place.name}
                droppedPin={mine.droppedPin}
                at={mine.lat != null && mine.lng != null ? { lat: mine.lat, lng: mine.lng } : null}
                label="Wrong place? Fix yours"
              />
            </div>
          )}
          {(detail.friendsWhoLike[place.id]?.length ?? 0) > 0 && (
            <p className="mt-2 text-[12.5px] text-sage font-medium">
              ♥ {namesSentence(detail.friendsWhoLike[place.id].map((u) => u.displayName.split(" ")[0]))} {detail.friendsWhoLike[place.id].length === 1 ? "likes" : "like"} this — people you follow
            </p>
          )}
          {!detail.viewerCanEdit && !mine && (
            <div className="mt-3">
              <BeenHere
                placeId={place.id}
                placeName={place.name}
                ownerFirst={detail.owner.displayName.split(" ")[0]}
                initial={detail.viewerReactions[place.id]?.been ?? false}
                count={detail.placeSocial[place.id]?.been ?? 0}
                signedIn={!!user}
                youHaveIt={!!mine}
              />
              {canReuse && (
                <AddToGuideButton
                  placeId={place.id}
                  signedIn={!!user}
                  signupHref={`/signup?why=fork&next=${encodeURIComponent(placeHref(place.id))}`}
                  targets={targets}
                  notesShared={guide.allowFork}
                  className="mt-2.5"
                />
              )}
            </div>
          )}
          {detail.viewerCanEdit && ((detail.placeSocial[place.id]?.been ?? 0) + (detail.placeSocial[place.id]?.loved ?? 0) + (detail.placeSocial[place.id]?.favourites ?? 0)) > 0 && (
            <p className="mt-2 text-[12px] text-ink-muted">
              Readers: {detail.placeSocial[place.id].favourites} want to go · {detail.placeSocial[place.id].been} been · {detail.placeSocial[place.id].loved} loved it
            </p>
          )}
        </div>

        {!detail.viewerCanEdit && recommenders.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-semibold">
              Recommended by {recNames.length <= 2 ? recNames.join(" and ") : `${recNames.slice(0, -1).join(", ")} and ${recNames.at(-1)}`}
            </h2>
            {recommenders.map((r) => (
              <div key={r.placeId} className="flex gap-3 rounded-2xl border border-line bg-paper p-3">
                <Link href={`/u/${r.user.username}`} className="shrink-0"><Avatar user={r.user} size={34} /></Link>
                <div className="flex-1 min-w-0">
                  {r.tip ? <p className="text-[14px] leading-relaxed italic">&ldquo;{r.tip}&rdquo;</p> : <p className="text-[13.5px] text-ink-muted">Recommends it.</p>}
                  <p className="mt-1 text-[12px] text-ink-muted">
                    <Link href={`/u/${r.user.username}`} className="font-semibold text-ink">{r.user.id === user?.id ? "You" : r.user.displayName.split(" ")[0]}</Link>
                    {" · "}
                    {sharedLabel(r.freshAt)}
                    {r.placeId !== place.id && r.guideTitle && (
                      <>
                        {" · "}
                        <Link href={`/g/${r.guideSlug}/p/${r.placeId}`} className="hover:text-terracotta">their notes</Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </section>
        )}

        {place.reserveUrl && (
          <a
            href={place.reserveUrl}
            target="_blank"
            rel="noreferrer"
            {...trackAttrs("tap_reserve", place.guideId, place.id)}
            className="-mb-2 flex items-center justify-center gap-2 rounded-2xl bg-terracotta px-4 py-3 text-[14.5px] font-medium text-cream hover:opacity-90"
          >
            <CalendarIcon size={17} /> Reserve
          </a>
        )}

        {(detail.viewerCanEdit || hours.length > 0 || !!place.phone || !!place.website || !!place.instagram || !!place.whatsapp) && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-paper p-4">
          {detail.viewerCanEdit && (
            <a href={mapsHref} target="_blank" rel="noreferrer" {...trackAttrs("tap_directions", place.guideId, place.id)} className="flex items-center gap-2.5 text-[13.5px] font-medium hover:text-terracotta">
              <PinIcon size={17} className="text-terracotta shrink-0" /> Open in Google Maps
            </a>
          )}
          {(hours.length > 0 || place.phone) && (
            <div className="flex items-start justify-between gap-3">
              {hours.length > 0 ? (
                <div className="flex-1 min-w-0">
                  <HoursSummary hours={hours} tz={placeTimeZone(place.country, place.lng)} size="md" />
                </div>
              ) : (
                <span />
              )}
              {place.phone && (
                <a href={telHref(place.phone, place.country)} {...trackAttrs("tap_call", place.guideId, place.id)} className="shrink-0 flex items-center gap-1.5 text-[13.5px] hover:text-terracotta">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-terracotta shrink-0"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2C10.5 21 3 13.5 3 6a2 2 0 0 1 2-2z" /></svg>
                  {displayPhone(place.phone, place.country)}
                </a>
              )}
            </div>
          )}
          {(place.website || place.instagram || place.whatsapp) && (
            <div className="flex flex-wrap gap-2 pt-1">
              {place.website && (
                <a href={place.website} target="_blank" rel="noreferrer" {...trackAttrs("tap_website", place.guideId, place.id)} className={pill}>
                  <GlobeIcon size={15} className="text-terracotta shrink-0" /> <span className="truncate max-w-[150px]">{websiteLabel(place.website)}</span>
                </a>
              )}
              {place.instagram && (
                <a href={instagramHref(place.instagram)} target="_blank" rel="noreferrer" {...trackAttrs("tap_instagram", place.guideId, place.id)} className={pill}>
                  <InstagramIcon size={15} className="text-terracotta shrink-0" /> Instagram
                </a>
              )}
              {place.whatsapp && (
                <a href={whatsappHref(place.whatsapp)} target="_blank" rel="noreferrer" {...trackAttrs("tap_whatsapp", place.guideId, place.id)} className={pill}>
                  <WhatsAppIcon size={15} className="text-terracotta shrink-0" /> WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
        )}

        {place.lat != null && place.lng != null && (
          <GuideMap
            places={[
              { id: place.id, name: place.name, lat: place.lat, lng: place.lng, category: place.category, n: pos >= 0 ? pos + 1 : 1 },
              ...branches.map((b) => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng, category: place.category, n: pos >= 0 ? pos + 1 : 1, small: true })),
            ]}
            height={branches.length ? 220 : 180}
            showCard={false}
          />
        )}

        {branches.length > 0 && place.lat != null && place.lng != null && (
          <LocationsList
            track={trackAttrs("tap_directions", place.guideId, place.id)}
            items={[
              { id: place.id, name: place.name, address: place.address, lat: place.lat, lng: place.lng, googlePlaceId: place.googlePlaceId, main: true },
              ...branches.map((b) => ({ id: b.id, name: b.name, address: b.address, lat: b.lat, lng: b.lng, googlePlaceId: b.googlePlaceId })),
            ]}
          />
        )}

        {detail.viewerCanEdit ? (
          <DescriptionEditor guideId={guide.id} placeId={place.id} initial={place.note} author={noteAuthor?.username ?? null} credited={!!detail.credited[place.id]?.length} />
        ) : place.note && recommenders.length === 0 && (
          <div>
            <p className="text-[13px] font-semibold text-ink-muted mb-1.5">Why go</p>
            <p className="text-[14px] italic leading-relaxed whitespace-pre-line">
              {place.note}
              {noteAuthor && <span className="not-italic text-[11.5px] text-ink-faint"> — @{noteAuthor.username}</span>}
            </p>
          </div>
        )}

        <CreditedNotes notes={detail.credited[place.id]} locked={detail.viewerCanEdit} />

        {detail.viewerCanEdit ? (
          <TipsEditor guideId={guide.id} placeId={place.id} initial={tips} variant="card" />
        ) : (
          tips.length > 0 && (
            <div className="rounded-2xl bg-terracotta-tint px-4 py-3.5">
              <p className="text-[11.5px] font-semibold text-terracotta-deep inline-flex items-center gap-1.5 mb-1.5"><SparkleIcon size={13} /> More tips from {detail.owner.displayName.split(" ")[0]}</p>
              <ul className="flex flex-col gap-1.5">
                {tips.map((t) => (
                  <li key={t.id} className="text-[13.5px] leading-relaxed flex gap-2">
                    <span className="text-terracotta shrink-0">•</span>
                    <span>{t.body}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}


        {/* #comments: the 💬 on a Home post lands here (17 Oct 2026). */}
        <div id="comments" className="scroll-mt-20">
          <p className="text-[13px] font-semibold text-ink-muted mb-2">Comments</p>
          <PlaceComments placeId={place.id} initial={detail.placeComments[place.id] ?? []} currentUser={user ? toPublicUser(user) : null} />
        </div>

        {!detail.viewerCanEdit && !stashPlace && (
          <Link href={`/g/${slug}${keyQuery}`} className="text-[12.5px] text-ink-muted hover:text-terracotta">In {detail.guide.title}</Link>
        )}
      </div>
      {!detail.viewerCanEdit && (
        <>
          <div aria-hidden className="h-20" />
          {/* Save and Directions at your thumb (16 Oct 2026), just above the tab bar. */}
          <div className="fixed inset-x-0 z-30 flex justify-center pointer-events-none" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)" }}>
            <div className="pointer-events-auto w-full max-w-[480px] px-3">
              <div className="flex gap-2 rounded-[22px] border border-line bg-paper/95 backdrop-blur p-2 shadow-lg">
                {!mine && <SaveButton placeId={place.id} initial={detail.savedPlaceIds.includes(place.id)} signedIn={!!user} variant="bar" />}
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  {...trackAttrs("tap_directions", place.guideId, place.id)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full h-12 border border-line bg-paper text-[15px] font-semibold"
                >
                  <PinIcon size={16} className="text-terracotta" /> Directions
                </a>
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
