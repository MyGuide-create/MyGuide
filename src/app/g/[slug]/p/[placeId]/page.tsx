import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, TopBar } from "@/components/AppShell";
import { PlaceComments } from "@/components/PlaceComments";
import { GuideMap } from "@/components/GuideMap";
import { PlaceTile } from "@/components/PlaceTile";
import { TipsEditor } from "@/components/TipsEditor";
import { TrackView } from "@/components/Tracking";
import { AlertIcon, ChevronLeft, ChevronRight, PinIcon, SparkleIcon } from "@/components/Icons";
import { HoursSummary } from "@/components/HoursSummary";
import { SaveButton } from "@/components/SaveButton";
import { orderPlaces } from "@/lib/places/order";
import { placeTimeZone } from "@/lib/places/hours";
import { LinkButton, Tag } from "@/components/ui";
import { getCurrentUser, toPublicUser } from "@/lib/auth";
import { canViewGuide, getGuideBySlug, getGuideDetail } from "@/lib/guides";
import { getPlacesProvider } from "@/lib/places";
import { displayPhone, telHref } from "@/lib/phone";
import { trackAttrs } from "@/lib/track";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; placeId: string }>;
  searchParams: Promise<{ key?: string }>;
};

export default async function PlaceDetailPage({ params, searchParams }: Props) {
  const { slug, placeId } = await params;
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : null;
  const guide = await getGuideBySlug(slug);
  if (!guide) notFound();
  const user = await getCurrentUser();
  if (!(await canViewGuide(guide, user?.id, key))) notFound();

  const detail = await getGuideDetail(guide, user);
  const place = detail.places.find((p) => p.id === placeId);
  if (!place) notFound();

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

  const tips = detail.placeTips[place.id] ?? [];
  const hours = place.hoursJson ? (JSON.parse(place.hoursJson) as string[]) : [];
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}${place.googlePlaceId && !place.googlePlaceId.startsWith("mock:") ? `&query_place_id=${place.googlePlaceId}` : ""}`;
  const ordered = orderPlaces(detail.places);
  const pos = ordered.findIndex((p) => p.id === place.id);
  const prev = pos > 0 ? ordered[pos - 1] : null;
  const next = pos >= 0 && pos < ordered.length - 1 ? ordered[pos + 1] : null;
  const keyQuery = key ? `?key=${key}` : "";
  const placeHref = (id: string) => `/g/${slug}/p/${id}${keyQuery}`;
  const noteAuthor = place.noteAuthorId && place.noteAuthorId !== detail.owner.id ? detail.noteAuthors[place.noteAuthorId] : null;

  return (
    <AppShell>
      <TrackView type="place_view" guideId={place.guideId} placeId={place.id} />
      <TopBar back={`/g/${slug}${key ? `?key=${key}` : ""}`} title={place.name} avatarUser={user ? toPublicUser(user) : null} />

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
            <SaveButton placeId={place.id} initial={detail.savedPlaceIds.includes(place.id)} signedIn={!!user} variant="pill" className="mt-1 shrink-0" />
          </div>
          {pos >= 0 && <p className="mt-1 text-[11.5px] text-ink-faint">Place {pos + 1} of {ordered.length} in {detail.guide.title}</p>}
          {place.address && <p className="mt-1 text-[13px] text-ink-muted">{place.address}</p>}
        </div>

        <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-paper p-4">
          <a href={mapsHref} target="_blank" rel="noreferrer" {...trackAttrs("tap_directions", place.guideId, place.id)} className="flex items-center gap-2.5 text-[13.5px] font-medium hover:text-terracotta">
            <PinIcon size={17} className="text-terracotta shrink-0" /> Open in Google Maps
          </a>
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
        </div>

        {place.lat != null && place.lng != null && (
          <GuideMap
            places={[{ id: place.id, name: place.name, lat: place.lat, lng: place.lng, category: place.category, n: pos >= 0 ? pos + 1 : 1 }]}
            height={180}
            showCard={false}
          />
        )}

        {place.note && (
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">From the guide</p>
            <p className="text-[14px] italic leading-relaxed">
              {place.note}
              {noteAuthor && <span className="not-italic text-[11.5px] text-ink-faint"> — @{noteAuthor.username}</span>}
            </p>
          </div>
        )}

        {place.special && (
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-1.5">What makes it special</p>
            <p className="text-[14px] leading-relaxed">{place.special}</p>
          </div>
        )}

        {detail.viewerCanEdit ? (
          <TipsEditor guideId={guide.id} placeId={place.id} initial={tips} variant="card" />
        ) : (
          tips.length > 0 && (
            <div className="rounded-2xl bg-terracotta-tint px-4 py-3.5">
              <p className="text-[11.5px] font-semibold text-terracotta-deep inline-flex items-center gap-1.5 mb-1.5"><SparkleIcon size={13} /> Expert tip{tips.length === 1 ? "" : "s"}</p>
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

        {detail.viewerCanEdit && !place.special && (
          <LinkButton href={`/g/${slug}/edit#place-edit-${place.id}`} variant="outline" size="sm" className="self-start">Add “what makes it special”</LinkButton>
        )}

        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-muted mb-2">Comments</p>
          <PlaceComments placeId={place.id} initial={detail.placeComments[place.id] ?? []} currentUser={user ? toPublicUser(user) : null} />
        </div>

        {(prev || next) && (
          <nav aria-label="More places in this guide" className="grid grid-cols-2 gap-2.5">
            {prev ? (
              <Link href={placeHref(prev.id)} className="rounded-2xl border border-line bg-paper px-3 py-2.5 hover:border-terracotta-soft">
                <span className="flex items-center gap-1 text-[11px] text-ink-faint"><ChevronLeft size={13} /> Previous</span>
                <span className="block mt-0.5 text-[13px] font-medium truncate">{prev.name}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={placeHref(next.id)} className="rounded-2xl border border-line bg-paper px-3 py-2.5 text-right hover:border-terracotta-soft">
                <span className="flex items-center justify-end gap-1 text-[11px] text-ink-faint">Next <ChevronRight size={13} /></span>
                <span className="block mt-0.5 text-[13px] font-medium truncate">{next.name}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}

        <Link href={`/g/${slug}${keyQuery}`} className="text-[12.5px] text-ink-muted hover:text-terracotta">← Back to {detail.guide.title}</Link>
      </div>
    </AppShell>
  );
}
