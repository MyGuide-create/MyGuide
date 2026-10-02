import Link from "next/link";
import type { Place, PlaceTip } from "@/lib/db/schema";
import type { PublicUser } from "@/lib/auth";
import type { PlaceCommentView } from "@/lib/guides";
import { AudioClip } from "./AudioClip";
import { AlertIcon, CalendarIcon, ChatIcon, PinIcon, SparkleIcon } from "./Icons";
import { HoursSummary } from "./HoursSummary";
import { SaveButton } from "./SaveButton";
import { neighbourhood } from "@/lib/places/neighbourhood";
import { placeTimeZone } from "@/lib/places/hours";
import { PlaceTile } from "./PlaceTile";
import { trackAttrs } from "@/lib/track";
import { cx } from "./ui";

export function PlaceRow({
  place,
  index,
  noteAuthor,
  ownerId,
  guideSlug,
  flagged,
  comments,
  currentUser,
  expanded,
  tips,
  saved,
  shareKey,
}: {
  place: Place;
  index?: number;
  noteAuthor?: PublicUser | null;
  ownerId: string;
  guideSlug: string;
  flagged?: string | null;
  comments?: PlaceCommentView[];
  currentUser?: PublicUser | null;
  expanded?: boolean;
  tips?: PlaceTip[];
  saved?: boolean;
  shareKey?: string | null;
}) {
  const hours = place.hoursJson ? (JSON.parse(place.hoursJson) as string[]) : [];
  const carried = noteAuthor && noteAuthor.id !== ownerId;
  const detailHref = `/g/${guideSlug}/p/${place.id}${shareKey ? `?key=${shareKey}` : ""}`;
  const commentCount = comments?.length ?? 0;
  const area = neighbourhood(place.address, place.city, place.country);
  const tipCount = tips?.length ?? 0;
  const extras = tipCount + (place.special ? 1 : 0);
  return (
    <div id={`place-${place.id}`} className="flex gap-3 items-start scroll-mt-20">
      <Link href={detailHref}><PlaceTile place={place} className="mt-0.5" /></Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex items-baseline gap-2">
            {index !== undefined && <span className="text-[11px] text-ink-faint font-medium tabular-nums">{String(index + 1).padStart(2, "0")}</span>}
            <Link href={detailHref} className="min-w-0">
              <h3 className="font-semibold text-[15px] leading-snug hover:text-terracotta">{place.name}</h3>
            </Link>
          </div>
          {currentUser?.id !== ownerId && <SaveButton placeId={place.id} initial={!!saved} signedIn={!!currentUser} className="shrink-0" />}
        </div>
        <div className="mt-0.5 text-[11.5px] text-ink-muted flex items-center gap-1 truncate">
          <span className="rounded-full bg-cream-deep px-1.5 py-[1px] text-[10.5px] font-medium text-ink-muted shrink-0">{place.category}</span>
          {(area || place.address) && <span className="truncate" title={place.address}>· {area || place.address}</span>}
        </div>
        {place.note && (
          <p className={cx("mt-1.5 text-[12.5px] italic leading-[1.45] text-ink-muted", !expanded && "line-clamp-3")}>
            {place.note}
            {carried && <span className="not-italic text-[11px] text-ink-faint"> — @{noteAuthor!.username}</span>}
          </p>
        )}
        {tipCount > 0 && (
          <Link href={detailHref} className="mt-1.5 flex items-start gap-1.5 rounded-xl bg-terracotta-tint/70 px-2.5 py-1.5 text-[12px] leading-snug hover:bg-terracotta-tint">
            <SparkleIcon size={12} className="text-terracotta mt-[2px] shrink-0" />
            <span className="min-w-0">
              <span className="line-clamp-2">{tips![0].body}</span>
              {extras > 1 && <span className="text-terracotta-deep font-medium"> +{extras - 1} more</span>}
            </span>
          </Link>
        )}
        {tipCount === 0 && place.special && (
          <Link href={detailHref} className="mt-1.5 flex items-start gap-1.5 rounded-xl bg-terracotta-tint/70 px-2.5 py-1.5 text-[12px] leading-snug hover:bg-terracotta-tint">
            <SparkleIcon size={12} className="text-terracotta mt-[2px] shrink-0" />
            <span className="line-clamp-2">{place.special}</span>
          </Link>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {place.noteClipMediaId && <AudioClip mediaId={place.noteClipMediaId} label={carried ? `@${noteAuthor!.username}'s voice note` : "Voice note"} />}
          {expanded && hours.length > 0 && <HoursSummary hours={hours} tz={placeTimeZone(place.country, place.lng)} />}
          {expanded && place.lat && place.lng && (
            <a
              className="text-[11px] text-ink-muted inline-flex items-center gap-1 hover:text-terracotta"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}${place.googlePlaceId && !place.googlePlaceId.startsWith("mock:") ? `&query_place_id=${place.googlePlaceId}` : ""}`}
              target="_blank"
              rel="noreferrer"
              {...trackAttrs("tap_directions", place.guideId, place.id)}
            >
              <PinIcon size={12} /> Open in Maps
            </a>
          )}
          {place.reserveUrl && (
            <a
              className="text-[11px] font-medium text-terracotta inline-flex items-center gap-1 hover:underline"
              href={place.reserveUrl}
              target="_blank"
              rel="noreferrer"
              {...trackAttrs("tap_reserve", place.guideId, place.id)}
            >
              <CalendarIcon size={12} /> Reserve
            </a>
          )}
          <Link href={detailHref} className="text-[11px] text-ink-muted inline-flex items-center gap-1 hover:text-terracotta">
            <ChatIcon size={12} /> {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "Details"}
          </Link>
        </div>
        {flagged && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-ochre-soft/70 px-2.5 py-1.5 text-[11.5px] text-ink">
            <AlertIcon size={13} />
            {flagged === "CLOSED_PERMANENTLY" ? "This place may have closed permanently — check it." : "This place may be temporarily closed — check it."}
          </div>
        )}
      </div>
    </div>
  );
}
