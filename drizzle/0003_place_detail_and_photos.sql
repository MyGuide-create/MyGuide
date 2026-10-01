ALTER TABLE `places` ADD `phone` text;
--> statement-breakpoint
ALTER TABLE `places` ADD `special` text;
--> statement-breakpoint
ALTER TABLE `places` ADD `expert_tip` text;
--> statement-breakpoint
CREATE TABLE `place_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `place_photos_place_idx` ON `place_photos` (`place_id`,`position`);
