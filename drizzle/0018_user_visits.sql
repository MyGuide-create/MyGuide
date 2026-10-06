ALTER TABLE `users` ADD `last_seen_at` integer;
--> statement-breakpoint
CREATE TABLE `user_visits` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`standalone` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_visits_day_idx` ON `user_visits` (`day`);
--> statement-breakpoint
-- Rough history from before visits were recorded: any day a signed-in person opened a guide or place (UAE days).
INSERT OR IGNORE INTO `user_visits` (`user_id`, `day`, `standalone`, `created_at`)
SELECT `user_id`, date(`created_at` / 1000 + 4 * 3600, 'unixepoch'), 0, min(`created_at`)
FROM `events`
WHERE `user_id` IS NOT NULL AND `user_id` IN (SELECT `id` FROM `users`)
GROUP BY `user_id`, date(`created_at` / 1000 + 4 * 3600, 'unixepoch');
--> statement-breakpoint
-- Everyone visited on the day they signed up.
INSERT OR IGNORE INTO `user_visits` (`user_id`, `day`, `standalone`, `created_at`)
SELECT `id`, date(`created_at` / 1000 + 4 * 3600, 'unixepoch'), 0, `created_at` FROM `users`;
--> statement-breakpoint
UPDATE `users` SET `last_seen_at` = (SELECT max(`created_at`) FROM `events` WHERE `events`.`user_id` = `users`.`id`);
