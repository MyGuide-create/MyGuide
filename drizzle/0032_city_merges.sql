-- Admin › Cities: towns merged into a bigger city, or kept as their own ("into" = ''). Read by the settle job
-- (src/lib/settleCities.ts) before its distance rules (13 Oct 2026).
CREATE TABLE `city_merges` (
	`town` text PRIMARY KEY NOT NULL,
	`into` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
