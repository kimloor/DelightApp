# DelightApp — Import / Export V1

> Status: IMPLEMENTED ON FEATURE BRANCH — NOT DEPLOYED
> Branch: `feat/import-export-v1`

## Goal

Centralize document export and add a safe legacy PDF bill import flow:

`เลือกหอพัก -> Upload PDF -> Preview -> Validate -> Confirm -> Save -> Display`

Upload/preview must never write financial rows. Database writes happen only after explicit confirmation.

## Import source contract

Current V1 parser targets the approved legacy bill PDF layout used by the provided sample.

One PDF page = one bill.

Parsed source fields include:
- room number
- legacy document number
- bill date
- billing month/year
- room-rent net amount
- furniture net amount
- water/electric meter old/new readings, dates, units, rates, charges
- VAT subtotal
- VAT amount
- final legacy total
- source printed timestamp

## Legacy rent transformation

The source document splits the room charge into:
- room rent (non-VAT portion)
- furniture net
- VAT on furniture

DelightApp stores the operational room charge as one value.

```
furniture_vat   = round2(furniture_net * vat_rate)
furniture_gross = furniture_net + furniture_vat

bills.rent = room_rent_net + furniture_gross
```

Example room 101:

```
2,700.00 + 747.66 + 52.34 = 3,500.00
```

Example room 102:

```
2,200.00 + 747.66 + 52.34 = 3,000.00
```

Water and electricity are imported from the source amounts and meter snapshots without the rent transformation.

## Legacy VAT and rounding

Legacy VAT is validated against the combined taxable base:

```
round2((furniture_net + water_charge + electric_charge) * vat_rate)
```

The source subtotal, VAT amount, and final total are preserved as historical snapshots.

The legacy final displayed total is whole-baht rounded. Validation accepts the source total when:

```
round(source_vat_subtotal + source_vat_amount) == source_total
```

Imported bills use:

`calculation_mode = source_snapshot`

Normal DelightApp VAT recalculation must not overwrite these imported historical totals.

## Database

Migration: `migrations/0009_import_export_v1.sql`

Adds to `bills`:
- `bill_date`
- `source_document_no`
- `calculation_mode`

Adds:
- `import_batches`
- `bill_import_rows`

`bill_import_rows` retains the source breakdown so the transformed `bills.rent` remains auditable.

Meter history continues to use the existing `meter_readings` table.

## Duplicate protection

Preview/backend checks include:
- room exists inside selected property
- one bill per room/month
- legacy source document already imported
- previously confirmed same source-file hash

Existing DelightApp invoice numbering is preserved. The legacy number is stored separately as source metadata / tax invoice reference.

## Import statuses

- `ready` — safe to select and confirm
- `review` — parsed but calculation consistency needs review
- `duplicate` — existing room/month or source document
- `error` — required data missing or room not found
- `imported` — committed to database

Only `ready` rows are selectable in V1.

## Export hub

Sidebar now contains `Import / Export` after `รายงานสรุป`.

PDF export entry points are centralized there for:
- selected invoices by month
- summary report: monthly
- summary report: water range
- summary report: electricity range
- receipts
- deposit receipts

Printing remains available in the operational screens.

## Historical payment status

The supplied legacy document title combines invoice/receipt wording and does not prove payment status.

Therefore V1 imports confirmed legacy bills as `unpaid` unless a separate authoritative payment-status source is added later.

## Validation performed

Static syntax validation passed for:
- `หอพัก/import-export.js`
- main inline frontend script
- `หอพัก/service-worker.js`
- `src/d1-api.js`

Parser calculations were checked against representative source pages including rooms 101, 102, 307 and 506.

No production migration or production deployment is part of this branch yet.
