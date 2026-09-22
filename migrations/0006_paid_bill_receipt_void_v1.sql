-- DelightApp Paid Bill Lock + Receipt Void V1
-- Forward-only. Existing receipt amounts/numbers are preserved.

PRAGMA foreign_keys = ON;

ALTER TABLE receipts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','void'));
ALTER TABLE receipts ADD COLUMN voided_at TEXT NOT NULL DEFAULT '';
ALTER TABLE receipts ADD COLUMN voided_by_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE receipts ADD COLUMN void_reason TEXT NOT NULL DEFAULT '';

UPDATE receipts SET status='active' WHERE status IS NULL OR status='';

DROP INDEX IF EXISTS uq_receipts_bill_id;

CREATE UNIQUE INDEX uq_receipts_active_bill_id
  ON receipts(bill_id)
  WHERE bill_id <> '' AND status='active';

CREATE INDEX idx_receipts_status ON receipts(status);
