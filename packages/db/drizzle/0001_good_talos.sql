ALTER TABLE `events` ADD `settled_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `settled_by_user_id` text REFERENCES users(id);