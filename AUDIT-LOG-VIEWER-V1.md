# DelightApp — Audit Log Viewer V1

> Status: DONE — production verified 2026-09-22
> Parent: STABILIZATION.md / S8
> Goal: make existing audit history useful without widening access to business data.

## 1. Access model

### Property Owner
May view audit events only for properties where the current user has `property_admins.access_role='owner'`.

Owner filters:
- property
- actor/username
- action
- date range

Ordinary Admin does not receive the Owner audit viewer in V1.

### Superadmin
May view platform/account/access events only.

Superadmin V1 must not automatically receive normal property business-operation logs.

Platform audit includes actions such as:
- platform account status changes
- platform property-access changes
- password/session administration
- other platform/account operations

## 2. Property scoping

Add `audit_logs.property_id`.

New property/business events must write the authoritative property ID at event time.

This is necessary because:
- an admin may manage more than one property
- filtering by actor is not sufficient isolation
- deleted records cannot always be mapped back to a property later

Historical rows should be backfilled only where property scope can be determined safely. Unknown historical scope remains blank and is not shown to property Owners.

## 3. API

Add:
- `auditListOwner`
- `auditListPlatform`

Requirements:
- server-side authorization only
- limit/page cursor or offset
- maximum page size
- stable newest-first ordering
- optional actor/action/date filters
- no raw unrestricted audit-table endpoint

## 4. UI

Owner:
- Settings -> Audit Log
- property selector limited to owned properties
- actor/action/date filters
- newest first
- readable timestamp, actor, action, object/table, note

Superadmin:
- Platform Console -> Platform Audit
- account/access/platform events only

## 5. Guardrails

- never expose password/hash/salt/token values
- do not include full business row payloads in audit notes
- Superadmin does not automatically browse property business logs
- ordinary Admin cannot open Owner audit viewer
- tenant cannot access audit APIs
- unknown historical property scope is never guessed

## 6. Acceptance tests

- Owner sees logs for owned property
- Owner cannot request another property
- ordinary Admin gets forbidden
- tenant gets forbidden
- Superadmin platform audit excludes ordinary business-operation logs
- property-scoped logs continue after records are deleted
- filters and pagination work
- audit viewer does not alter business data


## 7. Production verification

Completed 2026-09-22:
- migration 0008 applied successfully
- production Worker deployed successfully
- Owner property audit returned only the owned property's scoped events
- Owner request for an unowned property was denied
- ordinary Admin audit access was denied
- Superadmin platform audit included platform access events
- Superadmin platform audit excluded normal room/business create events
- temporary E2E users/property were cleaned up
- temporary migration/E2E workflows were removed after successful use
