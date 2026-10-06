"use client";

import { displayPhone } from "@/lib/phone";
import { placeTimeZone } from "@/lib/places/hours";
import { websiteLabel } from "@/lib/placeLinks";
import { HoursSummary } from "./HoursSummary";
import { CameraIcon, CheckIcon, GlobeIcon, InstagramIcon, PhoneIcon, PinIcon } from "./Icons";

export interface GoogleInfo {
  address: string;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  hours: string[] | null;
  photoCount: number;
  country: string;
  /** Town or region, tidied ("Bali", not "Kabupaten Badung"). */
  city?: string;
  lng: number | null;
  businessStatus?: string | null;
}

/**
 * What Google already filled in for a place — shown while the creator is adding details,
 * so they only write what Google can't know (why they love it, tips, their own photos).
 */
export function GoogleInfoCard({ info, compact }: { info: GoogleInfo; compact?: boolean }) {
  const rows: Array<{ icon: typeof PinIcon; text: React.ReactNode }> = [];
  if (info.address) rows.push({ icon: PinIcon, text: info.address });
  if (info.phone) rows.push({ icon: PhoneIcon, text: displayPhone(info.phone, info.country) });
  if (info.website) rows.push({ icon: GlobeIcon, text: websiteLabel(info.website) });
  if (info.instagram) rows.push({ icon: InstagramIcon, text: `@${info.instagram}` });
  if (info.photoCount > 0) rows.push({ icon: CameraIcon, text: "Google photos — shown until you add your own" });
  const hours = info.hours ?? [];
  if (!rows.length && !hours.length) return null;

  return (
    <div className="rounded-2xl border border-sage/30 bg-sage-tint/60 px-3.5 py-3">
      <p className="text-[11.5px] font-semibold text-sage inline-flex items-center gap-1.5">
        <CheckIcon size={13} /> Filled in from Google — nothing to type here
      </p>
      {info.businessStatus === "CLOSED_PERMANENTLY" && <p className="mt-1.5 text-[12px] font-medium text-danger">Google lists this place as permanently closed.</p>}
      {info.businessStatus === "CLOSED_TEMPORARILY" && <p className="mt-1.5 text-[12px] font-medium text-ink">Google lists this place as temporarily closed.</p>}
      <ul className={compact ? "mt-1.5 flex flex-col gap-1" : "mt-2 flex flex-col gap-1.5"}>
        {hours.length > 0 && (
          <li className="text-[12.5px]"><HoursSummary hours={hours} tz={placeTimeZone(info.country, info.lng)} /></li>
        )}
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-muted">
            <r.icon size={14} className="mt-[1px] shrink-0 text-sage" />
            <span className="min-w-0 truncate">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
