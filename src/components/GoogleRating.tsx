import { compactCount, priceLabel, type GoogleRating } from "@/lib/places/ratingFormat";
import { cx } from "./ui";

/** Compact "★ 4.6 (1.2k) · $$" for place rows. Muted so the creator's note stays the main voice. */
export function GoogleRatingInline({ rating, className }: { rating: GoogleRating; className?: string }) {
  const price = priceLabel(rating.price);
  if (!rating.rating && !price) return null;
  return (
    <span className={cx("inline-flex items-center gap-1 tabular-nums text-ink-muted", className)} title={rating.rating ? `${rating.rating} on Google Maps (${rating.count.toLocaleString("en-GB")} reviews)` : "Price level from Google Maps"}>
      {rating.rating > 0 && (
        <>
          <span className="text-ochre" aria-hidden>★</span>
          <span>{rating.rating.toFixed(1)}</span>
          <span className="text-ink-faint">({compactCount(rating.count)})</span>
        </>
      )}
      {price && <span className="text-ink-faint">{rating.rating > 0 ? "· " : ""}{price}</span>}
    </span>
  );
}

/** Place page line: "★ 4.6 · 1,240 reviews on Google Maps · $$", linking to the place on Google Maps. */
export function GoogleRatingLine({ rating, href }: { rating: GoogleRating; href: string }) {
  const price = priceLabel(rating.price);
  if (!rating.rating && !price) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-muted tabular-nums hover:text-terracotta">
      {rating.rating > 0 && (
        <>
          <span className="text-ochre" aria-hidden>★</span>
          <span className="font-medium text-ink">{rating.rating.toFixed(1)}</span>
          <span>· {rating.count.toLocaleString("en-GB")} review{rating.count === 1 ? "" : "s"} on Google Maps</span>
        </>
      )}
      {!rating.rating && <span>Google Maps</span>}
      {price && <span>· {price}</span>}
    </a>
  );
}
