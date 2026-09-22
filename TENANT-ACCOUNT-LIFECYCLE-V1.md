# DelightApp — Tenant Account Lifecycle V1

> Status: DONE — production verified 2026-09-22
> Parent: STABILIZATION.md / S4
> Goal: make tenant login provisioning and deactivation a normal property-admin workflow instead of manual D1 work.

## 1. Core model

Tenant identity remains:

user (role=tenant)
 -> tenant_accounts
 -> tenant
 -> room
 -> property

Creating a tenant business record does not automatically create a login account.

An authorized property admin may explicitly provision a login for an existing tenant.

## 2. V1 lifecycle

### Provision
- choose an existing tenant
- choose username
- set initial password
- create users row with role=tenant
- create tenant_accounts binding
- account starts active
- audit log the action

### Room move
- no account rebind needed when the same tenant row moves rooms
- tenant_accounts continues pointing to the tenant
- access follows tenant -> current room -> property automatically

### Disable
- property admin may disable a tenant login
- disabled account cannot login
- existing sessions are revoked immediately
- tenant business/history record remains intact

### Enable
- property admin may re-enable the same tenant account
- existing password remains unless separately reset
- account may login again

### End tenancy / delete tenant
- tenant account must be disabled and session-revoked before/until binding is removed
- deleting the tenant record removes tenant_accounts binding
- user account remains as disabled historical identity rather than becoming an active unbound login

## 3. Permissions

Property Owner and ordinary property Admin may provision/disable/enable tenant accounts for tenants inside their own property scope.

Cross-property account actions are forbidden.

Existing scoped password-reset rules remain authoritative.

## 4. Schema

Add:
- users.account_status TEXT NOT NULL DEFAULT 'active'
  - active
  - disabled

Existing users migrate to active.

Login must return generic invalid_credentials for disabled accounts so account existence is not disclosed.

publicUser may expose accountStatus to authorized admin-management views, but password/hash/salt remain private.

## 5. API

Add actions:
- provisionTenantAccount
- setTenantAccountStatus

Provision input:
- tenantId
- username
- password
- displayName optional

Provision rules:
- tenant must exist inside caller property scope
- tenant must not already have tenant_accounts binding
- username must be globally unique
- password follows current product minimum (4 characters)
- new password uses current PBKDF2 format
- create user + binding atomically

Status rules:
- tenant account must be bound to a tenant in caller property scope
- active -> disabled increments session_version
- disabled -> active keeps current session_version/password
- every change is audit logged

## 6. Admin UI

Tenant list/edit UI should show:
- ไม่มีบัญชี
- ใช้งานอยู่
- ปิดใช้งาน

Actions:
- สร้างบัญชีผู้เช่า
- รีเซ็ตรหัสผ่าน (existing admin flow may be reused where practical)
- ปิดบัญชี
- เปิดบัญชี

Do not expose password after creation.

## 7. Tenant login behavior

- active bound tenant -> tenant portal
- disabled tenant -> generic login failure
- active but unbound legacy/anomalous tenant account -> login may authenticate but tenant home returns tenant_not_linked; S4 cleanup should minimize this state
- tenant still cannot access admin endpoints

## 8. Existing production users

Existing users remain active:
- admin
- kim
- test
- test02
- pare

Existing tenant mappings remain unchanged.

No password reset is required by this migration.

## 9. Acceptance tests

Required:
- property admin provisions tenant account
- tenant can login and sees only mapped tenant/room/property
- duplicate username rejected
- second account binding for same tenant rejected
- cross-property provision denied
- disable revokes existing tenant token
- disabled account cannot login
- enable allows login again
- room move preserves tenant account access to new room
- tenant deletion leaves account disabled and unbound
- tenant cannot access admin endpoint
- no password/hash/salt returned to frontend
- audit log records provision/status changes

## 10. Lead rollout

Implement on branch -> Pre-Deploy Validate -> migration first -> Worker/UI deploy -> isolated production E2E -> remove temporary workflows -> mark S4 DONE.


## 11. Production verification

Completed 2026-09-22:
- migration 0007 applied successfully
- all existing users remained active
- property-scoped tenant account provisioning succeeded
- cross-property provisioning was denied
- tenant login reached only its mapped tenant/room/property
- tenant could not access admin scoped endpoint
- disable revoked the active tenant token immediately
- disabled login returned generic invalid_credentials
- enable restored login access
- moving the tenant to another room preserved account binding and portal access followed the new room
- deleting the tenant revoked the active token, disabled the user account and removed the tenant_accounts binding
- isolated E2E properties/accounts were cleaned up
- temporary migration/E2E workflows were removed
