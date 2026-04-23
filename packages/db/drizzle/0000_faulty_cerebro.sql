CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`diff_json` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`short_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`intaken_by_user_id` text NOT NULL,
	`event_id` text,
	`title` text NOT NULL,
	`set_name` text DEFAULT '' NOT NULL,
	`set_number` text DEFAULT '' NOT NULL,
	`rarity` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'EN' NOT NULL,
	`edition` text DEFAULT '' NOT NULL,
	`condition` text DEFAULT 'Near Mint' NOT NULL,
	`is_graded` integer DEFAULT false NOT NULL,
	`grading_company` text,
	`grade` text,
	`cert_number` text,
	`photo_path` text,
	`pricing_mode` text DEFAULT 'fixed' NOT NULL,
	`price_idr` integer,
	`listed_price_idr` integer,
	`bottom_price_idr` integer,
	`status` text DEFAULT 'available' NOT NULL,
	`oversold` integer DEFAULT false NOT NULL,
	`locked_by_cart_id` text,
	`locked_by_user_id` text,
	`locked_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`intaken_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_client_id_unique` ON `cards` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_short_id_unique` ON `cards` (`short_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_client_id_idx` ON `cards` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cards_short_id_idx` ON `cards` (`short_id`);--> statement-breakpoint
CREATE INDEX `cards_owner_idx` ON `cards` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `cards_status_idx` ON `cards` (`status`);--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`cart_id` text NOT NULL,
	`card_id` text NOT NULL,
	`intended_price_idr` integer NOT NULL,
	`line_discount_idr` integer DEFAULT 0 NOT NULL,
	`line_discount_pct` integer DEFAULT 0 NOT NULL,
	`line_discount_reason` text,
	`requires_admin_override` integer DEFAULT false NOT NULL,
	`override_by_user_id` text,
	`override_reason` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`override_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`cashier_user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`abandoned_reason` text,
	`paid_transaction_id` text,
	`last_activity_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cashier_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carts_client_id_unique` ON `carts` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `carts_client_id_idx` ON `carts` (`client_id`);--> statement-breakpoint
CREATE TABLE `cash_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`date` text NOT NULL,
	`expected_cash_idr` integer NOT NULL,
	`counted_cash_idr` integer NOT NULL,
	`variance_idr` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`closed_by_user_id` text,
	`closed_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holds` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`held_by_user_id` text NOT NULL,
	`customer_label` text DEFAULT '' NOT NULL,
	`expires_at` integer NOT NULL,
	`released_at` integer,
	`release_reason` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`held_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`updated_by_user_id` text,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `transaction_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`card_id` text NOT NULL,
	`owner_user_id_snapshot` text NOT NULL,
	`listed_price_idr_snapshot` integer NOT NULL,
	`sold_price_idr` integer NOT NULL,
	`line_discount_idr` integer DEFAULT 0 NOT NULL,
	`line_discount_reason` text,
	`override_below_bottom` integer DEFAULT false NOT NULL,
	`override_reason` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ti_transaction_idx` ON `transaction_items` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `ti_card_idx` ON `transaction_items` (`card_id`);--> statement-breakpoint
CREATE INDEX `ti_owner_snapshot_idx` ON `transaction_items` (`owner_user_id_snapshot`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`cart_id` text,
	`event_id` text NOT NULL,
	`cashier_user_id` text NOT NULL,
	`kind` text DEFAULT 'sale' NOT NULL,
	`parent_transaction_id` text,
	`subtotal_idr` integer NOT NULL,
	`discount_idr` integer DEFAULT 0 NOT NULL,
	`discount_reason` text,
	`total_idr` integer NOT NULL,
	`payment_channel_id` text,
	`payment_note` text,
	`paid_at` integer,
	`void_or_refund_reason` text,
	`notes` text,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cashier_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_channel_id`) REFERENCES `payment_channels`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_client_id_unique` ON `transactions` (`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_client_id_idx` ON `transactions` (`client_id`);--> statement-breakpoint
CREATE INDEX `transactions_event_idx` ON `transactions` (`event_id`);--> statement-breakpoint
CREATE INDEX `transactions_cashier_idx` ON `transactions` (`cashier_user_id`);--> statement-breakpoint
CREATE INDEX `transactions_kind_idx` ON `transactions` (`kind`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'cashier' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);