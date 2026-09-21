# DelightApp — Project Overview

> Canonical project note for the current production codebase.
> Last verified against `main` at commit `9658246ca65f1f8ffde3ce47a13948183aa43e73` (2026-09-21).

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
- Login / registration
- Password change
- Admin user management
- Public read-only room availability endpoint for external bot usage

## 2. Current architecture

### Frontend

The production frontend is primarily a single large file:

- `หอพัก/index.html`

It contains most HTML, CSS, UI rendering, application state and client-side JavaScript.

Related PWA/static files:

- `หอพัก/manifest.json`
- `หอพัก/service-worker.js`
- `หอพัก/icon.svg`

Cloudflare serves the static app from the `หอพัก` directory according to `wrangler.jsonc`.

### Backend

The current backend is Google Apps Script:

- `google-sheets-backend.gs`
- duplicate copy: `หอพัก/google-sheets-backend.gs`

At the time of this document both copies are identical. This duplication is a maintenance risk and should eventually be removed or converted to a single-source workflow.

### Database

Google Sheets is currently the primary remote datastore.

The frontend also keeps local cache/fallback state in browser storage.

Current storage priority documented in the frontend:

1. Google Sheets via Apps Script
2. `window.storage` where available
3. `localStorage` as cache/fallback

## 3. Current Google Sheets tables

The Apps Script backend currently defines these logical tables.

### users — ผู้ใช้งาน

Fields:

- id
- username
- password hash
- salt
- display name
- created date
- role

Notes:

- Passwords are not stored as plaintext.
- `role = admin` grants admin operations.
- Normal self-registration creates a user with no admin role.

### properties — อพาร์ทเมนท์

Fields include:

- id
- name
- water rate
- electricity rate
- address
- bill footer note
- payment QR image/base64
- ownerId
- VAT enabled
- VAT rate
- VAT type for rent
- VAT type for water
- VAT type for electricity
- tax ID
- legal entity name

### rooms — ห้องพัก

Fields include:

- id
- propertyId
- room number
- floor
- rent
- status
- room type
- deposit amount

### tenants — ผู้เช่า

Fields include:

- id
- roomId
- tenant name
- phone
- move-in date

### bills — บิล

Fields include:

- id
- roomId
- month
- invoice number
- rent
- previous/current water meter
- water charge
- previous/current electricity meter
- electricity charge
- total
- status
- VAT subtotal
- VAT amount
- tax invoice number

### deposits — มัดจำ

Fields include:

- id
- roomId
- receipt number
- amount
- received date
- note

### meterReadings — จดมิเตอร์

Fields include:

- id
- roomId
- referenced bill ID
- month
- type
- previous reading
- current reading
- units used
- rate
- cost
- recordedAt

### receipts — ใบเสร็จ

Fields include:

- id
- roomId
- referenced bill ID
- receipt number
- amount
- received date
- note
- VAT subtotal
- VAT amount

### roomLayouts — ตำแหน่งผัง

Fields:

- id
- roomId
- x
- y

### logs — ล็อก

Fields include:

- timestamp
- userId
- username
- action
- table
- affected IDs
- item count
- note

This log is intentionally not exposed through normal client data synchronization.

## 4. Data relationships

Current logical relationships:

- `rooms.propertyId -> properties.id`
- `tenants.roomId -> rooms.id`
- `bills.roomId -> rooms.id`
- `deposits.roomId -> rooms.id`
- `meterReadings.roomId -> rooms.id`
- `receipts.roomId -> rooms.id`
- `roomLayouts.roomId -> rooms.id`

The Apps Script backend validates these foreign-key-like relationships before saves for most child tables.

Important: Google Sheets itself does not enforce relational constraints. The checks are application logic.

## 5. Current authentication and authorization

The backend supports:

- login
- register
- current-user lookup (`me`)
- change own password
- admin list users
- admin reset another user's password

Authentication tokens are signed by the Apps Script backend.

Admin permission is checked server-side by reading the user's current role from the users sheet.

### Important current production behavior

The code history originally introduced owner-based apartment isolation.

However, the current v15 behavior intentionally does **not** filter data by `ownerId`:

- authenticated users can currently read all apartments
- authenticated users can currently write shared tables
- `ownerId` is retained in the property data but is not currently used to isolate tenants

This behavior must not be accidentally changed during the D1 migration.

A future project decision may re-enable per-owner isolation, but that should be treated as a separate feature/security change.

## 6. Current remote API behavior

The frontend currently calls the Google Apps Script Web App URL directly.

Main operations include:

- `GET action=getAll`
- `POST action=login`
- `POST action=register`
- `POST action=me`
- `POST action=changePassword`
- `POST action=adminListUsers`
- `POST action=adminResetPassword`
- table save operations
- public room availability operation for bot integration
- bot API key issuing/regeneration path

The frontend currently embeds a default Google Apps Script URL.

This endpoint will eventually be replaced by a Cloudflare Worker API when the D1 migration is complete.

## 7. Current write model

The present backend often accepts a complete client-side table array and rewrites the logical table.

This is materially different from a relational database CRUD model.

For D1, the preferred direction is to move toward row-level operations and transactions rather than whole-table replacement.

During migration, compatibility endpoints may temporarily emulate the existing client contract to reduce frontend changes.

## 8. Important business behavior to preserve

Migration work must preserve current user-visible behavior unless a change is explicitly approved.

Key examples:

- room status
- tenant-room linkage
- billing month handling
- bill number generation behavior
- meter history
- rent/water/electric calculations
- VAT modes: none / exclusive / inclusive
- stored VAT snapshot on historical bills
- tax invoice numbers
- receipts and paid/unpaid state
- deposit records
- room layout coordinates
- QR payment data
- authentication
- admin permission checks
- audit logging
- local cache/offline fallback behavior where still applicable

## 9. Known technical debt / risks

### Large monolithic frontend

`หอพัก/index.html` contains a large amount of application logic in one file.

Do not combine the database migration with a large frontend refactor unless necessary.

### Duplicate Apps Script source

The backend exists both at repository root and inside `หอพัก/`.

A future cleanup should define one canonical backend source.

### Whole-table save pattern

Whole-table replacement increases concurrency risk and does not map naturally to D1.

### Browser cache as fallback

Local browser data can diverge from remote data when synchronization fails.

The migration must explicitly define which store is authoritative.

### Historical comments vs current behavior

Some source comments describe older owner-scoped behavior while v15 currently shares apartment data among authenticated users.

The executable current behavior takes precedence.

## 10. Target architecture direction

Planned direction:

```text
Browser / PWA
    |
    v
Cloudflare Worker: delightapp
    |-- static frontend assets
    `-- /api/* -> backend logic -> Cloudflare D1
```

The existing `delightapp` Worker remains the single deployment unit. A second API Worker is not planned.

Google Sheets / Apps Script will remain intact during migration as the rollback source and temporary production system until D1 has been verified.

See `D1-MIGRATION.md` for the migration plan.

## 11. Migration principles

1. Do not delete or overwrite the Google Sheets production data during migration.
2. Do not change business behavior merely because the database changes.
3. Migrate schema first, then data, then traffic.
4. Validate row counts and key relationships before cutover.
5. Keep a rollback path until D1 has been proven in real use.
6. Prefer additive and reversible migration steps.
7. Separate "move database" work from unrelated UI redesign/refactor work.
