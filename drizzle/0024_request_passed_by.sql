ALTER TABLE `guide_requests` ADD `passed_by_id` text REFERENCES users(id) ON DELETE set null;
