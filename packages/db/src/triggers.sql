-- Append-only enforcement for transactions (§6.1 rule 1)
-- These triggers are applied post-migration; drizzle-kit does not manage them.

CREATE TRIGGER IF NOT EXISTS prevent_update_transactions
BEFORE UPDATE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS prevent_delete_transactions
BEFORE DELETE ON transactions
BEGIN
  SELECT RAISE(ABORT, 'transactions is append-only: DELETE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS prevent_update_transaction_items
BEFORE UPDATE ON transaction_items
BEGIN
  SELECT RAISE(ABORT, 'transaction_items is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS prevent_delete_transaction_items
BEFORE DELETE ON transaction_items
BEGIN
  SELECT RAISE(ABORT, 'transaction_items is append-only: DELETE is forbidden');
END;

-- audit_log is also append-only
CREATE TRIGGER IF NOT EXISTS prevent_update_audit_log
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS prevent_delete_audit_log
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: DELETE is forbidden');
END;
