-- Bali places stored with Google's regency as the city ("Kabupaten Badung") → "Bali"; stray spaces around hyphens ("Crans- Montana").
UPDATE `places` SET `city` = 'Bali' WHERE lower(`city`) IN ('kabupaten badung','kabupaten gianyar','kabupaten tabanan','kabupaten bangli','kabupaten klungkung','kabupaten karangasem','kabupaten buleleng','kabupaten jembrana','kota denpasar','badung regency','gianyar regency','tabanan regency','bangli regency','klungkung regency','karangasem regency','buleleng regency','jembrana regency');
--> statement-breakpoint
UPDATE `trips` SET `city` = 'Bali' WHERE lower(`city`) IN ('kabupaten badung','kabupaten gianyar','kabupaten tabanan','kabupaten bangli','kabupaten klungkung','kabupaten karangasem','kabupaten buleleng','kabupaten jembrana','kota denpasar','badung regency','gianyar regency','tabanan regency');
--> statement-breakpoint
UPDATE `guides` SET `city` = 'Bali' WHERE lower(`city`) IN ('kabupaten badung','kabupaten gianyar','kabupaten tabanan','kabupaten bangli','kabupaten klungkung','kabupaten karangasem','kabupaten buleleng','kabupaten jembrana','kota denpasar','badung regency','gianyar regency','tabanan regency');
--> statement-breakpoint
UPDATE `guides` SET `title` = replace(`title`, 'Kabupaten Badung', 'Bali') WHERE `title` LIKE 'My Kabupaten Badung trip';
--> statement-breakpoint
UPDATE `guides` SET `city` = replace(replace(`city`, '- ', '-'), ' -', '-') WHERE `city` LIKE '%- %' OR `city` LIKE '% -%';
--> statement-breakpoint
UPDATE `places` SET `city` = replace(replace(`city`, '- ', '-'), ' -', '-') WHERE `city` LIKE '%- %' OR `city` LIKE '% -%';
