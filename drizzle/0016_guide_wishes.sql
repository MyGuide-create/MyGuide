CREATE TABLE `guide_wishes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`city` text NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guide_wishes_user_idx` ON `guide_wishes` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `guide_wishes_city_idx` ON `guide_wishes` (`city`);
--> statement-breakpoint
CREATE TABLE `wish_grants` (
	`wish_id` text NOT NULL,
	`guide_id` text NOT NULL,
	`granted_by_id` text NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`wish_id`, `guide_id`),
	FOREIGN KEY (`wish_id`) REFERENCES `guide_wishes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wish_grants_guide_idx` ON `wish_grants` (`guide_id`);
