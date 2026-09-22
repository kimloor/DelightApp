# DelightApp — Payment Slip Verification V1

> Status: PLANNED — Phase 1 design/provider decision
> Started: 2026-09-22
> Goal: verify Thai bank-transfer slips before recording payment/receipt, while preventing duplicate-slip reuse and keeping the integration replaceable.

## 1. Product decision

Use a provider-adapter architecture.

Initial pilot provider:
- EasySlip API v2

Fallback candidates:
- SlipOK
- Slip2Go

DelightApp business logic must not depend directly on one provider's response shape.

Provider API keys remain Worker secrets only.

## 2. Why EasySlip v2 for the pilot

Current public documentation supports:
- bank-slip verification by QR payload
- image upload
- Base64 image
- image URL
- transaction reference (`transRef`)
- amount data
- sender/receiver bank/account data
- duplicate checking
- amount matching
- receiver-account matching

Current public API pricing includes a small Start tier suitable for pilot use.

This is an engineering choice for the first adapter, not a permanent vendor lock.

## 3. Current alternative providers

### SlipOK

Strengths:
- QR/image/file input
- duplicate-slip detection
- amount checking
- receiver checking
- free entry package currently advertised

Considerations:
- current public API documentation is version 1.8
- integration uses SlipOK branch/account configuration

### Slip2Go

Strengths:
- low-cost entry packages
- Verify Slip API included in published pricing
- useful fallback if commercial cost becomes the primary factor

Before switching/adding a provider, verify:
- exact API response contract
- duplicate semantics
- receiver/account matching
- rate limits
- retention/privacy policy
- SLA/support

## 4. V1 payment flow

Initial V1 is for existing admin billing flow.

1. Admin opens an unpaid bill.
2. Select "ตรวจสลิป / รับชำระ".
3. Upload slip image.
4. Browser attempts to read QR payload locally when possible.
5. Frontend sends QR payload to DelightApp Worker.
6. Worker calls configured verification provider.
7. Worker normalizes provider response.
8. DelightApp checks:
   - provider verified the transaction
   - transaction reference has not been used before
   - amount equals bill total
   - receiver matches an allowed payment account for the property
   - transfer timestamp is plausible
9. Save verification result.
10. If fully verified, allow/perform receipt issuance through the existing receipt lifecycle.
11. Link verification -> bill -> receipt.
12. Audit the verification and acceptance/rejection.

Tenant self-upload is not part of the first rollout. It can reuse the same service later.

## 5. Verification states

`payment_verifications.status`:

- pending
- verified
- rejected
- manual_review
- provider_error

Suggested reason codes:

- duplicate_transaction
- amount_mismatch
- receiver_mismatch
- unsupported_slip
- invalid_qr
- provider_rejected
- transfer_too_old
- bill_already_paid
- provider_unavailable
- manual_review_required

## 6. Data model

### payment_verifications

Expected fields:

- id
- property_id
- room_id
- bill_id
- provider
- provider_transaction_ref
- provider_request_ref / job_ref if available
- amount
- currency
- transferred_at
- sender_bank
- sender_name (optional/minimized)
- receiver_bank
- receiver_name
- receiver_account_ref (masked/normalized only when practical)
- status
- reason_code
- provider_result_code
- created_by_user_id
- created_at
- verified_at
- receipt_id
- consumed_at

Critical constraints:

- UNIQUE(provider, provider_transaction_ref) when transaction ref is present
- one successful verification can create/link at most one receipt
- property/bill relationship must be server-validated

Do not store raw provider response indefinitely unless required for dispute/debugging.

## 7. Property payment accounts

Add a separate property-scoped payment-account configuration instead of relying only on the QR image currently stored in property settings.

Expected structure:

### property_payment_accounts

- id
- property_id
- provider
- provider_account_ref / provider branch mapping if needed
- bank_code
- account_name
- account_identifier or provider-safe reference
- enabled
- created_at
- updated_at

Sensitive account identifiers should be minimized and never exposed across properties.

## 8. Provider adapter

Worker interface concept:

`verifySlip(input, expected)`

Normalized input:
- qrPayload OR image
- expectedAmount
- expectedReceiver
- reference / bill ID

Normalized output:
- ok
- transactionRef
- amount
- transferredAt
- sender
- receiver
- duplicate
- providerCode
- rawStatus

Provider-specific URLs/keys/error codes remain inside the adapter.

## 9. Duplicate strategy

Primary duplicate key:
- provider transaction reference / bank transaction reference

Secondary signals:
- provider duplicate detection
- optional local payload hash
- optional image hash only as an auxiliary signal

Do not rely on image hash alone because screenshots/crops/re-encoding can change the file while representing the same transaction.

## 10. Privacy / file handling

Preferred V1:
- decode QR payload locally in browser where possible
- send payload rather than storing the slip image
- do not retain the original slip image by default

Fallback:
- if provider requires the image because QR decoding fails, transmit it for verification
- do not persist it in R2 unless a later dispute/audit requirement explicitly justifies storage

Provider API keys:
- Cloudflare Worker secrets only
- never frontend
- never repository
- never D1 plaintext configuration

## 11. Failure behavior

Provider unavailable:
- do not mark bill paid
- do not issue receipt automatically
- store provider_error only if a verification row was already created
- allow retry

Mismatch:
- show exact safe reason (amount / receiver / duplicate)
- do not expose unnecessary sender private data

Manual override:
- not included until rules/audit requirements are defined
- if later added, Owner-only plus mandatory reason and audit log

## 12. Relationship with current S3 accounting lifecycle

Payment verification does not replace receipt rules.

Verified payment acceptance must use the existing accounting protections:
- active receipt locks the bill
- void workflow remains the correction mechanism
- historical receipt snapshots remain immutable
- duplicate receipt rules remain enforced

## 13. Rollout phases

### Phase 1 — Foundation
- provider decision
- adapter interface
- schema design
- property payment-account model
- secrets/configuration design

### Phase 2 — Backend
- migrations
- provider adapter
- verification endpoint
- normalized response/error handling
- duplicate constraints
- audit logging

### Phase 3 — Admin UI
- bill payment/slip modal
- QR/image input
- verified/rejected/manual-review presentation
- receipt integration

### Phase 4 — Production pilot
- one property first
- real low-volume verification
- monitor false reject/provider errors
- confirm duplicate protection
- then enable second property

### Phase 5 — Tenant self-service
- later, reuse the same verification service from tenant portal

## 14. Acceptance criteria

Before production:
- fake/invalid slip does not create receipt
- reused transaction reference is rejected
- wrong amount rejected
- wrong receiver rejected
- correct slip verifies and can create exactly one receipt
- provider timeout does not mark bill paid
- cross-property account/bill verification denied
- API key never reaches browser/log/audit note
- void receipt does not delete verification history
- all verification/acceptance actions are auditable

## 15. Provider research snapshot — 2026-09-22

Public sources reviewed:
- EasySlip API v2 documentation and API pricing
- SlipOK API documentation and current pricing
- Slip2Go current Verify Slip API pricing

Commercial terms and provider behavior should be rechecked before paid production rollout because pricing/features can change.
