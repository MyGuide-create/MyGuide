-- When a recommendation was last refreshed by its owner (14 Oct 2026): set when they share it, write or
-- change its description, or add/change a tip. Read as the latest of fresh_at, shared_at and
-- created_at (src/lib/fresh.ts). Recommendations get dated, so the city page favours recent ones and
-- can later flag old tips.
ALTER TABLE `places` ADD `fresh_at` integer;
--> statement-breakpoint
UPDATE `places` SET `fresh_at` = MAX(COALESCE(`shared_at`, 0), `created_at`);
