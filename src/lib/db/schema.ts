import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * MyGuide data model.
 *
 * Forward-looking notes (see the build brief, section 10):
 * - `users.accountType` exists so institutional/creator accounts can be
 *   distinguished later without a migration on the hot path. Verification and
 *   monetisation are NOT modelled yet, on purpose.
 * - `guides.visibility` is a plain string so a paid tier ("subscribers") can be
 *   added later without changing the column type.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  avatarMediaId: text("avatar_media_id"),
  accountType: text("account_type").notNull().default("personal"),
  /** "public" | "private" — private accounts require an approved follow request before their guides are visible. */
  profileVisibility: text("profile_visibility").notNull().default("public"),
  /** Creator links shown on the profile. */
  instagram: text("instagram"),
  website: text("website"),
  /** Set once the new-user welcome (people to follow) has been seen. */
  onboardedAt: integer("onboarded_at", { mode: "timestamp_ms" }),
  /** Last time the app was opened while signed in (updated at most every ~30 min). */
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** "Continue with Google / Apple": one row per linked sign-in. A user can have several, plus a password. */
export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    /** "google" | "apple" */
    provider: text("provider").notNull(),
    /** The provider's stable user id (the id token's `sub`). */
    providerUserId: text("provider_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), index("oauth_accounts_user_idx").on(t.userId)],
);

export const guides = sqliteTable(
  "guides",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default(""),
    /** Centre of the guide's city/region (from the city picker), for the map and place search before any places are added. */
    lat: real("lat"),
    lng: real("lng"),
    description: text("description").notNull().default(""),
    coverMediaId: text("cover_media_id"),
    /** External cover photo (Unsplash hotlink or Google Places photo proxy). Ignored when coverMediaId is set. */
    coverUrl: text("cover_url"),
    /** "unsplash" | "google" */
    coverSource: text("cover_source"),
    /** Photographer name, shown as attribution on the cover. */
    coverCredit: text("cover_credit"),
    coverCreditUrl: text("cover_credit_url"),
    /** "public" | "private" */
    visibility: text("visibility").notNull().default("private"),
    allowFork: integer("allow_fork", { mode: "boolean" }).notNull().default(true),
    forkedFromGuideId: text("forked_from_guide_id"),
    forkedFromUserId: text("forked_from_user_id"),
    /** Secret used in share links for private guides. */
    shareToken: text("share_token").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    /** Creator confirmed the guide is still accurate ("Checked Oct 2026"). */
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("guides_owner_idx").on(t.ownerId),
    index("guides_visibility_idx").on(t.visibility, t.publishedAt),
    index("guides_city_idx").on(t.city),
  ],
);

export const places = sqliteTable(
  "places",
  {
    id: text("id").primaryKey(),
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    /** Neighbourhood from Google ("Umm Suqeim", "Canggu"); "" when unknown — then it's guessed from the address. */
    area: text("area").notNull().default(""),
    city: text("city").notNull().default(""),
    country: text("country").notNull().default(""),
    lat: real("lat"),
    lng: real("lng"),
    category: text("category").notNull().default("Food & Drinks"),
    /** External photo URL (Google Places proxy or mock). */
    photoUrl: text("photo_url"),
    /** Creator-uploaded photo, overrides photoUrl when set. */
    photoMediaId: text("photo_media_id"),
    /** JSON array of weekday strings, e.g. ["Mon: 11:00–21:00", ...] */
    hoursJson: text("hours_json"),
    googlePlaceId: text("google_place_id"),
    /** OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | null */
    businessStatus: text("business_status"),
    phone: text("phone"),
    /** Venue website (from Google Places, editable by the creator). */
    website: text("website"),
    /** Instagram handle without "@" (creator-entered). */
    instagram: text("instagram"),
    /** WhatsApp number in international form, digits only with leading "+" (creator-entered). */
    whatsapp: text("whatsapp"),
    /** Reservation / booking link (creator-entered; later swappable for a partner or venue-tracked link). */
    reserveUrl: text("reserve_url"),
    /** Deprecated (migration 0013): merged into `note` ("Description - What Makes It Special"). Always null now; kept to avoid a table rebuild. */
    special: text("special"),
    note: text("note").notNull().default(""),
    noteClipMediaId: text("note_clip_media_id"),
    /** Who wrote the current note (differs from guide owner on forked guides). */
    noteAuthorId: text("note_author_id"),
    /**
     * Copied from this place (Copy guide, Add to my guide, trip combine). The original creator's note and
     * tips are shown on the copy live from here, credited and read-only — they're never copied as text.
     * Null when the place was added directly, or the source guide doesn't share its notes.
     */
    sourcePlaceId: text("source_place_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("places_guide_idx").on(t.guideId, t.position)],
);

export const placePhotos = sqliteTable(
  "place_photos",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    mediaId: text("media_id").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("place_photos_place_idx").on(t.placeId, t.position)],
);

export const placeTips = sqliteTable(
  "place_tips",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("place_tips_place_idx").on(t.placeId, t.position)],
);

/**
 * Extra branches of a place (a café with four locations): one guide entry, one description,
 * several pins. The place row itself stays the main branch.
 */
export const placeLocations = sqliteTable(
  "place_locations",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    /** Branch name as Google lists it, e.g. "Ravi Restaurant - Satwa"; may equal the place name. */
    name: text("name").notNull(),
    address: text("address").notNull().default(""),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    /** Null for a dropped pin. */
    googlePlaceId: text("google_place_id"),
    phone: text("phone"),
    hoursJson: text("hours_json"),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("place_locations_place_idx").on(t.placeId, t.position)],
);

export const placeComments = sqliteTable(
  "place_comments",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("place_comments_place_idx").on(t.placeId, t.createdAt)],
);

export const follows = sqliteTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "accepted" | "pending" — pending means a follow request awaiting the target's approval (private accounts only). */
    status: text("status").notNull().default("accepted"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_following_idx").on(t.followingId),
  ],
);

export const guideShares = sqliteTable(
  "guide_shares",
  {
    id: text("id").primaryKey(),
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    sharedById: text("shared_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sharedWithId: text("shared_with_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("guide_shares_unique").on(t.guideId, t.sharedWithId),
    index("guide_shares_with_idx").on(t.sharedWithId),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "guide_shared" | "new_follower" | "follow_request" | "follow_accepted" | "place_comment" | "guide_published" | "places_added" | "guide_used" | "collab_invite" | "user_joined" | "wish_granted" */
    type: text("type").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "cascade" }),
    guideId: text("guide_id").references(() => guides.id, { onDelete: "cascade" }),
    /** Soft reference to a place, for deep-linking a place_comment notification — not a hard FK, matching forkedFromGuideId's pattern. */
    placeId: text("place_id"),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    /** How many things this notification covers (e.g. places added in one batch). */
    count: integer("count").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const media = sqliteTable("media", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** "image" | "audio" */
  kind: text("kind").notNull(),
  mime: text("mime").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  /** Duration in seconds for audio clips. */
  durationSec: real("duration_sec"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Usage events for the pilot (and later, booking-link attribution).
 * Soft references only (no FKs) so analytics never block deletes.
 * type: "guide_view" | "place_view" | "share" | "fork" | "tap_directions" | "tap_call"
 */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    guideId: text("guide_id").notNull(),
    placeId: text("place_id"),
    /** Signed-in viewer, if any. */
    userId: text("user_id"),
    /** Anonymous per-browser id (mg_vid cookie), so signed-out viewers can be counted once. */
    visitorId: text("visitor_id"),
    /** True when the viewer is the guide's creator — excluded from "used by others" stats. */
    isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("events_type_idx").on(t.type, t.createdAt), index("events_guide_idx").on(t.guideId, t.type)],
);

export type User = typeof users.$inferSelect;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type Guide = typeof guides.$inferSelect;
export type Place = typeof places.$inferSelect;
export type PlacePhoto = typeof placePhotos.$inferSelect;
/** A reader's saved ("hearted") places — their personal shortlist across guides. */
export const savedPlaces = sqliteTable(
  "saved_places",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.placeId] }), index("saved_places_place_idx").on(t.placeId)],
);

export type SavedPlace = typeof savedPlaces.$inferSelect;

/** A reader's saved (favourited) guides. */
export const savedGuides = sqliteTable(
  "saved_guides",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.guideId] }), index("saved_guides_guide_idx").on(t.guideId)],
);
export type PlaceTip = typeof placeTips.$inferSelect;
export type PlaceLocation = typeof placeLocations.$inferSelect;
export type PlaceComment = typeof placeComments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Media = typeof media.$inferSelect;
export type UsageEvent = typeof events.$inferSelect;

/** People the owner has invited to edit a guide with them. */
export const guideCollaborators = sqliteTable(
  "guide_collaborators",
  {
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.guideId, t.userId] }), index("guide_collaborators_user_idx").on(t.userId)],
);

/** Reader reactions on a place: "been" (I've been here) and "loved" (loved it). */
export const placeReactions = sqliteTable(
  "place_reactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.placeId, t.kind] }), index("place_reactions_place_idx").on(t.placeId)],
);

/** One user blocking another: hides each other's content and stops follows/comments between them. */
export const blocks = sqliteTable(
  "blocks",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] }), index("blocks_blocked_idx").on(t.blockedId)],
);

/** Content reports for moderation. targetType: "guide" | "user" | "comment". */
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").references(() => users.id, { onDelete: "set null" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** In-app feedback from pilot users. */
export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  page: text("page"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

/** Web Push subscriptions (one per browser/device). */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * One row per signed-in person per day they opened the app (day = calendar day in the pilot's
 * time zone, "YYYY-MM-DD"). Powers "came back" / retention on /admin. standalone = opened from the
 * home-screen app at least once that day.
 */
export const userVisits = sqliteTable(
  "user_visits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    standalone: integer("standalone", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] }), index("user_visits_day_idx").on(t.day)],
);

/** "I'm going to …" — a planned trip that gathers guides and favourites for a city. */
export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    country: text("country").notNull().default(""),
    startDate: text("start_date"),
    endDate: text("end_date"),
    /** The private guide this trip's places were combined into ("My Lisbon trip"). */
    guideId: text("guide_id").references(() => guides.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("trips_user_idx").on(t.userId)],
);

export type Trip = typeof trips.$inferSelect;
export type Report = typeof reports.$inferSelect;

/**
 * Guide wish list: cities someone wants a guide to, shown on their profile and on /wishes.
 * One row per person per city (city stored canonical via findCity when known).
 */
export const guideWishes = sqliteTable(
  "guide_wishes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    country: text("country").notNull().default(""),
    /** What they're after, e.g. "with kids", "vegan", "nightlife". */
    note: text("note").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("guide_wishes_user_idx").on(t.userId, t.createdAt), index("guide_wishes_city_idx").on(t.city)],
);

/**
 * A guide made (or sent) for a wish. Created when someone starts a guide "for" a wish;
 * `sentAt` is set once the guide is published and shared with the wisher.
 */
export const wishGrants = sqliteTable(
  "wish_grants",
  {
    wishId: text("wish_id")
      .notNull()
      .references(() => guideWishes.id, { onDelete: "cascade" }),
    guideId: text("guide_id")
      .notNull()
      .references(() => guides.id, { onDelete: "cascade" }),
    grantedById: text("granted_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.wishId, t.guideId] }), index("wish_grants_guide_idx").on(t.guideId)],
);

export type GuideWish = typeof guideWishes.$inferSelect;
export type WishGrant = typeof wishGrants.$inferSelect;
