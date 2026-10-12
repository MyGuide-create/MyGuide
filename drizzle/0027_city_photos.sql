CREATE TABLE `city_photos` (
	`city_key` text PRIMARY KEY NOT NULL,
	`url` text,
	`author` text,
	`author_url` text,
	`unsplash_id` text,
	`created_at` integer NOT NULL
);
