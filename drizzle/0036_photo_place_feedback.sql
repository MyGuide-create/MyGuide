-- Photo places (team test, 15 Oct 2026): which guesses people kept or corrected.
CREATE TABLE `photo_place_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`how` text NOT NULL,
	`confidence` text NOT NULL,
	`guess_id` text NOT NULL,
	`guess_name` text NOT NULL,
	`guess_kind` text NOT NULL,
	`chosen_id` text,
	`chosen_name` text,
	`chosen_kind` text,
	`detail` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photo_place_feedback_created_idx` ON `photo_place_feedback` (`created_at`);
