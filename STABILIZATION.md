# DelightApp — Stabilization Phase

> Status: IN PROGRESS
> Started: 2026-09-21
> Purpose: harden security, financial data integrity and account lifecycle before adding major product features.

## 1. Why this phase exists

The D1 migration, multi-property access control and tenant foundation are now in production.

Before adding Payment Slip Verification, LINE, Booking or E-Signature, DelightApp should close several foundation gaps that could otherwise become harder to fix later.

This phase must preserve current business behavior unless a change is explicitly documented.

## 2. Priority order

### S1 — Auth / Session Hardening
Status: DONE

Goals:
- replace legacy password hashing with a stronger KDF using backward-compatible rehash-on-login
- make sessions revocable
- invalidate old sessions after password change/reset
- support logout-all / forced revocation
- raise password minimum requirements
- add login brute-force/rate-limit protection
- preserve existing accounts and avoid forced password resets unless necessary

### S2 — Financial / Database Integrity
Status: DONE

Goals:
- enforce critical uniqueness at the database layer
- prevent duplicate bill-per-room/month
- prevent duplicate invoice / receipt identifiers
- prevent duplicate receipt creation for the same bill unless the future payment model explicitly allows it
- prevent duplicate room number within a property
- prevent duplicate room layout row
- remove avoidable MAX+1 race conditions for IDs/document numbers
- add idempotency/transaction protection where appropriate

### S3 — Paid Bill Lock + Void Workflow
Status: DONE

Goals:
- define immutable accounting behavior after receipt issuance
- block destructive edits/deletes that would make receipt history inconsistent
- introduce a controlled void/cancel flow
- preserve historical amount/VAT snapshots
- audit every financial correction

### S4 — Tenant Account Lifecycle
Status: DONE

Goals:
- allow an authorized property owner/admin flow to provision tenant login
- bind account -> tenant through tenant_accounts
- reset tenant password within scope
- disable/unlink tenant login when tenancy ends
- preserve/rebind correctly when tenant moves room
- avoid manual D1 edits for routine tenant onboarding

### S5 — Frontend Security / XSS Audit
Status: NEXT

Goals:
- escape all user-controlled/business-data output before innerHTML use
- avoid unsafe HTML construction where practical
- protect local session material against stored-XSS paths
- review QR/image/file rendering surfaces

### S6 — Superadmin Console V1
Status: PLANNED

Goals:
- manage platform/account structure without automatically exposing tenant/business data
- view properties, owners/admin mappings and account state
- repair access mappings
- suspend/restore accounts
- expose platform-level audit/health information

### S7 — Admin Offline Read-Only Mode
Status: PLANNED

Goals:
- if D1 is unavailable, clearly label cached data as stale/offline
- disable financial/business mutations while offline
- never imply cached data is current server state

### S8 — Audit Log Viewer
Status: PLANNED

Goals:
- owner-scoped operational audit view
- platform audit view for superadmin
- filters by actor/action/table/date
- no unnecessary tenant-data expansion

### S9 — Frontend Modularization / Legacy Cleanup
Status: LATER

Goals:
- split monolithic index.html only after higher-risk stabilization is complete
- archive/remove legacy Apps Script only after rollback window closes
- remove dead compatibility code in controlled cleanup

## 3. Guardrails

- Cloudflare D1 remains production source of truth.
- Never re-enable global getAll.
- Never restore whole-table save.
- Every business-data write remains server-authorized by property scope.
- Superadmin does not automatically receive property business data.
- Production deployment requires [PROD-DEPLOY].
- Schema changes are forward-only migrations.
- Do not expose passwords, hashes, salts, AUTH_SECRET, BOT_API_KEY or tenant private data in the public repository.
- Financial history changes must be auditable.

## 4. Completion criteria

Stabilization is complete when S1-S5 are production-verified.

S6-S8 may continue afterward but should be completed before broad external onboarding if DelightApp becomes a multi-customer platform.

Major roadmap features may resume after S1-S5 unless a later audit identifies a blocker.

## 5. Current lead decision

S1 — Auth / Session Hardening is production-verified.
S2 — Financial / Database Integrity is production-verified.
S3 — Paid Bill Lock + Receipt Void is production-verified.
S4 — Tenant Account Lifecycle is production-verified.

Next: S5 — Frontend Security / XSS Audit.

Detailed contracts:
- `AUTH-SESSION-HARDENING-V2.md`
- `FINANCIAL-DATA-INTEGRITY-V1.md`
- `PAID-BILL-RECEIPT-VOID-V1.md`
- `TENANT-ACCOUNT-LIFECYCLE-V1.md`
