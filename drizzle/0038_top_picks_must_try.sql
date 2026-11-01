-- Top picks and Must try (1 Nov 2026). Top pick (crown): one of your best vouched spots in a city, public, up to 10 per city.
-- Must try (star): a spot you haven't been to yet that you want to prioritise, private; on your own private spots and on spots you saved.
ALTER TABLE `places` ADD `top_pick_at` integer;
--> statement-breakpoint
ALTER TABLE `places` ADD `must_try_at` integer;
--> statement-breakpoint
ALTER TABLE `saved_places` ADD `must_try_at` integer;
