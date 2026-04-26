ALTER TABLE `payment_channels` ADD `version` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `settings` ADD `version` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `cart_items` ADD `version` integer NOT NULL DEFAULT 1;
