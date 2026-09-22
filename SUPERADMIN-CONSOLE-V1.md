# DelightApp — Superadmin Console V1

> Status: IN PROGRESS — Phase A/B production verified; Phase C next
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

**Status: DONE — production verified 2026-09-22**

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

**Status: DONE — production verified 2026-09-22**

Planned:
- assign an ordinary admin account to a property
- add/promote an ordinary admin to Owner
- change Owner -> Admin only when another Owner remains
- remove Admin/Owner mapping only when another Owner remains if target is Owner
- repair orphaned/mistaken mappings without opening property business data

Phase B API contract:

#### `platformSetPropertyAccess`

Input:
- `propertyId`
- `userId`
- `accessRole`: owner | admin

Rules:
- Superadmin only
- target property must exist
- target user must exist and have application role `admin`
- target must be an ordinary platform account (`platform_role=normal`) in V1
- insert mapping if absent
- change mapping role if present
- Owner -> Admin must be rejected when target is the last Owner
- every change increments no user session automatically because business-data authorization is checked from D1 on every request; the change is nevertheless audit logged

#### `platformRemovePropertyAccess`

Input:
- `propertyId`
- `userId`

Rules:
- Superadmin only
- mapping must exist
- removing the last Owner is rejected
- mapping removal is audit logged

UI behavior:
- property card lists current Owner/Admin mappings
- Superadmin may add an eligible Admin account
- Superadmin may promote/demote mapping
- Superadmin may remove mapping
- destructive/ownership changes require confirmation

Every mutation requires:
- explicit target account/property
- server-side validation
- audit logging
- property must retain at least one Owner

### Phase C — Platform Audit / Health

**Status: NEXT**

Planned:
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

Phase A and Phase B are production-verified.

Current work: Phase C — Platform Audit / Health.


## 8. Phase A production verification

Completed 2026-09-22:
- Pre-Deploy Validate passed
- production deploy and smoke test passed
- temporary Superadmin E2E account could read structural overview
- normal admin was denied platformOverview
- overview contained no room/tenant/bill/receipt/deposit/meter payload
- suspend immediately revoked the target session
- disabled account could not login
- restore allowed login again
- self-suspend was rejected
- platformSetAccountStatus audit events were verified
- all temporary accounts/workflows were cleaned up

Phase B production verification completed 2026-09-22.

Next: Phase C — Platform Audit / Health.


## 9. Phase B production verification

Completed 2026-09-22:
- Pre-Deploy Validate passed
- Production Deploy + smoke passed
- normal admin was denied Phase B platform actions
- tenant account target was rejected
- superadmin account target was rejected
- ordinary admin mapping could be added
- Admin -> Owner promotion succeeded
- Owner -> Admin demotion succeeded when another Owner remained
- last Owner demotion was rejected
- last Owner removal was rejected
- removal succeeded after another Owner existed
- platformOverview reflected the final repaired mapping
- access changes were audit logged
- temporary test users/property/workflow were cleaned up

Next: Phase C — Platform Audit / Health.
