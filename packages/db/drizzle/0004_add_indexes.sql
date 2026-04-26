-- cart_items: fast lookup of items in a cart and of cards in any cart
CREATE INDEX IF NOT EXISTS `cart_items_cart_id_idx` ON `cart_items` (`cart_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cart_items_card_id_idx` ON `cart_items` (`card_id`);--> statement-breakpoint

-- holds: expiry sweep and card-hold lookup
CREATE INDEX IF NOT EXISTS `holds_card_id_idx` ON `holds` (`card_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `holds_expiry_idx` ON `holds` (`expires_at`, `released_at`);--> statement-breakpoint

-- cards: event scoping and cart-lock lookup
CREATE INDEX IF NOT EXISTS `cards_event_id_idx` ON `cards` (`event_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cards_locked_by_cart_idx` ON `cards` (`locked_by_cart_id`);--> statement-breakpoint

-- transactions: cart linkage, void/refund parent lookup, monthly report date filter
CREATE INDEX IF NOT EXISTS `transactions_cart_id_idx` ON `transactions` (`cart_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_parent_idx` ON `transactions` (`parent_transaction_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `transactions_paid_at_idx` ON `transactions` (`paid_at`);--> statement-breakpoint

-- events: status filter for active event queries
CREATE INDEX IF NOT EXISTS `events_status_idx` ON `events` (`status`);--> statement-breakpoint

-- audit_log: date-range queries for the audit log API + pruner
CREATE INDEX IF NOT EXISTS `audit_created_at_idx` ON `audit_log` (`created_at`);
