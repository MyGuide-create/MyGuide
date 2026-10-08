CREATE TABLE `app_errors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`context` text NOT NULL,
	`message` text NOT NULL,
	`digest` text,
	`page` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `app_errors_created_idx` ON `app_errors` (`created_at`);
