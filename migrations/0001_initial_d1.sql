-- DelightApp D1 initial compatibility schema
-- Source audited from production Google Sheet "dataAI" on 2026-09-21.
-- Goal: preserve current application behavior during Google Sheets -> D1 migration.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX idx_users_username ON users(username);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  water_rate REAL NOT NULL DEFAULT 0,
  electric_rate REAL NOT NULL DEFAULT 0,
  address TEXT NOT NULL DEFAULT '',
  bill_notes TEXT NOT NULL DEFAULT '',
  qr_image TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL DEFAULT '',
  vat_enabled INTEGER NOT NULL DEFAULT 0 CHECK (vat_enabled IN (0, 1)),
  vat_rate REAL NOT NULL DEFAULT 0,
  vat_type_rent TEXT NOT NULL DEFAULT 'none'
    CHECK (vat_type_rent IN ('none', 'exclusive', 'inclusive')),
  vat_type_water TEXT NOT NULL DEFAULT 'none'
    CHECK (vat_type_water IN ('none', 'exclusive', 'inclusive')),
  vat_type_electric TEXT NOT NULL DEFAULT 'none'
    CHECK (vat_type_electric IN ('none', 'exclusive', 'inclusive')),
  tax_id TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_properties_owner_id ON properties(owner_id);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  room_number TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  rent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'vacant'
    CHECK (status IN ('vacant', 'occupied')),
  room_type TEXT NOT NULL DEFAULT '',
  deposit REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE INDEX idx_rooms_property_id ON rooms(property_id);
CREATE INDEX idx_rooms_status ON rooms(status);

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  move_in_date TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_tenants_room_id ON tenants(room_id);

CREATE TABLE bills (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  month TEXT NOT NULL,
  invoice_no TEXT NOT NULL DEFAULT '',
  rent REAL NOT NULL DEFAULT 0,
  water_prev REAL NOT NULL DEFAULT 0,
  water_curr REAL NOT NULL DEFAULT 0,
  water_charge REAL NOT NULL DEFAULT 0,
  electric_prev REAL NOT NULL DEFAULT 0,
  electric_curr REAL NOT NULL DEFAULT 0,
  electric_charge REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'paid')),
  vat_subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  tax_invoice_no TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_bills_room_id ON bills(room_id);
CREATE INDEX idx_bills_month ON bills(month);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_room_month ON bills(room_id, month);
CREATE INDEX idx_bills_invoice_no ON bills(invoice_no);
CREATE INDEX idx_bills_tax_invoice_no ON bills(tax_invoice_no);

CREATE TABLE deposits (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  received_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_deposits_room_id ON deposits(room_id);

CREATE TABLE meter_readings (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  bill_id TEXT NOT NULL DEFAULT '',
  month TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '',
  previous_reading REAL NOT NULL DEFAULT 0,
  current_reading REAL NOT NULL DEFAULT 0,
  units_used REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_meter_readings_room_id ON meter_readings(room_id);
CREATE INDEX idx_meter_readings_bill_id ON meter_readings(bill_id);
CREATE INDEX idx_meter_readings_month ON meter_readings(month);
CREATE INDEX idx_meter_readings_type ON meter_readings(type);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  bill_id TEXT NOT NULL DEFAULT '',
  receipt_no TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  received_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  vat_subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_receipts_room_id ON receipts(room_id);
CREATE INDEX idx_receipts_bill_id ON receipts(bill_id);
CREATE INDEX idx_receipts_receipt_no ON receipts(receipt_no);

CREATE TABLE room_layouts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX idx_room_layouts_room_id ON room_layouts(room_id);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  table_name TEXT NOT NULL DEFAULT '',
  affected_ids TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
