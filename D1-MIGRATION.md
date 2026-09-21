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
Cloudflare Worker: delightapp
    |-- static assets from /หอพัก
    `-- /api/* -> API code -> D1
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

Existing `password_hash` and `salt` values can be migrated as-is and verified by the Worker using the same algorithm.

After D1 migration is stable, password hashing can be upgraded separately with a backward-compatible rehash-on-login strategy.

### Existing tokens

Current Apps Script tokens are:

```text
base64url(JSON payload) + "." + HMAC-SHA256 signature
```

Payload currently contains uid, username and expiration with a 30-day window.

Recommended cutover behavior:

- use a separate Worker secret
- require users to sign in again after D1 cutover
- do not copy the Apps Script signing secret unless seamless token continuity is explicitly required

## 4. Phase 0 source-data audit

Status: **completed initial audit on 2026-09-21**

Live source verified:

- spreadsheet title: `dataAI`
- spreadsheet ID: `1hHzp3F9PLdBedUbpilUwZnoD52Ku4X8vh9eDTC8FY8Y`
- locale: `th_TH`
- timezone: `Asia/Bangkok`

### Current row counts

| Table | Rows |
| --- | ---: |
| users | 4 |
| properties | 2 |
| rooms | 84 |
| tenants | 2 |
| bills | 19 |
| deposits | 0 |
| meter_readings | 62 |
| receipts | 0 |
| room_layouts | 0 |
| audit logs | 11 |

### Current max IDs

- users: 4
- properties: 2
- rooms: 84
- tenants: 76
- bills: 19
- meter_readings: 62
- deposits / receipts / room_layouts: no rows yet

### Integrity findings

Audit found:

- no duplicate primary IDs
- no duplicate usernames
- no duplicate bill room/month pairs
- no room -> property orphans
- no tenant -> room orphans
- no bill -> room orphans
- no meter -> room orphans
- no meter -> bill orphans
- no blank critical room/property references

Current roles:

- admin: 1
- normal users: 3

Current properties:

1. ภาณุภณแมนชั่น — 32 rooms
2. ทีเอชแอล แมนชั่น — 52 rooms

Current room state:

- occupied: 18
- vacant: 66

Current bill state:

- paid: 2
- unpaid: 17

### Baseline financial totals

Current 19 bills:

- rent: 52,500 THB
- water: 1,920 THB
- electricity: 5,471 THB
- VAT: 0 THB
- grand total: 59,891 THB
- paid: 10,686 THB
- unpaid: 49,205 THB

These values are migration verification baselines, not accounting conclusions.

### Meter-history finding

The meter history contains repeated business-identical readings at different timestamps.

This appears to be valid historical append behavior from the current app, not duplicate primary-key corruption.

Therefore:

- keep each `meter_readings.id` row
- do not add uniqueness on room/bill/month/type/readings
- preserve timestamps and all 62 rows during migration

## 5. D1 schema

Canonical initial schema is stored in:

`migrations/0001_initial_d1.sql`

Important decisions:

- migrated business IDs use `TEXT PRIMARY KEY`
- room/property and child/room foreign keys are enforced
- `owner_id` is retained but not FK-enforced in migration v1
- bill `room_id + month` is indexed but not yet declared unique
- meter and receipt `bill_id` are indexed but remain compatibility references rather than enforced FKs initially
- meter history intentionally allows repeated equivalent readings

## 6. API compatibility strategy

The safest migration path is to avoid rewriting the frontend and database layer simultaneously.

### Stage A — compatibility API

Build a Cloudflare Worker that supports behavior close to the existing Apps Script contract:

- login
- register
- me
- changePassword
- adminListUsers
- adminResetPassword
- getAll
- save table
- getPublicAvailability

### Stage B — row-level API

After cutover is stable, replace whole-table writes with row-level operations and transactions.

## 7. Migration phases

### Phase 0 — documentation and audit

Status: **COMPLETE for initial schema**

Completed:

- project overview
- backend/table mapping
- authentication behavior
- live data counts
- duplicate checks
- orphan checks
- baseline financial totals
- initial D1 schema decisions

A final repeat audit is still required immediately before production cutover.

### Phase 1 — D1 schema preparation

Status: **COMPLETE for initial D1 provisioning, schema application and imported staging snapshot**

Prepared and verified on the feature branch:

- D1 database: `delightapp-db`
- D1 binding: `DB`
- `migrations/0001_initial_d1.sql` applied remotely
- `src/d1-api.js` compatibility API uploaded as a Worker version
- `wrangler.jsonc` configured for a single static + API Worker
- imported Google Sheets snapshot validated against the recorded baseline
- staging workflow validates schema, row counts, financial totals and referential integrity
- frontend branch now defaults to same-origin `/api`
- legacy default Apps Script URL is migrated to `/api` in localStorage
- existing Apps Script auth tokens are cleared once at D1 cutover so users sign in again
- service worker cache version bumped and `/api` requests are explicitly excluded from caching

Current production state:

- production traffic has **not** been switched to the new Worker version
- Google Sheets / Apps Script remains the live source of truth until final cutover
- D1 currently contains a validated snapshot and must receive a final sync before production cutover
- Google Sheets must remain intact as rollback source

### Phase 2 — implement Worker API

Status: **implemented on `feat/d1-backend`; core staging smoke passed**

Implemented:

- authentication and legacy password verification
- Worker token signing/verification
- login / register / me
- changePassword
- adminListUsers / adminResetPassword
- getAll compatibility endpoint
- table-write compatibility endpoint
- getPublicAvailability
- audit log writes
- D1/static single-Worker routing

Verified in staging:

- static frontend response
- D1 ping
- unauthorized getAll rejection
- invalid login rejection
- register
- login
- me
- authenticated getAll with expected imported row counts

Still required before production:

- manual UI acceptance using the actual app
- positive admin UI flow
- change-password UI flow
- write-path checks for room/tenant/bill/meter/receipt/deposit/layout operations
- public availability check with the real bot key if that integration remains enabled

Compatibility note:

The legacy Apps Script backend also exposes `issueBotApiKey` to issue/regenerate the Messenger bot key. No in-repo frontend caller was found, and the D1 Worker does not currently reproduce that key-management endpoint. `getPublicAvailability` itself is implemented. Keep Apps Script available for rollback and resolve this compatibility gap before retiring Apps Script completely if the bot-key management flow is still used.

### Phase 3 — export Google Sheets data

Status: **initial snapshot exported/imported; final cutover export still required**

At final migration time export:

- users
- properties
- rooms
- tenants
- bills
- deposits
- meterReadings
- receipts
- roomLayouts
- logs

Before import:

- create fresh spreadsheet backup
- record export timestamp
- repeat row counts and integrity audit
- freeze or otherwise control production writes during the final cutover window

### Phase 4 — import into D1

Status: **initial snapshot imported and validated; final sync still required at cutover**

Import order:

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

After import verify counts, IDs, relationships, roles and financial baseline values.

### Phase 5 — staging verification

Status: **automated core/API validation passed; full application acceptance remains**

Already verified:

- D1 schema and migration state
- imported row counts
- financial baseline
- room/bill status counts
- referential integrity / orphan checks
- static frontend served by staging Worker
- same-origin D1 ping
- register / login / me / authenticated getAll
- frontend cutover marker present in latest Preview
- service worker does not cache `/api`

Still test at minimum:

- existing login
- registration
- logout/login
- change password
- admin list/reset password
- create/edit room
- tenant operations
- monthly bill generation
- meter carry-forward
- water/electric calculation
- VAT none/exclusive/inclusive
- historical VAT snapshot
- payment / receipt
- deposits
- reports
- room layout
- public availability API
- network/offline cache behavior
- phone and desktop

### Phase 6 — final sync and cutover

Recommended:

1. short maintenance/write freeze
2. final Google Sheets backup
3. repeat Phase 0 audit
4. final export
5. import/rebuild production D1 data
6. verify row counts and totals
7. deploy Worker API
8. change frontend endpoint
9. require fresh login
10. run production smoke tests
11. reopen writes

### Phase 7 — rollback window

Keep Google Sheets unchanged as a backup until D1 is proven stable.

Once D1 receives writes, rollback requires reconciliation of D1-only changes before simply switching back.

### Phase 8 — post-migration cleanup

Only after D1 stabilizes:

- retire Apps Script writes
- remove embedded Apps Script endpoint
- remove duplicate backend source
- replace whole-table saves with row-level CRUD
- improve password hashing
- consider session revocation
- revisit owner isolation
- modularize the frontend

## 8. D1 migration safety rules

1. Never run destructive production SQL without a backup.
2. Every schema change must have a versioned migration.
3. Do not introduce owner isolation during the DB move.
4. Do not convert existing IDs during this migration.
5. Do not recalculate historical financial records.
6. Preserve every meter history row.
7. Never expose password hashes or salts through API responses.
8. Enforce admin actions on the Worker, not only in UI.
9. Log server-side writes.
10. Keep Google Sheets as rollback source through the stabilization window.

## 9. Immediate next task

Proceed with the remaining **Phase 5 acceptance + Phase 6 final sync/cutover preparation**:

1. test the latest staging Preview through the real UI with an existing account
2. verify admin/change-password and representative write workflows
3. repeat the live Google Sheets audit immediately before cutover
4. take a fresh Google Sheets backup
5. perform final D1 sync/import and re-run baseline validation
6. only then merge/deploy the tested Worker version to production traffic
7. require fresh login and run production smoke tests

Do not retire or modify the Google Sheets rollback copy yet.
