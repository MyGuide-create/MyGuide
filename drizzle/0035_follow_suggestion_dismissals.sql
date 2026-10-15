-- People someone hid from follow suggestions (✕ on the Home spotlight card, 15 Oct 2026).
CREATE TABLE `suggestion_dismissals` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`target_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `target_id`)
);
