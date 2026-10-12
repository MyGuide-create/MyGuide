-- City tiles: towns and resorts (Sotogrande) found nothing for "<town> landmark skyline" / "<town> city"
-- and were stored as "no photo". Searches now also try the plain name and name + country, so look
-- those up again (12 Oct 2026).
DELETE FROM `city_photos` WHERE `url` IS NULL;
