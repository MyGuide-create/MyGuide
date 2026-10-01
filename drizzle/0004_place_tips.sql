CREATE TABLE `place_tips` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`body` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `place_tips_place_idx` ON `place_tips` (`place_id`,`position`);
--> statement-breakpoint
INSERT INTO `place_tips` (`id`, `place_id`, `body`, `position`, `created_at`)
SELECT lower(hex(randomblob(8))), `id`, `expert_tip`, 0, `created_at` FROM `places` WHERE `expert_tip` IS NOT NULL AND trim(`expert_tip`) != '';
