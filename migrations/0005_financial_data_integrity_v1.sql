-- DelightApp Financial / Database Integrity V1
-- Production duplicate audit passed on 2026-09-21.
-- Forward-only unique indexes; no historical values are modified.

PRAGMA foreign_keys = ON;

-- Atomic numeric ID allocation for authoritative business rows.
CREATE TABLE id_counters (
  table_name TEXT PRIMARY KEY,
  next_id INTEGER NOT NULL
);

INSERT INTO id_counters SELECT 'users', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM users;
INSERT INTO id_counters SELECT 'properties', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM properties;
INSERT INTO id_counters SELECT 'rooms', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM rooms;
INSERT INTO id_counters SELECT 'tenants', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM tenants;
INSERT INTO id_counters SELECT 'bills', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM bills;
INSERT INTO id_counters SELECT 'deposits', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM deposits;
INSERT INTO id_counters SELECT 'meter_readings', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM meter_readings;
INSERT INTO id_counters SELECT 'receipts', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM receipts;
INSERT INTO id_counters SELECT 'room_layouts', COALESCE(MAX(CAST(id AS INTEGER)),0)+1 FROM room_layouts;

-- Atomic document sequences. Existing formats are PREFIX-YYYYMM-SEQUENCE.
CREATE TABLE document_counters (
  kind TEXT PRIMARY KEY,
  next_seq INTEGER NOT NULL
);

INSERT INTO document_counters
SELECT 'invoice', COALESCE(MAX(CAST(substr(invoice_no,12) AS INTEGER)),0)+1
FROM bills WHERE invoice_no<>'';

INSERT INTO document_counters
SELECT 'receipt', COALESCE(MAX(CAST(substr(receipt_no,12) AS INTEGER)),0)+1
FROM receipts WHERE receipt_no<>'';

INSERT INTO document_counters
SELECT 'deposit', COALESCE(MAX(CAST(substr(receipt_no,12) AS INTEGER)),0)+1
FROM deposits WHERE receipt_no<>'';

CREATE UNIQUE INDEX uq_rooms_property_number
  ON rooms(property_id, room_number);

CREATE UNIQUE INDEX uq_tenants_room
  ON tenants(room_id);

CREATE UNIQUE INDEX uq_bills_room_month
  ON bills(room_id, month);

CREATE UNIQUE INDEX uq_bills_invoice_no
  ON bills(invoice_no)
  WHERE invoice_no <> '';

CREATE UNIQUE INDEX uq_receipts_bill_id
  ON receipts(bill_id)
  WHERE bill_id <> '';

CREATE UNIQUE INDEX uq_receipts_receipt_no
  ON receipts(receipt_no)
  WHERE receipt_no <> '';

CREATE UNIQUE INDEX uq_deposits_receipt_no
  ON deposits(receipt_no)
  WHERE receipt_no <> '';

CREATE UNIQUE INDEX uq_room_layouts_room
  ON room_layouts(room_id);
