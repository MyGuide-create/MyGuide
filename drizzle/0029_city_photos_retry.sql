-- City tiles: lookups that failed (Unsplash rate limit) were stored as "no photo" and not retried
-- for a week. Clear them so those cities are looked up again (12 Oct 2026).
DELETE FROM `city_photos` WHERE `url` IS NULL;
