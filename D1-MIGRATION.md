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

Status: **repository implementation prepared on `feat/d1-backend`; Cloudflare provisioning pending**

Prepared on the feature branch:

- `migrations/0001_initial_d1.sql`
- `src/d1-api.js` — compatibility API code executed by the existing `delightapp` Worker for `/api` routes
- `wrangler.jsonc` — single Worker configuration for static assets + `/api/*` + D1 binding
- `.dev.vars.example` — secret names only, no real secrets

Current external blocker:

This chat has GitHub and Google Drive access but no authenticated Cloudflare control-plane connector. Therefore it cannot create the account-level D1 database or obtain its real `database_id` directly. No Cloudflare plugin is currently available through the connected Plugin Directory.

Required Cloudflare-side actions:

1. create D1 database `delightapp-db` in APAC
2. copy the generated D1 database ID into `wrangler.d1.jsonc`
3. set Worker secret `AUTH_SECRET`
4. set `BOT_API_KEY` if the Messenger/public availability integration is kept
5. apply migrations remotely
6. deploy the existing `delightapp` Worker from the feature branch for staging verification

The production frontend files remain unchanged. The feature branch changes `wrangler.jsonc` so the existing Worker named `delightapp` becomes the single frontend + API Worker after staging approval.

Repository artifact:

```text
migrations/
  0001_initial_d1.sql
```

Next infrastructure actions:

- create Cloudflare D1 database for DelightApp
- add D1 binding to `wrangler.jsonc`
- apply `0001_initial_d1.sql`
- verify empty schema before importing production data

Do not point production frontend at D1 yet.

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

Production frontend remains on Google Apps Script during this phase.

### Phase 3 — export Google Sheets data

At migration time export:

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

Test at minimum:

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

Proceed to **Phase 1 infrastructure + Phase 2 API implementation**:

1. provision/bind D1
2. apply `0001_initial_d1.sql`
3. build Worker compatibility API
4. keep production frontend on Apps Script until staging passes
