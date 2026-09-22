# DelightApp — Superadmin Console V1

> Status: IN PROGRESS
> Parent: STABILIZATION.md / S6
> Goal: give the platform superadmin operational control over DelightApp account/property structure without granting implicit access to tenant or financial business data.

## 1. Security boundary

Superadmin is a platform role, not a property role.

`users.platform_role = 'superadmin'` does NOT automatically grant:
- room data
- tenant names/phones
- bills or payment amounts
- receipts/deposits
- meter readings
- property settings containing payment/QR details

Property business-data access remains governed by `property_admins`.

## 2. V1 rollout

### Phase A — Platform Overview + Account Control

Implement first.

Superadmin may view:
- platform user accounts: id, username, display name, app role, platform role, account status, created date
- properties: id and property name
- Owner/Admin mappings for each property
- aggregate counts only: number of properties, users, active/disabled accounts, owners/admin mappings, tenant-account bindings

Superadmin may:
- suspend a normal account
- restore a suspended normal account
- force session revocation when status changes

Guardrails:
- cannot suspend the currently logged-in superadmin account
- cannot demote/change platform_role in Phase A
- account status action must write audit_log
- suspension must immediately invalidate existing sessions

### Phase B — Access Mapping Repair

Only after Phase A production verification.

Planned:
- assign ordinary admin to property
- remove ordinary admin from property
- transfer/add Owner with zero-owner protection
- repair orphaned/mistaken mappings

Every mutation requires:
- explicit target account/property
- server-side validation
- audit logging
- property must retain at least one Owner

### Phase C — Platform Audit / Health

May later surface:
- recent platform-level audit events
- migration/schema health
- failed auth/throttle summaries
- account/access integrity warnings

Do not expose tenant financial content.

## 3. Backend API

Phase A actions:

### `platformOverview`

Requires:
- authenticated account
- `platform_role = 'superadmin'`

Returns only structural metadata:
- users[]
- properties[]
- propertyAccess[]
- counts

Must not join/return tenants, bills, receipts, deposits, meters, room data or QR/payment fields.

### `platformSetAccountStatus`

Requires superadmin.

Input:
- userId
- status: active | disabled

Rules:
- target must exist
- target cannot be current superadmin self
- updating status increments target session_version
- action is audit logged
- no password/hash/salt returned

## 4. Frontend

Superadmin Settings gets:
- “Platform Console” button

Console shows:
- summary counts
- account list
- property list with Owner/Admin names
- active/disabled badges
- suspend/restore action for eligible accounts

The console is not a property admin screen and must not load `getAdminScoped` to discover global platform structure.

## 5. Acceptance tests

- normal admin calling platformOverview -> forbidden
- tenant calling platformOverview -> forbidden
- superadmin receives only structural metadata
- response contains no tenant/bill/receipt/deposit/meter payload
- superadmin sees all property Owner/Admin mappings
- superadmin can disable a normal account
- disabled account's old token immediately becomes unauthorized
- disabled account cannot log in
- superadmin can restore the account
- restored account can login again
- superadmin cannot disable self
- all status changes write audit logs
- existing property isolation remains unchanged

## 6. Non-goals for Phase A

- viewing property business data
- impersonation/login-as
- editing bills/tenants/rooms
- changing platform_role
- deleting accounts
- ownership transfer
- property creation/deletion
- viewing password/hash/salt

## 7. Lead decision

Implement Phase A first and production-verify it before enabling access-mapping repair.
