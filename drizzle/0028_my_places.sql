-- "Saved places" is now "My places" (12 Oct 2026). Only the private list itself (never published);
-- skipped for anyone who already has an unpublished guide called "My places".
UPDATE `guides` SET `title` = 'My places', `description` = 'Every place you''ve added. Group them into guides whenever you like.'
WHERE `title` = 'Saved places' AND `published_at` IS NULL
  AND `owner_id` NOT IN (SELECT `owner_id` FROM `guides` WHERE `title` = 'My places' AND `published_at` IS NULL);
