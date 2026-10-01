CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`guide_id` text NOT NULL,
	`place_id` text,
	`user_id` text,
	`visitor_id` text,
	`is_owner` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_type_idx` ON `events` (`type`,`created_at`);
--> statement-breakpoint
CREATE INDEX `events_guide_idx` ON `events` (`guide_id`,`type`);
