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
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

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
    /** Creator-authored: "What makes it special", shown on the place detail page. Expert tips are a separate table (many per place). */
    special: text("special"),
    note: text("note").notNull().default(""),
    noteClipMediaId: text("note_clip_media_id"),
    /** Who wrote the current note (differs from guide owner on forked guides). */
    noteAuthorId: text("note_author_id"),
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
    /** "guide_shared" | "new_follower" | "follow_request" | "follow_accepted" | "place_comment" | "guide_published" | "places_added" */
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
export type PlaceTip = typeof placeTips.$inferSelect;
export type PlaceComment = typeof placeComments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Media = typeof media.$inferSelect;
export type UsageEvent = typeof events.$inferSelect;
