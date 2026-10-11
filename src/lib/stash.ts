/** The private guide that holds places recorded on the go (Record a place → Save to my Saved places). */
export const STASH_TITLE = "Saved places";

/** The Saved places list (a private, never-published guide) — shown on its own page, not as a guide or draft. */
export const isStash = (g: { title: string; publishedAt: Date | null }) => g.title === STASH_TITLE && !g.publishedAt;
