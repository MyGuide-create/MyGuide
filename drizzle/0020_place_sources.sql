ALTER TABLE `places` ADD `source_place_id` text;
--> statement-breakpoint
CREATE INDEX `places_source_idx` ON `places` (`source_place_id`);
--> statement-breakpoint
-- Notes copied before 8 Oct 2026 (Use this guide, Add to my guide, trip combine) become credited, read-only quotes:
-- link each carried note to the original place (same text, written by that author, in their own guide)...
UPDATE `places` SET `source_place_id` = (
  SELECT s.`id` FROM `places` s JOIN `guides` sg ON sg.`id` = s.`guide_id`
  WHERE s.`id` != `places`.`id`
    AND s.`note` = `places`.`note`
    AND sg.`owner_id` = `places`.`note_author_id`
    AND coalesce(s.`note_author_id`, sg.`owner_id`) = `places`.`note_author_id`
    AND ((s.`google_place_id` IS NOT NULL AND s.`google_place_id` = `places`.`google_place_id`) OR s.`name` = `places`.`name`)
  ORDER BY s.`created_at` LIMIT 1
)
WHERE `note_author_id` IS NOT NULL AND `note` != ''
  AND `note_author_id` != (SELECT g.`owner_id` FROM `guides` g WHERE g.`id` = `places`.`guide_id`);
--> statement-breakpoint
-- ...and clear the copied text, so the copier's own note box starts empty. Unmatched carried notes keep their "— @author" credit.
UPDATE `places` SET `note` = '', `note_author_id` = NULL, `note_clip_media_id` = NULL WHERE `source_place_id` IS NOT NULL;
