# DelightApp — Auth / Session Hardening V2

> Status: DONE — production verified 2026-09-21
> Parent: STABILIZATION.md / S1
> Goal: upgrade password/session security without breaking existing accounts.

## 1. Current production behavior

Current authentication uses:
- legacy SHA-256(password + ":" + salt) password hashes
- HMAC-signed stateless bearer tokens
- 30-day token expiry
- token stored by the frontend for session continuity
- password change/reset updates the hash but does not invalidate already-issued tokens

This is functional but does not support immediate session revocation.

## 2. Required V2 behavior

### Password hashing

Use a stronger password KDF supported safely in the Cloudflare Worker runtime.

Preferred implementation for this codebase:
- PBKDF2-SHA-256
- per-user random salt
- explicit algorithm/version metadata
- sufficiently high iteration count chosen for Worker runtime limits

Backward compatibility:
- existing legacy SHA-256 accounts must continue to login
- after a successful legacy login, rehash the supplied password into V2 format
- no plaintext password is stored or logged
- no mass password reset required

### Session revocation

Add a server-controlled revocation mechanism.

Minimum V2:
- users.session_version integer, default 1
- token contains session version at issuance
- authenticate compares token version with current users.session_version
- password change increments session_version
- admin password reset increments session_version
- logout-all increments session_version
- old tokens fail immediately after increment

Normal single-device logout may remain client-side token removal.

### Token lifetime

Keep a bounded expiry.
Initial V2 target:
- maximum 7 days unless a later product decision changes it

A shorter lifetime reduces stolen-token exposure while session_version supplies immediate revocation.

### Password policy

New password minimum:
- at least 8 characters

Do not require complexity rules such as mandatory uppercase/symbols in V2.

Existing accounts with shorter passwords remain valid until they change/reset the password.

### Login abuse protection

Add lightweight server-side throttling appropriate for Cloudflare/D1.

Requirements:
- repeated failed attempts must be slowed/temporarily rejected
- avoid storing plaintext passwords
- avoid revealing whether an account exists
- successful login clears/reduces relevant failure state
- do not lock a user permanently

The exact rate-limit storage mechanism may be implemented with D1 first if no dedicated Cloudflare rate-limit binding is already configured.

## 3. Schema

Forward-only migration should add the minimum fields/tables needed, expected to include:

- users.password_algo or equivalent version marker
- users.password_iterations if needed
- users.session_version INTEGER NOT NULL DEFAULT 1

If login throttling uses D1, add a dedicated short-lived auth attempt/rate-limit table.

Migration must preserve all existing users.

## 4. API behavior

Existing actions must remain compatible:
- login
- me
- changePassword
- adminResetPassword

Add:
- logoutAll

Rules:
- login returns a V2 token
- me rejects revoked/expired tokens
- changePassword verifies old password, writes V2 hash, increments session_version, and should return a fresh token so the current device may continue
- adminResetPassword writes V2 hash and increments target session_version
- logoutAll increments current user session_version and returns a fresh token only if product behavior explicitly keeps current device logged in; otherwise require re-login

## 5. Security guardrails

- never include password/hash/salt in public API responses
- never log password bodies
- use constant-time comparison where practical
- token signing secret remains Worker secret only
- authorization still reads current user role/mappings from D1, not claims embedded in the token
- tenant/admin isolation rules must remain unchanged

## 6. Rollout plan

1. Add forward-only migration.
2. Update Worker password verification to understand legacy + V2.
3. Add rehash-on-successful-login.
4. Add session_version validation and new token format.
5. Update password change/reset invalidation.
6. Add login throttling.
7. Update frontend password policy/error text.
8. Add logout-all UI if appropriate.
9. Test against existing admin + tenant accounts without resetting passwords.
10. Deploy with [PROD-DEPLOY].
11. Verify existing login, tenant login, password change, reset, revoked old token, scoped admin access and tenant isolation.

## 7. Acceptance tests

Required before release:
- existing legacy account logs in successfully
- successful legacy login upgrades stored hash format
- V2 account logs in successfully
- wrong password returns generic invalid_credentials
- repeated failed login attempts trigger throttling
- old token stops working after own password change
- old token stops working after admin reset
- logout-all revokes old token
- tenant cannot access admin endpoints
- admin scope remains unchanged
- superadmin remains separate from property access
- no secret/hash/password appears in logs or API responses

## 8. Non-goals

Not part of V2:
- OAuth/social login
- email password reset
- passkeys
- MFA
- device management UI
- refresh-token architecture

Those may be added later if product needs justify them.


## 9. Production verification

Completed 2026-09-21:
- migration 0004 applied successfully
- existing pre-V2 sessions invalidated at rollout
- production Worker deployed successfully
- legacy SHA-256 login upgraded to PBKDF2-SHA-256 on successful login
- password change revoked the old token and returned a fresh token
- logoutAll revoked the active token
- re-login with the changed password succeeded
- temporary E2E account was removed after verification
- temporary migration/E2E workflows were removed after successful use
