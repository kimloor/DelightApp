# DelightApp — Admin Offline Read-Only Mode V1

> Status: DONE — production verified 2026-09-22
> Parent: STABILIZATION.md / S7
> Goal: when D1 is temporarily unavailable, allow Admin to view the last cached snapshot without allowing business/financial mutations or implying the cache is current.

## 1. Scope

Admin only.

Tenant portal keeps its current safer behavior:
- no admin-cache fallback
- if tenant home cannot be loaded, show an error instead of stale shared data

## 2. Required behavior

When `getAdminScoped` fails because of network/server availability (not unauthorized/forbidden):

- load the last local admin cache
- enter `offlineReadOnly`
- show a prominent banner that cached data may be stale
- sync indicator must say offline/read-only, not imply successful sync
- all authenticated mutation actions are blocked centrally
- any local object changed before a blocked API call is restored from the cached snapshot
- provide a "ลองเชื่อมต่อใหม่" action
- only leave offline read-only mode after a fresh `getAdminScoped` succeeds

Unauthorized/forbidden must continue to:
- clear incompatible cache
- logout
- never display stale data

## 3. Mutation guard

The frontend API client is the final client-side guard.

When offlineReadOnly is active:
- read actions may attempt network reads
- mutation actions fail locally with `offline_read_only`
- cached arrays are reloaded before returning the error so pre-call in-memory mutations cannot persist visually
- UI shows one clear read-only message

Backend authorization remains unchanged and remains the real authority.

## 4. Read-only actions

Expected read-only authenticated actions include:
- me
- getAdminScoped
- getTenantHome
- adminListUsers
- platformOverview
- platformHealth

All row/business/account mutations require online D1.

## 5. Reconnect

Reconnect button:
1. set sync state to connecting
2. call normal `loadData()`
3. if `getAdminScoped` succeeds, replace cache with fresh server state and exit offlineReadOnly
4. if it still fails, remain read-only on the existing cache

## 6. Acceptance tests

- admin with cached data + simulated API outage enters offline read-only
- visible banner explicitly says cached/stale/read-only
- navigation/viewing cached pages still works
- create/update/delete business action is blocked before persistence
- pre-call local mutation is restored from cached snapshot
- receipt/bill/meter/property/tenant mutations cannot persist locally while offline
- reconnect failure keeps read-only active
- reconnect success loads fresh server data and clears the banner
- unauthorized/forbidden still logs out and clears cache
- tenant never falls back to admin cache

## 7. Non-goals

- offline write queue
- conflict merging
- background sync of edits
- offline tenant portal
- PWA caching of authenticated API responses


## 8. Production verification

Completed 2026-09-22:
- Pre-Deploy Validate passed
- Production Deploy + smoke passed
- browser E2E simulated API outage with cached admin data
- stale/read-only banner appeared
- cached navigation remained readable
- mutation was rejected locally with offline_read_only
- blocked mutation did not send an API request
- cached snapshot remained unchanged
- reconnect restored fresh D1 data and removed read-only mode
- isolated test account/property were cleaned up
