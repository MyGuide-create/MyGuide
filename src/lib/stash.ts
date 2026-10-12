/** The private list that holds every place you add (+ → Add a place, imports). Was "Saved places" until 12 Oct 2026. */
export const STASH_TITLE = "My places";

/** Its old name: migration 0028 renames it, and until then both names mean the same list. */
export const OLD_STASH_TITLE = "Saved places";
export const STASH_TITLES = [STASH_TITLE, OLD_STASH_TITLE];

/** Titles a guide can't take, so a guide is never mistaken for the My places list. */
export const isReservedTitle = (title: string) => STASH_TITLES.some((t) => t.toLowerCase() === title.trim().toLowerCase());

/** The My places list (a private, never-published guide) — shown on its own page, not as a guide or draft. */
export const isStash = (g: { title: string; publishedAt: Date | null }) => STASH_TITLES.includes(g.title) && !g.publishedAt;

/** Where the My places page lives (optionally scrolled to one city). */
export const myPlacesHref = (city?: string | null) => (city?.trim() ? `/my-places?city=${encodeURIComponent(city.trim())}#city-${cityAnchor(city)}` : "/my-places");
export const cityAnchor = (city: string) => city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
