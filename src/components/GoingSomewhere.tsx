"use client";

import { useRouter } from "next/navigation";
import { CityPicker } from "./CityPicker";

/** Home's main action: pick a city → that city's guides (people you follow first) and Plan a trip. */
export function GoingSomewhere() {
  const router = useRouter();
  const go = (q: Record<string, string>) => router.push(`/city?${new URLSearchParams(q).toString()}`);
  return (
    <CityPicker
      big
      placeholder="Search a city, e.g. Tashkent"
      onPick={(c) => go({ name: c.city, ...(c.country ? { country: c.country } : {}), ...(Number.isFinite(c.lat) ? { lat: String(c.lat), lng: String(c.lng) } : {}) })}
      onFreeText={(text) => go({ name: text })}
    />
  );
}
