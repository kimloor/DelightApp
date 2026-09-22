# DelightApp — Project Overview

> Canonical project note for the current production codebase.
> Production architecture verified after the Cloudflare D1 cutover on 2026-09-21.

## 1. What DelightApp is

DelightApp is a Thai dormitory/apartment management web application ("สมุดหอพัก").

Primary user-facing modules:

- Dashboard / ภาพรวม
- Rooms / ห้องพัก
- Tenants / ผู้เช่า
- Billing / ค่าเช่าและบิล
- Reports / รายงานสรุป
- Deposits / มัดจำ
- Meter readings / จดมิเตอร์
- Receipts / ใบเสร็จ
- Room layout positions / ตำแหน่งผัง
- Apartment/property settings
- VAT configuration
- Login
- Password change
- Admin user management
- Public read-only room availability endpoint for external bot usage

## 2. Current production architecture

```text
Browser / PWA
    |
    v
Cloudflare Worker: delightapp
    |-- static frontend from /หอพัก
    `-- /api/* -> src/d1-api.js -> Cloudflare D1
```

The existing `delightapp` Worker is the single deployment unit for both the frontend and API.

### Frontend

Production frontend:

- `หอพัก/index.html`

Related static/PWA files:

- `หอพัก/manifest.json`
- `หอพัก/service-worker.js`
- `หอพัก/icon.svg`

The frontend is still mostly monolithic: HTML, CSS, application state and client-side JavaScript live in `index.html`.

### Backend

Production API:

- `src/d1-api.js`

Cloudflare D1 binding:

- binding: `DB`
- database: `delightapp-db`

Worker configuration:

- `wrangler.jsonc`

### Database authority

Cloudflare D1 is now the **production source of truth**.

Google Sheets / Apps Script is no longer the primary production backend.

The original Google Sheet and Apps Script are retained temporarily as rollback/reference material during the post-migration stabilization window.

## 3. Current D1 tables

Canonical initial schema:

- `migrations/0001_initial_d1.sql`

Tables:

- `users`
- `properties`
- `rooms`
- `tenants`
- `bills`
- `deposits`
- `meter_readings`
- `receipts`
- `room_layouts`
- `audit_logs`
- `property_admins`
- `tenant_accounts`

Business IDs remain `TEXT PRIMARY KEY` for migration compatibility.

## 4. Data relationships

Current relational relationships include:

- `rooms.property_id -> properties.id`
- `tenants.room_id -> rooms.id`
- `bills.room_id -> rooms.id`
- `deposits.room_id -> rooms.id`
- `meter_readings.room_id -> rooms.id`
- `receipts.room_id -> rooms.id`
- `room_layouts.room_id -> rooms.id`

D1 now enforces the main parent/child relationships defined in the initial migration.

`meter_readings.bill_id` and `receipts.bill_id` remain compatibility references and are indexed but are not strict foreign keys in migration v1.

## 5. Authentication and authorization

Supported production behavior includes:

- login
- public self-registration disabled
- me
- change own password
- admin user management
- scoped property-authorized row-level CRUD
- admin scoped-read API
- tenant-specific read API
- legacy admin global read disabled in production
- public availability lookup

Existing users were migrated with the legacy compatible password format:

```text
SHA-256(password + ":" + salt)
```

Worker sessions use the Worker `AUTH_SECRET`.

Users were required to sign in again at the D1 cutover rather than reusing Apps Script tokens.

### Current access-control transition

Multi-Tenant Access V1 is enabled in production through strict admin isolation and the tenant portal foundation:

- `property_admins` is the authorization mapping for admin writes
- `tenant_accounts` maps tenant logins to tenant records
- `kim` and `test` are mapped to both current properties
- `test02` is mapped to the current tenant in ทีเอชแอล แมนชั่น
- `pare` is mapped to the current tenant in ภาณุภณแมนชั่น
- tenant accounts cannot use the legacy global admin dataset or admin write actions
- all normal business writes are row-level and checked server-side against property access
- admin frontend reads use `getAdminScoped` only
- legacy global `getAll` is disabled
- tenant frontend is separated from the admin UI and reads only `getTenantHome`
- tenant UI exposes its mapped property, room, tenant identity, recent/current bills, payment state, receipts and deposit information
- tenant sessions can change their own password and logout
- tenant sessions never fall back to the stale admin browser cache

`properties.owner_id` remains legacy compatibility data and is not the primary permission source.

See `ACCESS-CONTROL-V1.md`.

## 6. Current frontend/backend connection behavior

The production frontend uses a fixed same-origin endpoint:

```text
/api
```

The API URL is no longer editable from Settings.

Settings now contains account actions such as:

- admin user management (admin only)
- change password
- logout

The top bar keeps the D1 connection-status indicator and the Settings button.

The service worker explicitly excludes `/api` requests from caching so authenticated API responses and token-bearing URLs are not stored in the PWA cache.

## 7. Current write model

Production frontend mutations now use explicit row-level API actions.

The legacy whole-table client save functions have been removed and the Worker rejects the old whole-table write contract with `legacy_whole_table_write_disabled`.

Current properties of the write model:

- server-side property authorization for business-data writes
- server-generated IDs for newly created business rows
- server-side document numbering for newly created bills, deposits and receipts
- dedicated bulk row operations where the UI edits multiple rows
- owner-only property deletion with controlled cascade
- no client snapshot may delete rows merely because they are absent from the current view

Further improvements may add stronger transactional grouping and optimistic concurrency/version checks for operations that span several requests.

## 8. Important business behavior to preserve

Future work must preserve current user-visible behavior unless a change is explicitly approved.

Key examples:

- room status
- tenant-room linkage
- billing month handling
- invoice numbering
- meter history
- rent/water/electric calculations
- VAT none / exclusive / inclusive
- stored VAT snapshot on historical bills
- tax invoice numbers
- receipts and paid/unpaid state
- deposits
- room layout coordinates
- QR payment data
- authentication
- admin permission checks
- audit logging

## 9. Current stabilization work

A post-foundation stabilization phase is now active before major new product features.

Current priority:
- S5 Frontend Security / XSS Audit

Completed stabilization:
- S1 Auth / Session Hardening V2
- S2 Financial / Database Integrity V1
- S3 Paid Bill Lock + Receipt Void V1
- S4 Tenant Account Lifecycle V1

Planned stabilization:
- financial/database integrity
- paid bill/receipt lifecycle hardening
- tenant account lifecycle
- frontend XSS/output escaping audit
- superadmin console
- offline read-only behavior
- audit log viewer

See `STABILIZATION.md` and `AUTH-SESSION-HARDENING-V2.md`.

## 10. Known technical debt / follow-up items

### Monolithic frontend

`หอพัก/index.html` remains large and should eventually be modularized, but this should be a separate refactor.

### Concurrency / multi-request transactions

Whole-table saves have been retired. Remaining write-model work is to strengthen atomicity/version-conflict handling for complex operations that currently span multiple row-level requests.

### Legacy Apps Script copies

Legacy sources remain:

- `google-sheets-backend.gs`
- `หอพัก/google-sheets-backend.gs`

They are no longer the production backend and should not receive new product logic.

Keep them only during the rollback/stabilization period, then archive/remove them in a controlled cleanup.

### Password hashing

Existing migrated hashes remain legacy-compatible.

A future auth upgrade should use a stronger password KDF with backward-compatible rehash-on-login.

### Session/security improvements

Possible future improvements:

- session revocation
- token/session records
- tighter account/property authorization
- owner isolation

### Bot compatibility gap

The old Apps Script backend includes `issueBotApiKey`.

The D1 Worker implements `getPublicAvailability`, but does not currently reproduce the legacy key-issuing/regeneration endpoint.

Resolve this only if that legacy bot-key management flow is still needed.

## 11. Production deployment

Production code lives on `main`.

Production Worker:

- `delightapp`

Current production deployment uses the guarded GitHub Actions cutover/deploy workflow.

Do not deploy arbitrary untested changes directly to production without validation.

## 12. Migration status

The Google Sheets -> Cloudflare D1 production cutover completed successfully on 2026-09-21.

Completed verification included:

- schema/migration validation
- final Google Sheets backup/export
- final D1 sync
- row-count checks
- financial baseline checks
- orphan/integrity checks
- staging API smoke tests
- existing-user login
- write/read/delete UI check
- admin UI check
- password-change UI check
- production API/frontend smoke test

Google Sheets remains temporarily as a rollback copy.

See `D1-MIGRATION.md` for migration history and stabilization notes.

## 13. Documentation roles

Use these documents as follows:

- `PROJECT.md` — canonical current production state and architecture
- `D1-MIGRATION.md` — completed migration history, rollback/stabilization notes
- `README.md` — repository entry point
- future roadmap document — planned features that are not yet production behavior

Do not mix planned features into the "current production" sections of `PROJECT.md`.
