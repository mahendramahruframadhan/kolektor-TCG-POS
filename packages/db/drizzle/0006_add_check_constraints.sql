-- CHECK constraints for paired-NULL field groups.
-- SQLite does not support ALTER TABLE ADD CHECK on existing tables.
-- These invariants are enforced at the application layer:
--   events: settledAt + settledByUserId set atomically in settlement route
--   cards: lockedByCartId + lockedByUserId + lockedAt set atomically in cart operations
-- This migration serves as documentation of the invariant.
SELECT 1; -- no-op to satisfy Drizzle migration format
