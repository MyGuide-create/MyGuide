"use client";

import { useState } from "react";
import type { Place } from "@/lib/db/schema";
import { normaliseInstagram, normaliseReserve, normaliseWebsite, normaliseWhatsapp, type Normalised } from "@/lib/placeLinks";
import { CalendarIcon, GlobeIcon, InstagramIcon, WhatsAppIcon } from "./Icons";
import { Input, Label } from "./ui";

type Field = "website" | "instagram" | "whatsapp" | "reserveUrl";
type Patch = Partial<Record<Field, string | null>>;

const FIELDS: Array<{
  key: Field;
  label: string;
  placeholder: string;
  icon: typeof GlobeIcon;
  inputMode?: "url" | "tel" | "text";
  hint?: string;
}> = [
  { key: "reserveUrl", label: "Reservation link", placeholder: "Booking page, OpenTable, Eat App…", icon: CalendarIcon, inputMode: "url", hint: "Shown as a “Reserve” button." },
  { key: "instagram", label: "Instagram", placeholder: "@venue", icon: InstagramIcon, inputMode: "text" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "+971 50 123 4567", icon: WhatsAppIcon, inputMode: "tel" },
  { key: "website", label: "Website", placeholder: "venue.com", icon: GlobeIcon, inputMode: "url" },
];

/** How a stored value is shown back in the input. */
const display = (key: Field, v: string | null) => (v ? (key === "instagram" ? `@${v}` : v) : "");

/** Optional contact & booking links for a place, shown as buttons on the place page. */
export function PlaceLinksEditor({ place, onPatch }: { place: Place; onPatch: (patch: Patch) => Promise<void> }) {
  const [values, setValues] = useState<Record<Field, string>>({
    website: display("website", place.website),
    instagram: display("instagram", place.instagram),
    whatsapp: display("whatsapp", place.whatsapp),
    reserveUrl: display("reserveUrl", place.reserveUrl),
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  // Only show what's filled in (often by Google already); the rest is one tap away.
  const [showAll, setShowAll] = useState(false);
  const [initiallyFilled] = useState(() => new Set(FIELDS.filter((f) => !!place[f.key]).map((f) => f.key)));
  const visible = FIELDS.filter((f) => showAll || initiallyFilled.has(f.key));
  const hidden = FIELDS.filter((f) => !visible.includes(f));

  const commit = async (key: Field) => {
    const raw = values[key];
    const r: Normalised =
      key === "website" ? normaliseWebsite(raw)
      : key === "instagram" ? normaliseInstagram(raw)
      : key === "whatsapp" ? normaliseWhatsapp(raw, place.country)
      : normaliseReserve(raw);
    if (!r.ok) {
      setErrors((e) => ({ ...e, [key]: r.error }));
      return;
    }
    setErrors((e) => ({ ...e, [key]: undefined }));
    setValues((v) => ({ ...v, [key]: display(key, r.value) }));
    if (r.value !== (place[key] ?? null)) await onPatch({ [key]: r.value });
  };

  return (
    <div>
      <Label>Links</Label>
      <div className="flex flex-col gap-2">
        {visible.map(({ key, label, placeholder, icon: Icon, inputMode, hint }) => (
          <div key={key}>
            <div className="relative">
              <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <Input
                aria-label={label}
                value={values[key]}
                placeholder={`${label} · ${placeholder}`}
                inputMode={inputMode}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                onBlur={() => void commit(key)}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                className="pl-10 py-2.5 text-[13.5px]"
              />
            </div>
            {errors[key] ? (
              <p className="mt-1 pl-1 text-[11.5px] text-danger">{errors[key]}</p>
            ) : (
              hint && key === "reserveUrl" && <p className="mt-1 pl-1 text-[11px] text-ink-faint">{hint}</p>
            )}
          </div>
        ))}
        {hidden.length > 0 && (
          <button type="button" onClick={() => setShowAll(true)} className="self-start rounded-full border border-dashed border-line px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink">
            + Add {hidden.map((f) => (f.key === "reserveUrl" ? "reservation link" : f.label)).join(", ").replace(/, ([^,]*)$/, " or $1")}
          </button>
        )}
      </div>
    </div>
  );
}
