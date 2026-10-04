-- Merge "What makes it special" into the place note ("Description - What Makes It Special").
UPDATE `places` SET `note` = CASE
  WHEN trim(`note`) = '' THEN trim(`special`)
  WHEN instr(`note`, trim(`special`)) > 0 THEN `note`
  ELSE rtrim(`note`) || char(10) || char(10) || trim(`special`)
END
WHERE `special` IS NOT NULL AND trim(`special`) <> '';
--> statement-breakpoint
UPDATE `places` SET `special` = NULL WHERE `special` IS NOT NULL;
