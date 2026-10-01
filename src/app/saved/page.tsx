import Link from "next/link";
import { AppShell, TopBar } from "@/components/AppShell";
import { PlaceTile } from "@/components/PlaceTile";
import { SaveButton } from "@/components/SaveButton";
import { EmptyState, LinkButton } from "@/components/ui";
import { requireUser, toPublicUser } from "@/lib/auth";
import { listSavedPlaces } from "@/lib/guides";
import { neighbourhood } from "@/lib/places/neighbourhood";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved places" };

export default async function SavedPage() {
  const user = await requireUser("/saved");
  const saved = await listSavedPlaces(user.id);
  const byCity = new Map<string, typeof saved>();
  for (const s of saved) {
    const city = s.place.city || s.place.country || "Other places";
    byCity.set(city, [...(byCity.get(city) ?? []), s]);
  }
  return (
    <AppShell>
      <TopBar back={`/u/${user.username}`} title="Saved places" avatarUser={toPublicUser(user)} />
      <div className="px-4 pt-4 pb-8 flex flex-col gap-6">
        {saved.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            body="Tap the heart on any place in a guide to keep it here — your own shortlist for the trip."
            action={<LinkButton href="/" size="sm">Browse guides</LinkButton>}
          />
        ) : (
          [...byCity.entries()].map(([city, items]) => (
            <section key={city}>
              <h2 className="px-1 flex items-baseline gap-2 border-b border-line pb-1.5 mb-2.5">
                <span className="font-display text-[22px] leading-none">{city}</span>
                <span className="text-[12px] text-ink-faint tabular-nums">{items.length}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {items.map(({ place, guide }) => {
                  const key = guide.visibility === "private" && guide.ownerId !== user.id ? `?key=${guide.shareToken}` : "";
                  return (
                    <li key={place.id} className="flex gap-3 items-center rounded-2xl border border-line/70 bg-paper p-2.5">
                      <Link href={`/g/${guide.slug}/p/${place.id}${key}`} className="flex gap-3 items-center flex-1 min-w-0">
                        <PlaceTile place={place} size={52} />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-[14px] truncate">{place.name}</span>
                          <span className="block text-[11.5px] text-ink-muted truncate">{[place.category, neighbourhood(place.address, place.city, place.country)].filter(Boolean).join(" · ")}</span>
                          <span className="block text-[11.5px] text-ink-faint truncate">from {guide.title}</span>
                        </span>
                      </Link>
                      <SaveButton placeId={place.id} initial signedIn className="mr-1.5" />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
