-- Claps (14 Oct 2026): a 👏 on a friend's activity post (spots they recommended in a city on a day, or a
-- new guide), with an optional one-tap note. Nothing is saved to the clapper's places. The note also
-- rides on the "clap" notification.
CREATE TABLE `claps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`owner_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claps_user_target` ON `claps` (`user_id`,`kind`,`target`);
--> statement-breakpoint
CREATE INDEX `claps_target_idx` ON `claps` (`kind`,`target`);
--> statement-breakpoint
ALTER TABLE `notifications` ADD `note` text;
