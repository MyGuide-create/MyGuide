CREATE TABLE `follows` (
	`follower_id` text NOT NULL,
	`following_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`follower_id`, `following_id`),
	FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follows_following_idx` ON `follows` (`following_id`);--> statement-breakpoint
CREATE TABLE `guide_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`guide_id` text NOT NULL,
	`shared_by_id` text NOT NULL,
	`shared_with_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shared_with_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guide_shares_unique` ON `guide_shares` (`guide_id`,`shared_with_id`);--> statement-breakpoint
CREATE INDEX `guide_shares_with_idx` ON `guide_shares` (`shared_with_id`);--> statement-breakpoint
CREATE TABLE `guides` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cover_media_id` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`allow_fork` integer DEFAULT true NOT NULL,
	`forked_from_guide_id` text,
	`forked_from_user_id` text,
	`share_token` text NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guides_slug_unique` ON `guides` (`slug`);--> statement-breakpoint
CREATE INDEX `guides_owner_idx` ON `guides` (`owner_id`);--> statement-breakpoint
CREATE INDEX `guides_visibility_idx` ON `guides` (`visibility`,`published_at`);--> statement-breakpoint
CREATE INDEX `guides_city_idx` ON `guides` (`city`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`duration_sec` real,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`guide_id` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`guide_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`lat` real,
	`lng` real,
	`category` text DEFAULT 'Food & Drinks' NOT NULL,
	`photo_url` text,
	`photo_media_id` text,
	`hours_json` text,
	`google_place_id` text,
	`business_status` text,
	`note` text DEFAULT '' NOT NULL,
	`note_clip_media_id` text,
	`note_author_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `places_guide_idx` ON `places` (`guide_id`,`position`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text,
	`avatar_media_id` text,
	`account_type` text DEFAULT 'personal' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);