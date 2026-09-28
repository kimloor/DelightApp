-- DelightApp Import / Export V1
-- Adds legacy-bill import metadata and staging/history tables.
-- Forward-only migration; existing bill values are preserved.

PRAGMA foreign_keys = ON;

ALTER TABLE bills ADD COLUMN bill_date TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN source_document_no TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN calculation_mode TEXT NOT NULL DEFAULT 'standard'
  CHECK (calculation_mode IN ('standard','source_snapshot'));

CREATE INDEX idx_bills_source_document_no
  ON bills(source_document_no);

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  source_filename TEXT NOT NULL DEFAULT '',
  source_file_hash TEXT NOT NULL DEFAULT '',
  source_format TEXT NOT NULL DEFAULT 'legacy_pdf_v1',
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview','processing','confirmed','partial','failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

CREATE INDEX idx_import_batches_property
  ON import_batches(property_id, created_at);

CREATE INDEX idx_import_batches_file_hash
  ON import_batches(property_id, source_file_hash);

CREATE TABLE bill_import_rows (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL,
  source_page INTEGER NOT NULL DEFAULT 0,
  room_number TEXT NOT NULL DEFAULT '',
  matched_room_id TEXT NOT NULL DEFAULT '',
  source_document_no TEXT NOT NULL DEFAULT '',
  source_bill_date TEXT NOT NULL DEFAULT '',
  source_printed_at TEXT NOT NULL DEFAULT '',
  billing_month TEXT NOT NULL DEFAULT '',

  room_rent_net REAL NOT NULL DEFAULT 0,
  furniture_net REAL NOT NULL DEFAULT 0,
  furniture_vat REAL NOT NULL DEFAULT 0,
  furniture_gross REAL NOT NULL DEFAULT 0,
  transformed_rent REAL NOT NULL DEFAULT 0,

  water_prev REAL NOT NULL DEFAULT 0,
  water_curr REAL NOT NULL DEFAULT 0,
  water_units REAL NOT NULL DEFAULT 0,
  water_rate REAL NOT NULL DEFAULT 0,
  water_charge REAL NOT NULL DEFAULT 0,
  water_recorded_at TEXT NOT NULL DEFAULT '',

  electric_prev REAL NOT NULL DEFAULT 0,
  electric_curr REAL NOT NULL DEFAULT 0,
  electric_units REAL NOT NULL DEFAULT 0,
  electric_rate REAL NOT NULL DEFAULT 0,
  electric_charge REAL NOT NULL DEFAULT 0,
  electric_recorded_at TEXT NOT NULL DEFAULT '',

  source_vat_subtotal REAL NOT NULL DEFAULT 0,
  source_vat_amount REAL NOT NULL DEFAULT 0,
  calculated_total REAL NOT NULL DEFAULT 0,
  source_total REAL NOT NULL DEFAULT 0,
  rounding_adjustment REAL NOT NULL DEFAULT 0,

  validation_status TEXT NOT NULL DEFAULT 'ready'
    CHECK (validation_status IN ('ready','review','duplicate','error','imported')),
  validation_message TEXT NOT NULL DEFAULT '',
  bill_id TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL DEFAULT '',

  FOREIGN KEY (import_batch_id) REFERENCES import_batches(id)
);

CREATE INDEX idx_bill_import_rows_batch
  ON bill_import_rows(import_batch_id, source_page);

CREATE INDEX idx_bill_import_rows_room
  ON bill_import_rows(matched_room_id, billing_month);

CREATE INDEX idx_bill_import_rows_source_document
  ON bill_import_rows(source_document_no);

CREATE INDEX idx_bill_import_rows_bill
  ON bill_import_rows(bill_id);
