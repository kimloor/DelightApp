# DelightApp — Multi-Tenant Access Control V1

> Status: DONE — Phase A/B/C/D/E complete
> Goal: allow multiple independent admins to use DelightApp without seeing or modifying each other's properties, while allowing one property to have multiple admins.

## 1. Roles

V1 uses only two application roles:

- `admin`
- `tenant`

No staff role in V1.

Platform-level `superadmin` now exists separately and remains outside property-level V1 permission mapping.

## Platform administration

DelightApp separates platform-level administration from property-level access.

```text
users.role
- admin
- tenant

users.platform_role
- normal
- superadmin

property_admins.access_role
- owner
- admin
```

A `superadmin` manages the DelightApp platform itself. It is not automatically a property owner and should not automatically receive tenant/business data from every property.

Platform-level capabilities may include:

- manage platform accounts
- recover/fix account and access mappings
- view property/account structure
- suspend or restore accounts in a future version
- inspect platform audit/error information

Property business-data access remains governed by `property_admins`.

Current property UI must clearly show `Owner` and `Admin` for each property.

## 2. Core relationship

Admin access is many-to-many:

```text
users (admin)
   |
   v
property_admins
   |
   v
properties
   |
   +-- rooms
        |
        +-- tenants
        +-- bills
        +-- deposits
        +-- meter readings
        +-- receipts
        +-- room layouts
```

This supports:

- one admin -> many properties
- one property -> many admins
- admins cannot access properties they are not assigned to

## 3. New table: property_admins

Proposed schema:

```sql
CREATE TABLE property_admins (
  property_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_role TEXT NOT NULL DEFAULT 'admin'
    CHECK (access_role IN ('owner','admin')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (property_id, user_id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Indexes:

- `property_admins(user_id)`
- `property_admins(property_id)`

## 4. Property roles

### owner

- full property access
- can add another admin
- can remove an admin
- can transfer ownership
- cannot remove the last owner without assigning another owner

### admin

- full operational access to property data
- cannot change owner
- cannot remove owner
- cannot grant/revoke property admin access in V1

Both owner/admin can manage:

- rooms
- tenants
- bills
- meters
- receipts
- deposits
- property settings
- VAT/settings
- room layout

## 5. Tenant account mapping

Tenant login must not grant property-admin access.

Proposed table:

```sql
CREATE TABLE tenant_accounts (
  user_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

Tenant permission chain:

```text
current user
 -> tenant_accounts
 -> tenant
 -> room
 -> property
```

Tenant may access only data explicitly belonging to that tenant/room.

Future tenant-facing features may include:

- own bills
- own receipts
- repair requests
- parcels
- announcements
- contract
- payment/booking status

## 6. Backend enforcement

Frontend filtering is not sufficient.

Every protected Worker action must derive access from the authenticated user.

For admin access:

```text
user
 -> property_admins
 -> allowed property IDs
```

Queries must return only rows belonging to those property IDs.

Writes must validate that the target row belongs to an allowed property before insert/update/delete.

Examples:

```text
room -> property_id -> property_admins
bill -> room -> property -> property_admins
tenant -> room -> property -> property_admins
receipt -> room -> property -> property_admins
meter -> room -> property -> property_admins
```

A client-supplied property ID must never be trusted without server-side authorization.

## 7. getAll behavior

Current `getAll` returns the shared global dataset.

After V1:

### admin

Return only:

- properties assigned in `property_admins`
- rooms in those properties
- tenants in those rooms
- bills/deposits/meters/receipts/layouts belonging to those rooms

### tenant

Do not use the admin `getAll` payload.

Tenant should use a separate tenant-facing endpoint with a deliberately smaller response.

## 8. Write model interaction

The current compatibility whole-table write model is unsafe for multi-tenant isolation because deleting "rows absent from the client snapshot" can affect data outside the user's scope.

Therefore the access-control rollout and row-level CRUD migration are linked.

Recommended order:

1. create access tables and migration
2. seed existing access mappings
3. introduce scoped read APIs
4. implement row-level create/update/delete APIs
5. migrate frontend writes
6. disable old whole-table write path
7. enable strict property isolation

Do not enable strict isolation while unrestricted whole-table replacement remains active.

## 9. Existing data migration

Before enabling isolation, every existing property must have at least one owner.

For current production data:

- preserve existing property IDs
- preserve all current business records
- populate `property_admins` explicitly
- verify each property has >= 1 owner
- verify all existing operational users have the intended access
- only then enable scoped queries/writes

No property should become inaccessible during migration.

## 10. Account creation

Public self-registration is disabled.

V1 account provisioning:

- admins are created by an authorized admin/platform process
- tenant accounts are created or invited through a future tenant-account flow

Creating an account does not itself grant property access.

Property access must be added explicitly to `property_admins`.

## 11. Admin UI requirements

Future admin user management should support:

- create admin account
- list admins
- assign admin to property
- choose owner/admin
- remove admin from property
- transfer ownership
- show properties each admin can access

Guardrails:

- cannot leave a property with zero owners
- cannot grant tenant accounts admin access accidentally
- every permission change writes an audit log

## 12. Security rules

1. Every admin read/write is server-scoped by property access.
2. Never trust client-side filtering for authorization.
3. Never trust client-supplied owner/user IDs without validating them.
4. Tenant endpoints must be separate from admin bulk endpoints.
5. Permission changes must be audit logged.
6. Whole-table global replacement must be retired before strict isolation.
7. Property ownership/access changes should be transactional where multiple rows are involved.

## 13. Rollout phases

### Phase A — Schema only

**Status: DONE**

- `property_admins` added and seeded
- `tenant_accounts` added and seeded
- current mappings validated in production D1

### Phase B — Scoped reads

**Status: DONE**

Implemented:

- `getAdminScoped` — server-scoped admin snapshot using `property_admins`
- `getTenantHome` — tenant-specific data via `tenant_accounts`
- legacy global `getAll` is now admin-only
- tenant accounts cannot receive the global admin dataset

Current production state:

- admin frontend uses `getAdminScoped`
- legacy global `getAll` is disabled
- strict read isolation is active

### Phase C — Row-level writes

**Status: DONE**

Production frontend writes now use explicit server-authorized row actions for:

- properties
- rooms, including bulk room creation/update
- tenants
- bills, including bulk updates and server-side invoice renumbering
- meter history
- receipts
- deposits
- room layouts

Additional Phase C hardening:

- server generates business IDs for new rows instead of trusting client snapshots
- invoice / deposit receipt / receipt numbering is generated server-side for new records
- property deletion is owner-only and cascades through the property's business data
- tenant deletion removes its tenant-account binding
- the legacy whole-table client save functions were removed
- the legacy whole-table Worker write path returns `legacy_whole_table_write_disabled`
- authenticated GET endpoints using tokens in URLs were retired; authenticated actions are POST-only

### Phase D — Enable isolation

**Status: DONE**

Implemented and verified in production:

- admin frontend now uses `getAdminScoped`
- legacy global `getAll` returns `legacy_global_read_disabled`
- admins see only properties assigned through `property_admins`
- admin user-management listing is scoped to shared/owned properties
- password reset is limited to users inside the current admin scope
- only property owners can create new admin accounts for their properties
- owners can remove ordinary admin access from properties they own
- ordinary admins cannot remove owners
- cross-property write attempts return `forbidden`

Production isolation verification created a temporary isolated admin/property and confirmed:
- scoped read returned only the test property
- user management returned only users in the test scope
- write attempt against another property was denied
- global legacy read was denied
- temporary test data was cleaned up successfully

### Phase E — Tenant foundation

**Status: DONE**

Implemented:

- tenant account binding through `tenant_accounts`
- tenant-specific API through `getTenantHome`
- tenant login routes to a dedicated tenant-facing UI, not the admin shell
- tenant home shows mapped property, room, tenant name, recent/current bills, payment status, receipts and deposit information
- tenant can change own password and logout
- tenant frontend does not call admin dataset endpoints
- tenant session clears incompatible admin cache and has no stale-admin-data fallback
- server-side tenant lookup remains restricted to the mapped tenant/room/property

## 14. Acceptance tests

Minimum required:

- admin A can access assigned property 1
- admin A cannot read property owned only by admin B
- admin A cannot write/delete rows under admin B property
- property can have 2-3 admins
- one admin can have 3-4 properties
- owner can add/remove admin
- ordinary admin cannot remove owner
- property cannot end with zero owners
- tenant cannot access admin endpoints
- tenant can access only own tenant/room data
- audit log records access-management changes

## 15. Existing production access mapping

Confirmed mapping for current production accounts:

- `kim` -> admin access to both current properties
- `test` -> admin access to both current properties
- `test02` -> tenant role, mapped to the current tenant in ทีเอชแอล แมนชั่น
- `pare` -> tenant role, mapped to the current tenant in ภาณุภณแมนชั่น

Current properties:

- ภาณุภณแมนชั่น
- ทีเอชแอล แมนชั่น

Initial admin seeding for Phase A:

```text
kim  -> ภาณุภณแมนชั่น
kim  -> ทีเอชแอล แมนชั่น
test -> ภาณุภณแมนชั่น
test -> ทีเอชแอล แมนชั่น
```

Tenant mapping confirmed:

```text
test02 -> current tenant under ทีเอชแอล แมนชั่น
pare   -> current tenant under ภาณุภณแมนชั่น
```

Phase A may seed these mappings by joining the current sole tenant in each property.

Strict isolation prerequisites now completed:

1. admin mappings seeded and verified
2. tenant mappings seeded and verified
3. scoped read APIs implemented
4. whole-table global writes retired

Access Control V1 is complete. Further hardening is tracked in `STABILIZATION.md`.
