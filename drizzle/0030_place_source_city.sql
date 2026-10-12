-- Places are settled into areas (a Grândola beach in a Comporta guide counts as Comporta); the
-- town Google gave is kept here. Filled by the startup job "settle-cities-v1" (src/lib/settleCities.ts).
ALTER TABLE `places` ADD `source_city` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `app_jobs` (
	`name` text PRIMARY KEY NOT NULL,
	`done_at` integer NOT NULL
);
