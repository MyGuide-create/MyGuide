import { hashInt } from "@/lib/utils";
import { CategoryGlyph } from "./Icons";
import { cx } from "./ui";

const GRADIENTS = [
  "linear-gradient(135deg, oklch(62% 0.13 45), oklch(72% 0.09 55))",
  "linear-gradient(135deg, oklch(72% 0.09 55), oklch(62% 0.13 45))",
  "linear-gradient(135deg, oklch(62% 0.13 150), oklch(75% 0.08 130))",
  "linear-gradient(135deg, oklch(74% 0.11 80), oklch(62% 0.13 45))",
  "linear-gradient(135deg, oklch(56% 0.1 40), oklch(70% 0.1 60))",
];

/** A place's square tile: creator photo, Maps photo, or a category glyph on a warm gradient (no tilt since 16 Oct 2026). */
export function PlaceTile({
  place,
  size = 72,
  className,
}: {
  place: { id: string; name: string; category: string; photoUrl?: string | null; photoMediaId?: string | null };
  size?: number;
  className?: string;
}) {
  const i = hashInt(place.id, GRADIENTS.length);
  const src = place.photoMediaId ? `/api/media/${place.photoMediaId}` : place.photoUrl || null;
  return (
    <div
      className={cx("shrink-0 rounded-tile overflow-hidden flex items-center justify-center shadow-[0_2px_6px_oklch(22%_0.02_60/0.12)]", className)}
      style={{ width: size, height: size, background: GRADIENTS[i] }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={place.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <CategoryGlyph name={place.category} size={Math.round(size * 0.36)} />
      )}
    </div>
  );
}
