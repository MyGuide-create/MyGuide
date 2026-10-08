CREATE TABLE `guide_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`requester_id` text NOT NULL,
	`recipient_id` text,
	`wish_id` text,
	`city` text NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`lat` real,
	`lng` real,
	`note` text DEFAULT '' NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`guide_id` text,
	`opened_at` integer,
	`responded_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wish_id`) REFERENCES `guide_wishes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guide_requests_token_unique` ON `guide_requests` (`token`);
--> statement-breakpoint
CREATE INDEX `guide_requests_requester_idx` ON `guide_requests` (`requester_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `guide_requests_recipient_idx` ON `guide_requests` (`recipient_id`,`status`);
--> statement-breakpoint
CREATE INDEX `guide_requests_guide_idx` ON `guide_requests` (`guide_id`);
--> statement-breakpoint
ALTER TABLE `notifications` ADD `request_id` text;
