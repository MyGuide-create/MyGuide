import type { ReactNode } from "react";
import { hashInt, titleSize } from "@/lib/utils";
import { UNSPLASH_HOME } from "@/lib/covers/shared";
import { PinIcon } from "./Icons";
import { cx } from "./ui";

/**
 * Auto-generated cover card in the Warm Journal style. Every guide looks
 * good with zero effort; creators can replace it with their own photo.
 */
export function GuideCover({
  guide,
  ownerUsername,
  className,
  compact,
  bare,
  creditLinks,
  cityLabel,
}: {
  guide: {
    id: string;
    title: string;
    city: string;
    country: string;
    coverMediaId?: string | null;
    coverUrl?: string | null;
    coverSource?: string | null;
    coverCredit?: string | null;
    coverCreditUrl?: string | null;
  };
  ownerUsername: string;
  className?: string;
  compact?: boolean;
  /** Illustration only, no title text (used above the guide heading). */
  bare?: boolean;
  /** Render the photo credit as links (off inside cards, which are already one big link). */
  creditLinks?: boolean;
  /** City pill, bottom-left ("Crans-Montana", "Bali + 2 more"). See lib/coverCity. */
  cityLabel?: string | null;
}) {
  if (guide.coverMediaId) {
    return (
      <div className={cx("relative overflow-hidden bg-cream-deep", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/media/${guide.coverMediaId}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <CoverOverlay city={cityLabel} />
      </div>
    );
  }
  if (guide.coverUrl) {
    return (
      <div className={cx("relative overflow-hidden bg-cream-deep", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={guide.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <CoverOverlay city={cityLabel} credit={<CoverCredit guide={guide} links={creditLinks} />} />
      </div>
    );
  }
  const palettes = [
    { bg: "oklch(91% 0.035 70)", line: "oklch(83% 0.03 65)", pin: "oklch(62% 0.13 45)", pin2: "oklch(62% 0.13 150)" },
    { bg: "oklch(92% 0.03 145)", line: "oklch(84% 0.04 140)", pin: "oklch(62% 0.13 150)", pin2: "oklch(62% 0.13 45)" },
    { bg: "oklch(92% 0.045 55)", line: "oklch(84% 0.05 55)", pin: "oklch(62% 0.13 45)", pin2: "oklch(74% 0.11 80)" },
    { bg: "oklch(93% 0.03 85)", line: "oklch(85% 0.05 85)", pin: "oklch(74% 0.11 80)", pin2: "oklch(62% 0.13 45)" },
  ];
  const p = palettes[hashInt(guide.id, palettes.length)];
  const variant = hashInt(guide.title, 3);
  // Illustrated covers already print the place under the title; the pill is only for the bare header.
  // Just the city on the cover (big); the country is on the guide page.
  const place = cityLabel || guide.city;
  return (
    <div className={cx("relative overflow-hidden", className)} style={{ background: p.bg }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 390 220" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {variant === 0 && (
          <>
            <path d="M-10 40 C 80 90, 150 10, 240 70 S 380 130, 420 90" stroke={p.line} strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M-10 165 C 100 120, 200 205, 400 150" stroke={p.line} strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M60 -10 C 100 60, 40 140, 95 230" stroke={p.line} strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.7" />
          </>
        )}
        {variant === 1 && (
          <>
            <path d="M-20 120 C 60 40, 160 200, 260 90 S 400 60, 420 140" stroke={p.line} strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M300 -20 C 260 60, 340 120, 290 240" stroke={p.line} strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.7" />
            <circle cx="70" cy="170" r="34" fill="none" stroke={p.line} strokeWidth="6" strokeDasharray="4 10" />
          </>
        )}
        {variant === 2 && (
          <>
            <path d="M-10 70 Q 120 -20 200 80 T 420 60" stroke={p.line} strokeWidth="10" fill="none" strokeLinecap="round" />
            <path d="M-10 190 Q 100 140 200 190 T 420 170" stroke={p.line} strokeWidth="8" fill="none" strokeLinecap="round" />
            <path d="M140 230 C 150 170, 220 160, 250 90" stroke={p.line} strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray="1 12" />
          </>
        )}
        {[
          [112, 64, p.pin],
          [228, 108, p.pin],
          [300, 58, p.pin2],
        ].map(([x, y, fill], i) => (
          <g key={i} transform={`translate(${x},${y}) scale(1.5)`}>
            <path d="M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z" fill={String(fill)} />
            <circle cx="12" cy="9" r="2.6" fill="white" />
          </g>
        ))}
      </svg>
      {bare && <CoverOverlay city={cityLabel} />}
      {!bare && <div className={cx("absolute inset-0 flex flex-col justify-end", compact ? "p-3" : "p-5")} style={{ background: `linear-gradient(to top, ${p.bg} 45%, transparent 85%)` }}>
        {place && (
          <div className={cx("flex items-start gap-1.5 font-bold uppercase tracking-[0.03em] leading-[1.05] text-terracotta-deep", compact ? "text-[13px]" : "text-[17px]")}>
            <PinIcon size={compact ? 13 : 17} className="shrink-0 mt-px" />
            <span className="min-w-0">{place}</span>
          </div>
        )}
        <div className="font-display text-ink leading-[1.04] mt-0.5 break-words" style={{ fontSize: titleSize(guide.title, compact ? 19 : 30) }}>{guide.title}</div>
        <div className={cx("text-ink-muted font-medium mt-1", compact ? "text-[10px]" : "text-[12px]")}>@{ownerUsername}</div>
      </div>}
    </div>
  );
}

/** Bottom row over a cover: city pill on the left, photo credit on the right. */
function CoverOverlay({ city, credit }: { city?: string | null; credit?: ReactNode }) {
  if (!city && !credit) return null;
  return (
    <>
      {city && <div className="absolute inset-x-2.5 bottom-2.5 flex pointer-events-none"><CityPill label={city} large /></div>}
      {credit && <div className="absolute top-2 right-2 max-w-[70%] flex justify-end">{credit}</div>}
    </>
  );
}

/** "📍 Crans-Montana" — the same pill everywhere a cover shows. */
export function CityPill({ label, className, large }: { label: string; className?: string; large?: boolean }) {
  return (
    <span className={cx("min-w-0 inline-flex items-center rounded-full bg-ink/70 backdrop-blur-sm text-white shadow-[0_1px_4px_oklch(22%_0.02_60/0.25)]", large ? "max-w-[85%] gap-1 pl-2.5 pr-3 py-1 text-[17px] font-bold leading-6" : "max-w-[75%] gap-1 pl-2 pr-3 py-[5px] text-[14px] font-semibold leading-5", className)}>
      <PinIcon size={large ? 17 : 16} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Photographer attribution, required by both Unsplash and Google Maps. */
function CoverCredit({
  guide,
  links,
}: {
  guide: { coverSource?: string | null; coverCredit?: string | null; coverCreditUrl?: string | null };
  links?: boolean;
}) {
  if (!guide.coverCredit) return null;
  const isUnsplash = guide.coverSource === "unsplash";
  const name = links && guide.coverCreditUrl ? (
    <a href={guide.coverCreditUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{guide.coverCredit}</a>
  ) : (
    guide.coverCredit
  );
  const source = isUnsplash ? (
    links ? <a href={UNSPLASH_HOME} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Unsplash</a> : "Unsplash"
  ) : (
    "Google Maps"
  );
  return (
    <div className="pointer-events-auto min-w-0 max-w-full shrink truncate rounded-full bg-ink/45 backdrop-blur-sm px-2 py-0.5 text-[10px] leading-4 text-white/95">
      Photo: {name} · {source}
    </div>
  );
}
