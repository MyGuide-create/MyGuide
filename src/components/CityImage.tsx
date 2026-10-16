import type { CityPhoto } from "@/lib/db/schema";
import { cx } from "./ui";

/**
 * A city's picture: its iconic photo (Unsplash, see lib/cityPhotos), else a warm tile. Never a
 * guide cover or place photo, which can be anything (a plate of steak for Dubai).
 */
export function CityImage({ photo, className }: { photo?: CityPhoto; className?: string }) {
  if (photo?.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo.url} alt="" className={cx("shrink-0 object-cover bg-cream-deep", className)} loading="lazy" />;
  }
  return <span className={cx("shrink-0 block bg-gradient-to-br from-terracotta-soft to-terracotta", className)} />;
}

/** A city tile's picture with the name over a dark fade. */
export function CityTileImage({ photo, city, className = "h-[170px]", small = false }: { photo?: CityPhoto; city: string; className?: string; small?: boolean }) {
  return (
    <span className="relative block">
      <CityImage photo={photo} className={cx("w-full rounded-2xl", className)} />
      <span aria-hidden className={cx("absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/50 to-transparent", small ? "h-14" : "h-20")} />
      <span className={cx("absolute right-2 font-display leading-tight text-white drop-shadow-[0_1px_4px_rgb(0_0_0/0.45)] truncate", small ? "left-2.5 bottom-2 text-[16px]" : "left-3 bottom-2.5 text-[20px]")}>{city}</span>
    </span>
  );
}
