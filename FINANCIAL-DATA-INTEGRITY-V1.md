# DelightApp — Financial / Database Integrity V1

> Status: IN PROGRESS
> Parent: STABILIZATION.md / S2
> Goal: move critical business invariants from application-only checks into D1 constraints and transaction-safe backend behavior.

## 1. Scope

S2 protects the current business model from duplicate or inconsistent records caused by concurrent requests, retries, multi-admin use, or future integrations.

Primary targets:
- room identity within a property
- one bill per room/month
- invoice number uniqueness
- one receipt per bill in the current V1 payment model
- receipt number uniqueness
- deposit receipt number uniqueness
- one room-layout row per room
- safer ID/document-number generation
- idempotent retry behavior where practical

S2 does not yet define paid-bill immutability/void behavior. That is S3.

## 2. Required database invariants

Before adding constraints, production data must be audited for duplicates.

Target constraints after audit/cleanup:

- UNIQUE rooms(property_id, room_number)
- UNIQUE bills(room_id, month)
- UNIQUE bills(invoice_no) where invoice_no is non-empty
- UNIQUE receipts(bill_id) where bill_id is non-empty
- UNIQUE receipts(receipt_no) where receipt_no is non-empty
- UNIQUE deposits(receipt_no) where receipt_no is non-empty
- UNIQUE room_layouts(room_id)
- UNIQUE tenant room occupancy through tenants(room_id) under the current one-active-tenant-per-room model

SQLite/D1 partial unique indexes should be used for optional document numbers so multiple empty-string legacy values do not collide.

## 3. Receipt rule for V1

Current DelightApp creates one receipt for the full bill amount and immediately marks that bill paid.

Therefore S2 treats:

`one bill -> at most one receipt`

as a database invariant.

Partial payments / multiple receipts per bill are not part of the current model. If added later, this constraint must be replaced by an explicit payment model rather than silently removed.

## 4. Concurrency risks to remove

Current backend frequently derives new IDs/document numbers by reading the current maximum and adding one.

Risks:
- simultaneous requests can compute the same next ID
- simultaneous receipt/deposit creation can compute the same document number
- application-level duplicate checks can race between check and insert

S2 should rely on:
- database UNIQUE constraints as final authority
- transactional or atomic allocation where possible
- retry-on-constraint behavior only when safe
- no client-generated business IDs for authoritative writes

## 5. Migration rollout

1. Run production read-only duplicate audit.
2. If duplicates exist, stop and document exact cleanup required.
3. If clean, create a forward-only migration with unique indexes/constraints.
4. Update Worker create/update flows to translate constraint failures into stable business errors.
5. Harden receipt creation against already-paid/already-receipted retries.
6. Harden document-number allocation.
7. Run pre-deploy validation.
8. Apply migration.
9. Deploy Worker.
10. Run production E2E using temporary generated records only inside an isolated temporary property/account scope; clean all test data afterward.

## 6. Stable errors

Expected business errors should include:
- room_number_exists
- room_already_has_tenant
- bill_room_month_exists
- invoice_no_exists
- receipt_already_exists
- receipt_no_exists
- deposit_receipt_no_exists
- room_layout_exists where relevant

The frontend should present readable messages and must not expose raw SQLite errors.

## 7. Guardrails

- do not modify existing financial amounts during schema hardening
- do not renumber historical invoices/receipts unless an explicit cleanup is required and reviewed
- preserve VAT snapshots
- preserve audit logs
- tenant/admin property isolation remains unchanged
- schema migrations are forward-only
- production deployment still requires [PROD-DEPLOY]

## 8. Acceptance tests

Required:
- duplicate room number in same property rejected
- same room number in different property allowed
- duplicate bill room/month rejected
- duplicate invoice number rejected
- second receipt for same bill rejected
- duplicate receipt number rejected
- duplicate deposit receipt number rejected
- second room-layout row rejected
- concurrent/retried creation cannot create duplicate authoritative records
- valid existing admin workflows still succeed
- tenant isolation still succeeds
- no historical records are changed by migration

## 9. Production audit — 2026-09-21

Duplicate audit result:
- duplicate room number within property: 0
- multiple tenants in one room: 0
- duplicate bill room/month: 0
- duplicate invoice number: 0
- multiple receipts for one bill: 0
- duplicate receipt number: 0
- duplicate deposit receipt number: 0
- duplicate room-layout row: 0
- receipt referencing missing bill: 0
- receipt/bill room mismatch: 0
- meter referencing missing bill: 0
- meter/bill room mismatch: 0

Observed for S3 follow-up:
- paid bills without a receipt: 2

The two paid-without-receipt records are not auto-corrected in S2 because they may represent manual/legacy payment status. S3 must define the accounting lifecycle before changing historical records.

## 10. Lead rollout decision

Production duplicate state is clean for S2 constraints.

Proceed with forward-only UNIQUE indexes plus Worker-side stable error/retry behavior. Historical financial values and document numbers must remain unchanged.
