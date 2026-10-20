-- Featured accounts (20 Oct 2026): their places, guides, vouches, hearts and comments show in everyone's Discoveries feed.
ALTER TABLE `users` ADD `is_featured` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `is_featured` = 1 WHERE lower(`username`) IN ('hishamsamawi', 'shahryar');
--> statement-breakpoint
-- Hearts by people (20 Oct 2026) are read back by who gave them, newest first.
CREATE INDEX IF NOT EXISTS `claps_user_created_idx` ON `claps` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `place_comments_author_idx` ON `place_comments` (`author_id`, `created_at`);
