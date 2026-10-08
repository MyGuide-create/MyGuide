ALTER TABLE `guides` ADD `lat` real;
--> statement-breakpoint
ALTER TABLE `guides` ADD `lng` real;
--> statement-breakpoint
ALTER TABLE `places` ADD `area` text DEFAULT '' NOT NULL;
