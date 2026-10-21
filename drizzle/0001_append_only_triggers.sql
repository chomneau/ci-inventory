-- Audit log and stock ledger are append-only. Corrections are new rows, never edits.
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log`
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `stock_movements_no_update` BEFORE UPDATE ON `stock_movements`
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `stock_movements_no_delete` BEFORE DELETE ON `stock_movements`
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only');
END;
