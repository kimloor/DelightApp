# DelightApp — Google Sheets to Cloudflare D1 Migration Plan

> Goal: move the production datastore from Google Sheets / Google Apps Script to Cloudflare D1 without changing user-visible business behavior during the database migration itself.
>
> Related overview: `PROJECT.md`

## 1. Migration goal

Target architecture:

```text
Browser / PWA
    |
    v
Cloudflare Worker API
    |
    v
Cloudflare D1
```

Google Sheets remains the production source and rollback copy until D1 has been migrated, validated and cut over successfully.

This migration should be treated as an infrastructure/backend migration first, not as a UI redesign.

## 2. Non-goals for the first migration

Do not bundle these into the initial D1 move:

- major frontend refactor
- visual redesign
- changing billing rules
- changing VAT rules
- changing invoice numbering rules
- changing room/tenant workflows
- introducing a new multi-tenant authorization model
- deleting the existing Google Sheets database
- removing local cache/offline behavior before the D1 path is stable

Those can be separate follow-up projects.

## 3. Important compatibility decisions

### Keep existing IDs initially

Current IDs are represented as strings in the frontend, even where they contain numeric values.

For the first D1 migration, use `TEXT PRIMARY KEY` for migrated business IDs to avoid accidental ID conversion problems.

New ID strategy can be changed later if required.

### Preserve current shared-data behavior

Current v15 backend behavior allows authenticated users to see and modify shared apartment data.

The D1 migration must initially preserve that behavior.

Reintroducing per-owner property isolation should be a separate security/authorization project after migration.

### Preserve historical VAT snapshots

Historical bill VAT values are stored with the bill.

Do not recalculate old bills from the property's current VAT settings.

### Preserve password compatibility during cutover

Current password format is:

```text
SHA-256(password + ":" + salt)
```

Existing `password_hash` and `salt` values can therefore be migrated as-is and verified by the Worker using the same algorithm.

After D1 migration is stable, password hashing can be upgraded separately with a backward-compatible rehash-on-login strategy.

### Existing tokens

Current Apps Script tokens are:

```text
base64url(JSON payload) + "." + HMAC-SHA256 signature
```

Payload currently contains:

- uid
- username
- expiration
- 30-day expiration window

Recommended cutover behavior:

- use a separate Worker secret
- require users to sign in again after the D1 cutover
- do not attempt to share the Apps Script signing secret unless there is a strong need for seamless token continuity

A forced re-login is simpler and safer than migrating active tokens.

## 4. Proposed D1 schema

This is the first-pass compatibility schema. Final SQL should be generated in a migration file after source-data audit.

### users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT ''
);
```

Recommended index:

```sql
CREATE UNIQUE INDEX idx_users_username ON users(username);
```

### properties

```sql
CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  water_rate REAL NOT NULL DEFAULT 0,
  electric_rate REAL NOT NULL DEFAULT 0,
  address TEXT NOT NULL DEFAULT '',
  bill_notes TEXT NOT NULL DEFAULT '',
  qr_image TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL DEFAULT '',
  vat_enabled INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 0,
  vat_type_rent TEXT NOT NULL DEFAULT 'none',
  vat_type_water TEXT NOT NULL DEFAULT 'none',
  vat_type_electric TEXT NOT NULL DEFAULT 'none',
  tax_id TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT ''
);
```

Do not enforce `owner_id -> users.id` during the first compatibility migration because current production behavior does not depend on owner isolation and legacy rows may contain blank owner values.

### rooms

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  room_number TEXT NOT NULL DEFAULT '',
  floor TEXT NOT NULL DEFAULT '',
  rent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'vacant',
  room_type TEXT NOT NULL DEFAULT '',
  deposit REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);
```

Indexes:

```sql
CREATE INDEX idx_rooms_property_id ON rooms(property_id);
CREATE INDEX idx_rooms_status ON rooms(status);
```

### tenants

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  move_in_date TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

Index:

```sql
CREATE INDEX idx_tenants_room_id ON tenants(room_id);
```

### bills

```sql
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
  status TEXT NOT NULL DEFAULT 'unpaid',
  vat_subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  tax_invoice_no TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

Indexes:

```sql
CREATE INDEX idx_bills_room_id ON bills(room_id);
CREATE INDEX idx_bills_month ON bills(month);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_room_month ON bills(room_id, month);
```

Do not add a unique constraint to `room_id, month` until source data is audited for duplicates.

### deposits

```sql
CREATE TABLE deposits (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  received_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

Index:

```sql
CREATE INDEX idx_deposits_room_id ON deposits(room_id);
```

### meter_readings

```sql
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
```

Indexes:

```sql
CREATE INDEX idx_meter_readings_room_id ON meter_readings(room_id);
CREATE INDEX idx_meter_readings_month ON meter_readings(month);
CREATE INDEX idx_meter_readings_bill_id ON meter_readings(bill_id);
```

The current Google Sheets backend validates room linkage but does not enforce `bill_id` as a formal FK. Keep it compatible initially and add a bill FK only after audit.

### receipts

```sql
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
```

Indexes:

```sql
CREATE INDEX idx_receipts_room_id ON receipts(room_id);
CREATE INDEX idx_receipts_bill_id ON receipts(bill_id);
```

### room_layouts

```sql
CREATE TABLE room_layouts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

Index:

```sql
CREATE INDEX idx_room_layouts_room_id ON room_layouts(room_id);
```

### audit_logs

```sql
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
```

Indexes:

```sql
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
```

## 5. API compatibility strategy

The safest migration path is to avoid rewriting the frontend and database layer at the same time.

### Stage A — compatibility API

Build a Cloudflare Worker that initially supports behavior close to the existing Apps Script contract:

- login
- register
- me
- changePassword
- adminListUsers
- adminResetPassword
- getAll
- save table
- getPublicAvailability

This lets the frontend switch endpoint first with minimal UI changes.

### Stage B — row-level API

After cutover is stable, gradually replace whole-table saves with row-level operations such as:

- create room
- update room
- delete room
- create/update tenant
- create/update bill
- record meter reading
- issue receipt

D1 transactions can then protect multi-row business operations.

## 6. Migration phases

### Phase 0 — documentation and audit

Status: **started**

Tasks:

- maintain `PROJECT.md`
- maintain this migration document
- identify exact current table fields
- identify API actions
- record auth/token behavior
- identify current source-of-truth rules
- audit any duplicated IDs or orphan references before writing D1 constraints

Deliverable:

- approved migration schema and checklist

### Phase 1 — create D1 database and schema

Tasks:

- create D1 database for DelightApp
- bind D1 in `wrangler.jsonc`
- add versioned SQL migration directory
- create tables
- create indexes
- enable foreign-key-aware design
- do not connect production frontend yet

Suggested repository structure:

```text
migrations/
  0001_initial_d1.sql

src/
  worker.js        # or equivalent API source
```

Exact structure can be chosen when implementation starts.

### Phase 2 — implement Worker API

Tasks:

- authentication
- password verification
- token signing/verification
- user/admin actions
- getAll compatibility endpoint
- table-write compatibility endpoints
- public room availability endpoint
- audit log writes
- validation

Production frontend still uses Google Apps Script during this phase.

### Phase 3 — export Google Sheets data

Preferred requirement:

Export all source tables at one consistent point in time.

Tables:

- users
- properties
- rooms
- tenants
- bills
- deposits
- meterReadings
- receipts
- roomLayouts
- logs if desired for historical audit

Before import:

- back up the spreadsheet
- record export timestamp
- record row counts by table
- scan for duplicate primary IDs
- scan for orphan room/property references
- scan for duplicate usernames
- verify billing data and receipt linkage

### Phase 4 — import into D1

Import order should respect relationships:

```text
users
properties
rooms
tenants
bills
deposits
meter_readings
receipts
room_layouts
audit_logs
```

After import, verify:

- row count per table
- primary key uniqueness
- room -> property references
- tenant -> room references
- bill -> room references
- deposit -> room references
- meter -> room references
- receipt -> room references
- layout -> room references
- admin roles
- password hash/salt preservation

### Phase 5 — staging verification

Point a staging copy of the frontend at the Worker/D1 endpoint.

Test at minimum:

- login existing user
- register new user
- logout/login again
- change own password
- admin list users
- admin reset password
- create/edit room
- room status
- add/edit tenant
- create monthly bills
- previous meter carry-forward
- water/electric calculations
- VAT disabled
- VAT exclusive
- VAT inclusive
- historical VAT values unchanged after property VAT change
- mark payment / issue receipt
- deposits
- reports
- room layout saving
- public availability endpoint
- local cache behavior when network fails
- phone and desktop usage

Compare key totals against Google Sheets.

### Phase 6 — final sync and cutover

Because production Google Sheets may receive changes while staging is tested, perform a controlled final cutover.

Recommended process:

1. announce short maintenance/write freeze
2. make final Google Sheets backup
3. export final data
4. clear/rebuild or delta-sync the D1 production dataset
5. validate counts and critical totals
6. deploy Worker
7. update frontend API endpoint from Apps Script to Worker
8. require fresh login
9. test production with a small set of real operations
10. end maintenance window

Do not immediately delete the Google Sheets data.

### Phase 7 — rollback window

Keep Google Sheets unchanged as a backup for an agreed period.

If a critical D1 issue occurs:

1. stop writes if necessary
2. point the frontend back to the Apps Script endpoint
3. determine whether any D1-only writes need reconciliation
4. fix D1 before attempting cutover again

Important: once users are writing to D1, rollback is no longer simply "change the URL" unless new D1 writes are reconciled back to Sheets.

### Phase 8 — post-migration cleanup

Only after D1 is stable:

- retire Apps Script production writes
- remove embedded Apps Script endpoint
- remove duplicate backend source
- reduce reliance on localStorage as authority
- replace table-wide save endpoints with row-level CRUD
- improve password hashing
- consider server-side session revocation
- reconsider owner isolation / multi-tenant security
- modularize the large frontend

## 7. Validation checklist

Before cutover, record values from both systems.

### Structural

- [ ] users row count matches
- [ ] properties row count matches
- [ ] rooms row count matches
- [ ] tenants row count matches
- [ ] bills row count matches
- [ ] deposits row count matches
- [ ] meter readings row count matches
- [ ] receipts row count matches
- [ ] room layouts row count matches
- [ ] no duplicate primary IDs
- [ ] no unexpected orphan foreign keys

### Business totals

For several selected months/properties compare:

- [ ] occupied room count
- [ ] vacant room count
- [ ] rent total
- [ ] water total
- [ ] electricity total
- [ ] VAT total
- [ ] grand total
- [ ] paid total
- [ ] unpaid total
- [ ] receipt total
- [ ] deposit total

### Authentication

- [ ] existing user password works
- [ ] admin role preserved
- [ ] non-admin cannot call admin API
- [ ] changed password works
- [ ] old password fails after change
- [ ] invalid/expired token rejected

## 8. D1 migration safety rules

1. Never run destructive production SQL without a backup.
2. Every schema change must be stored as a versioned migration file.
3. Do not manually edit production D1 schema outside the migration process except for emergency recovery.
4. Do not introduce owner isolation during the database move.
5. Do not convert existing IDs unless a dedicated migration explicitly handles every reference.
6. Do not recalculate historical financial records during import.
7. Treat bills, receipts, meter readings and VAT snapshots as financial history.
8. Do not expose password hashes, salts or admin-only data in API responses.
9. Log server-side write operations.
10. Keep the Sheets rollback copy until production D1 has been proven stable.

## 9. Recommended immediate next task

Before creating D1, perform a **source data audit** against the live Google Sheets data.

We need the actual current data counts and anomalies, not just the schema defined in source code.

Audit should produce:

- row counts
- max/current IDs
- duplicate IDs
- duplicate usernames
- orphan references
- blank critical references
- bill duplicate room/month combinations
- current number of users/properties/rooms/bills
- admin accounts
- any legacy rows whose shapes differ from the latest schema

After that audit, create `0001_initial_d1.sql` and the D1 database with confidence.
