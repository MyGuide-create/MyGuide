CREATE TABLE `place_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`google_place_id` text,
	`phone` text,
	`hours_json` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `place_locations_place_idx` ON `place_locations` (`place_id`,`position`);
