# DelightApp — Paid Bill Lock + Receipt Void V1

> Status: IN PROGRESS
> Parent: STABILIZATION.md / S3
> Goal: make issued receipts auditable and prevent later bill edits from making financial history inconsistent.

## 1. Core accounting rule

Once a bill has an active receipt:

- bill amount/VAT/month/room/status may not be edited directly
- bill may not be moved to another month
- bill may not be deleted
- a second active receipt may not be issued

To correct a paid bill:

1. Void the active receipt with a reason.
2. Bill becomes unpaid again.
3. Correct the bill.
4. Issue a new receipt with a new receipt number.

The old receipt remains stored as historical evidence.

## 2. Receipt states

Receipts gain:

- status: active | void
- voided_at
- voided_by_user_id
- void_reason

Existing receipts migrate to status=active.

Receipt numbers are never reused.

## 3. Active receipt uniqueness

S2 enforced one receipt row per bill.

S3 changes that to:

- at most one ACTIVE receipt per bill
- any number of VOID historical receipts for that bill

The existing unique receipt-number rule remains permanent.

## 4. Permissions

Issuing receipts:
- property owner/admin as today

Voiding receipts:
- property Owner only in V1

Reason:
- voiding reverses an accounting document and is more sensitive than routine receipt issuance
- every void is audit logged with actor, bill/receipt ID and reason

A later product decision may extend void permission to ordinary property admins.

## 5. Backend rules

When an active receipt exists for a bill:

- updateBill -> bill_locked_by_receipt
- batchUpdateBills -> bill_locked_by_receipt
- moveBills -> locked bill skipped/rejected explicitly
- deleteBill -> bill_locked_by_receipt
- createReceipt -> receipt_already_exists

New action:

- voidReceipt

Requirements:
- verify authenticated user is property Owner
- receipt must exist and be active
- reason is required
- set receipt status=void + void metadata
- set bill status=unpaid
- audit log the reversal
- operation must be transaction-safe

## 6. Frontend

Receipt/bill UI should:

- clearly show active receipt vs voided receipt
- disable or hide destructive bill editing when active receipt exists
- expose "Void receipt" only to an authorized Owner where feasible
- ask for a required reason
- warn that the existing receipt number remains in history
- after void, reload bill/receipt state and allow correction/reissue

Backend remains authoritative even if frontend controls are bypassed.

## 7. Legacy paid bills without receipt

Production audit found 2 historical bills with status=paid but no receipt.

S3 will NOT synthesize receipts and will NOT change these records automatically.

They remain legacy/manual paid records.

The lock rule is based on an ACTIVE receipt, not status=paid alone, so historical records are preserved without guessing their origin.

## 8. Migration

Forward-only migration expected to:

1. add receipt status/void columns
2. mark existing receipts active
3. replace S2 unique receipts(bill_id) index
4. create partial unique index for active receipt per bill

No historical amounts or receipt numbers are changed.

## 9. Acceptance tests

Required:
- issued receipt locks bill update
- issued receipt locks bill delete
- issued receipt locks bill move
- second active receipt rejected
- ordinary property admin cannot void
- Owner can void with reason
- void without reason rejected
- voided receipt remains queryable/history-visible
- bill returns to unpaid after void
- corrected bill can be updated after void
- new receipt can be issued after void
- old and new receipt numbers are different
- only one active receipt exists after reissue
- tenant/admin property isolation remains unchanged
- legacy paid-without-receipt records remain unchanged

## 10. Lead rollout

Implement on a branch, run pre-deploy validation, apply migration before Worker deployment, then run isolated production E2E and remove temporary workflows.
