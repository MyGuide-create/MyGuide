ALTER TABLE `trips` ADD `guide_id` text REFERENCES guides(id) ON DELETE set null;
