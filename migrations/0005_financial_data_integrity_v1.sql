-- DelightApp Financial / Database Integrity V1
-- Production duplicate audit passed on 2026-09-21.
-- Forward-only unique indexes; no historical values are modified.

PRAGMA foreign_keys = ON;

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
