# DelightApp — System Flows

> ภาพรวม workflow ของ production system  
> อัปเดตตาม production ณ 2026-09-28

## 1. Architecture

```text
Browser / PWA
   |
   v
Cloudflare Worker: delightapp
   |
   +-- static frontend: /หอพัก
   |
   +-- /api -> src/d1-api.js -> Cloudflare D1: delightapp-db
```

D1 เป็น production source of truth

## 2. Authentication

```text
Login -> Worker validates credentials -> session/token
      -> admin: getAdminScoped
      -> tenant: getTenantHome
      -> authorized UI
```

Frontend filtering ไม่ใช่ authorization; backend เป็นผู้ตัดสินสิทธิ์

## 3. Property Access

```text
Admin User -> property_admins -> owner/admin -> Property
Property -> Rooms -> Tenants / Bills / Meter Readings / Receipts / Deposits / Layout
```

## 4. Room Lifecycle

```text
Create Room -> vacant
vacant -> occupied manually OR add tenant
occupied -> tenant details may be incomplete
occupied -> vacant only if no tenant record is attached
```

Bulk room edit รองรับ floor, room type, rent, deposit

## 5. Tenant Flow

```text
Room -> Add Tenant / Add Tenant Details
     -> tenant.room_id = room.id
     -> room considered occupied

Tenant Update -> edit identity/contact/move-in
Move/Delete Tenant -> update relation -> room may become vacant
```

กรณี occupied แต่รายละเอียด tenant ยังไม่มี ระบบแสดง “มีผู้เช่า — ยังไม่มีรายละเอียด”

## 6. Bill Creation

```text
Billing -> สร้างบิล -> Select month -> Check existing bills
if any bill exists -> warning -> stop
if none -> occupied rooms -> create one bill per room
```

bill room/month ต้อง unique

## 7. Meter Reading

### Normal

```text
Bill exists -> จดมิเตอร์ทั้งหมด
-> previous reading -> current reading
-> validate current >= previous
-> calculate units/cost
-> update bill + meter history
```

### Old baseline correction

```text
Edit old meter -> edit previous reading -> choose correction date
-> validate -> verify no active receipt
-> update bill baseline/totals
-> update meter history
-> audit old -> new + date + actor
```

## 8. Meter History

```text
Search room/month
Filter: all / water / electric
Sort: latest / units desc / units asc
```

## 9. Bill Selection and Bulk Actions

```text
Select bills -> system recalculates action eligibility
```

Move Month: selected bills -> no active receipt -> choose target -> validate -> move

Print Invoice: selected bills >= 1 -> batch print

Receive Payment:

```text
selected bills
-> every bill unpaid
-> no active receipt
-> choose date + note
-> batchCreateReceipts
-> D1 batch: insert receipts + set bills paid
-> audit
```

## 10. Receipt Lifecycle

```text
Unpaid Bill -> Receive Payment -> active receipt -> bill paid -> bill locked
```

Active receipt lock blocks bill update/delete/move, old meter correction และ second active receipt

Correction:

```text
Paid Bill + Active Receipt
-> Owner Void with reason
-> receipt void + bill unpaid + audit
-> correct bill
-> issue new receipt
```

Receipt number เดิมไม่ reuse

## 11. Deposit Flow

```text
Tenant / Room -> record deposit -> server document number -> print/export -> history retained
```

## 12. Audit Flow

```text
Business action -> audit_logs(actor, action, object, target IDs, property_id, safe note, timestamp)
Owner -> property-scoped Audit Viewer
```

Platform/account/access events ใช้ Platform Audit สำหรับ Superadmin และห้ามใส่ secret/password/token ใน audit note

## 13. Error Flow

```text
API / Network / JavaScript error
-> reportAppError
-> Global Error Popup(context, reason, time, page)
-> Copy -> send to admin
```

Expected user errors เช่น login ผิด ไม่ควรถูกยกระดับเป็น system error popup

## 14. Offline Flow

```text
Network unavailable -> offline read-only -> cached reads allowed -> writes blocked -> D1 authoritative
```

## 15. Production Deployment

```text
Validated code -> main -> release commit [PROD-DEPLOY]
-> GitHub Actions: validation -> D1 sanity -> deploy -> smoke test
-> production
```

## 16. Data Integrity Rules

- room number unique ภายใน property
- bill room/month unique
- invoice number unique
- active receipt ต่อ bill สูงสุด 1
- receipt number unique
- deposit receipt number unique
- one logical room layout per room
- historical VAT snapshot preserved
- active receipt locks mutable bill state
- property authorization enforced server-side
- audit history preserved

## 17. Source Documents

- PROJECT.md
- ACCESS-CONTROL-V1.md
- FINANCIAL-DATA-INTEGRITY-V1.md
- PAID-BILL-RECEIPT-VOID-V1.md
- TENANT-ACCOUNT-LIFECYCLE-V1.md
- AUDIT-LOG-VIEWER-V1.md
- OFFLINE-READONLY-V1.md
- D1-MIGRATION.md