ALTER TABLE `users` ADD `profile_visibility` text DEFAULT 'public' NOT NULL;
--> statement-breakpoint
ALTER TABLE `follows` ADD `status` text DEFAULT 'accepted' NOT NULL;
--> statement-breakpoint
ALTER TABLE `notifications` ADD `place_id` text;
--> statement-breakpoint
CREATE TABLE `place_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `place_comments_place_idx` ON `place_comments` (`place_id`,`created_at`);
