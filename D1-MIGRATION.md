# DelightApp — Google Sheets to Cloudflare D1 Migration

> Migration history and post-cutover stabilization record.
> Production cutover completed on 2026-09-21.
>
> Current production architecture is documented in `PROJECT.md`.

## 1. Result

The production datastore was migrated from Google Sheets / Google Apps Script to Cloudflare D1.

Final architecture:

```text
Browser / PWA
    |
    v
Cloudflare Worker: delightapp
    |-- static assets from /หอพัก
    `-- /api/* -> src/d1-api.js -> Cloudflare D1
```

Cloudflare D1 is now the production source of truth.

Google Sheets and Apps Script are retained temporarily as rollback/reference material and must not be treated as the live authoritative database after cutover.

## 2. Migration compatibility decisions

The migration intentionally preserved existing behavior:

- business IDs remain strings / `TEXT PRIMARY KEY`
- shared-data behavior remains unchanged
- owner isolation was not introduced
- historical VAT snapshots were preserved
- all meter-history rows were preserved
- legacy password hashes/salts were migrated as-is
- Apps Script session tokens were not reused
- users signed in again after cutover

## 3. Final source snapshot

Final source audit date: **2026-09-21**

Google Sheet:

- title: `dataAI`
- locale: `th_TH`
- timezone: `Asia/Bangkok`

Final migrated baseline:

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
| audit_logs | 11 |

Room state:

- occupied: 18
- vacant: 66

Bill state:

- paid: 2
- unpaid: 17

Financial baseline:

- rent: 52,500 THB
- water: 1,920 THB
- electricity: 5,471 THB
- VAT: 0 THB
- grand total: 59,891 THB
- paid: 10,686 THB
- unpaid: 49,205 THB

Final integrity checks:

- duplicate critical keys: none found
- room -> property orphan: 0
- tenant -> room orphan: 0
- bill -> room orphan: 0
- meter -> room orphan: 0
- meter -> referenced bill orphan: 0

## 4. Backups

A pre-cutover Google Sheets backup was created before final synchronization.

Google Sheets should remain unchanged during the stabilization/rollback window.

Do not delete the original Sheet, Apps Script project, or migration backups until D1 has been stable in real production use for an agreed period.

## 5. D1 schema

Initial migration:

- `migrations/0001_initial_d1.sql`

D1 database:

- `delightapp-db`

Worker binding:

- `DB`

Important schema decisions:

- business IDs are `TEXT PRIMARY KEY`
- core child-parent relationships use D1 foreign keys
- `owner_id` remains compatibility metadata
- bill room/month is indexed but not unique
- meter and receipt bill references remain compatibility references
- repeated equivalent meter readings are valid historical rows

## 6. Worker compatibility API

Production API:

- `src/d1-api.js`

Implemented compatibility operations:

- ping
- login
- register
- me
- changePassword
- adminListUsers
- adminResetPassword
- getAll
- table save compatibility endpoint
- getPublicAvailability

The migration intentionally kept whole-table saves temporarily to avoid mixing a database move with a broad frontend/backend rewrite.

## 7. Validation completed before cutover

Automated validation:

- D1 migration state
- required schema/tables
- final row counts
- financial totals
- referential-integrity checks
- static frontend response
- D1 API ping
- unauthorized access rejection
- invalid login rejection
- register
- login
- me
- authenticated getAll
- service worker `/api` cache bypass

Manual staging acceptance:

- existing-user login
- create / refresh / delete write check
- admin user-management UI
- change password and sign-in with changed password

Production cutover validation:

- final D1 baseline verified
- Worker candidate uploaded
- candidate deployed to 100% production traffic
- production frontend/API smoke test passed

## 8. Frontend cutover behavior

Production frontend now uses fixed same-origin:

```text
/api
```

Legacy Apps Script URL preferences are no longer user-configurable.

The Settings UI no longer exposes an API URL.

At cutover, old Apps Script auth tokens were invalidated client-side once so users would authenticate against the Worker.

The service worker does not cache `/api`.

## 9. Rollback policy

Google Sheets is a **rollback copy**, not a second live-write database.

Important:

Once users write new data to D1, simply switching back to the old Sheet can lose D1-only changes.

Any rollback after production D1 writes must first reconcile changes made since the final cutover snapshot.

Therefore:

1. diagnose whether the incident requires rollback
2. stop or control writes if needed
3. identify D1 changes since cutover
4. reconcile/export those changes
5. only then switch backend if rollback is still necessary

## 10. Post-migration stabilization

During the stabilization period:

- keep Google Sheets / Apps Script and backups
- monitor production login and writes
- monitor D1 usage/errors
- avoid unrelated destructive schema changes
- use versioned migrations for schema changes
- keep production deployment guarded

## 11. Post-migration cleanup candidates

After D1 is proven stable:

- archive/remove legacy Apps Script backend copies
- remove remaining obsolete Google Sheets comments/naming from code
- replace whole-table saves with row-level CRUD
- improve password hashing
- add session revocation if needed
- revisit owner/property isolation
- modularize `หอพัก/index.html`
- decide whether legacy `issueBotApiKey` compatibility is still required

These are follow-up projects, not migration-completion requirements.

## 12. Safety rules retained after migration

1. Back up before destructive production SQL.
2. Use versioned D1 migrations for schema changes.
3. Do not convert existing IDs casually.
4. Do not recalculate historical financial records.
5. Preserve meter history.
6. Never expose password hashes or salts through APIs.
7. Enforce authorization on the Worker, not only in UI.
8. Log important server-side writes.
9. Validate production changes before deployment.

## 13. Migration status

**COMPLETE — production cutover succeeded on 2026-09-21.**

The next planning work should be recorded in a separate roadmap/future-features document rather than extending this migration plan.
