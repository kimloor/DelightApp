# DelightApp — Frontend Security / XSS Hardening V1

> Status: DONE — production verified 2026-09-22
> Parent: STABILIZATION.md / S5
> Goal: prevent stored/reflected HTML injection from business/user-controlled data rendered by the admin and tenant UI.

## 1. Scope

Audit and harden `หอพัก/index.html` where data is inserted into HTML strings or `innerHTML`.

Treat these as untrusted display data:
- property name/address/notes/legal name/tax ID
- room number/floor/type
- tenant name/phone
- bill invoice/tax-invoice identifiers
- deposit/receipt numbers and notes
- account display names/usernames
- any future server-returned text

Numeric values formatted by controlled helpers and fixed application labels are not HTML injection surfaces.

## 2. Rules

- escape untrusted text before HTML interpolation
- escape attribute values before placing them in value/data/title attributes
- do not escape intentionally generated application HTML fragments
- prefer textContent when inserting plain text after DOM creation
- backend authorization remains unchanged
- no business data is modified in D1; escaping is presentation-only

## 3. Special surfaces

### Property notes
Property notes may contain line breaks but are plain text, not trusted HTML.

### QR/image URLs
Do not allow arbitrary HTML through image-related values.
Existing image data should remain functional; dangerous URL schemes must not become executable markup.

### Printed documents / PDF render
Invoice, receipt, deposit and report HTML must use the same escaping rules as on-screen UI.

## 4. Acceptance tests

- tenant/property/room strings containing < > " ' & render as text
- script/img-onerror payloads do not execute
- attributes cannot be broken by quotes
- printed invoice/receipt/deposit shows literal text safely
- tenant portal remains functional
- admin CRUD/rendering remains functional
- no authorization/session behavior changes
- frontend JavaScript syntax passes
- production smoke test passes

## 5. Non-goals

- full frontend modularization
- CSP redesign
- moving auth token storage in this phase
- replacing all innerHTML with DOM APIs

Those may be addressed separately.


## 6. Production verification

Completed 2026-09-22:
- frontend JavaScript syntax validation passed
- Cloudflare pre-deploy validation passed
- production deploy completed at 100% traffic
- production smoke test passed
- admin/tenant authorization and D1 schema were unchanged
