# DelightApp — คู่มือผู้ดูแลระบบ (ADMIN GUIDE)

> สำหรับ Property Owner, Property Admin และ Platform Superadmin  
> อัปเดตตาม production ณ 2026-09-28

## 1. โครงสร้างสิทธิ์

ระดับบัญชี: admin, tenant

ระดับ platform: normal, superadmin

ระดับ property ใน property_admins: owner, admin

## 2. Property Owner

Owner จัดการข้อมูล property ได้เต็มรูปแบบ และมีสิทธิ์เพิ่มในงานอ่อนไหว เช่น ห้อง ผู้เช่า บิล มิเตอร์ ใบเสร็จ มัดจำ ตั้งค่า property/VAT/ผังห้อง จัดการสิทธิ์ admin ดู Property Audit Log และ Void ใบเสร็จ

กฎสำคัญ

- ทุก property ต้องมี Owner อย่างน้อย 1 คน
- การเปลี่ยนสิทธิ์ต้องผ่าน backend authorization
- การ Void เอกสารการเงินต้องมีเหตุผลและ Audit Log

## 3. Property Admin

Admin ทำงาน operational ได้ เช่น ห้อง ผู้เช่า บิล มิเตอร์ รับชำระ ใบเสร็จ มัดจำ และการตั้งค่าที่อนุญาต

ข้อจำกัด

- ไม่สามารถ Void receipt หากสิทธิ์นั้นสงวนให้ Owner
- ไม่สามารถเปลี่ยน/ถอด Owner โดยพลการ
- ไม่สามารถเปิด Owner Audit Viewer

## 4. Superadmin

Superadmin ใช้ดูแล platform ไม่ใช่เจ้าของ business data ของทุก property โดยอัตโนมัติ

งานหลัก เช่น ดูโครงสร้าง account/property/access ช่วยกู้ mapping สิทธิ์ จัดการ platform account และดู Platform Audit

Property business-data access ยังคงอิง property_admins

## 5. การจัดการบัญชีและสิทธิ์

การสร้างบัญชี admin ไม่ได้ grant property access โดยอัตโนมัติ ต้องกำหนด mapping ใน property_admins

ก่อนถอด Owner ต้องตรวจว่ามี Owner คนอื่นแล้ว หากไม่มีต้องโอนหรือเพิ่ม Owner ใหม่ก่อน

Tenant account ผูกผ่าน tenant_accounts และอ่านได้เฉพาะข้อมูลของ tenant/room ที่ตนได้รับสิทธิ์

## 6. Source of Truth

Cloudflare D1 คือ production source of truth

Google Sheets / Apps Script เป็น rollback/reference จากระบบเดิม และไม่ควรรับ product logic ใหม่

## 7. กฎข้อมูลการเงิน

- bill room/month ต้องไม่ซ้ำ
- document number สร้าง server-side
- historical VAT snapshot ต้องคงเดิม
- active receipt ต่อ bill ได้สูงสุด 1 ใบ
- เมื่อมี active receipt จะล็อก bill
- หากต้องแก้ ให้ Void → แก้ bill → ออก receipt ใหม่
- receipt number ห้าม reuse

รับชำระหลายห้องกำหนดให้ทุก bill ต้อง unpaid และไม่มี active receipt โดย backend ใช้ D1 batch เพื่อให้ชุดรับชำระสอดคล้องกัน

## 8. มิเตอร์ย้อนหลัง

ใช้ “แก้มิเตอร์เก่า” เมื่อ baseline เดิมผิด ต้องระบุวันที่แก้ไขย้อนหลัง

ระบบจะ sync previous reading, units, cost, bill total และ meter history พร้อมเขียน Audit Log ค่าเดิม → ค่าใหม่

ห้ามแก้หาก bill มี active receipt

## 9. Audit Log

Property Audit: เฉพาะ Owner และจำกัดเฉพาะ property ที่เป็น Owner

Platform Audit: สำหรับ Superadmin และเน้น account/access/platform events

ห้ามบันทึก password, hash, salt, token หรือ secret ลง audit note

## 10. Error Handling

Global Error Popup แสดง context, reason, time และ page พร้อมปุ่ม Copy

เมื่อ user ส่ง error มา ให้ตรวจ action/context, เวลา, สิ่งที่ user ทำ, production commit/deploy, Audit Log และ D1 state ก่อนแก้ซ้ำ

ห้ามขอ password จาก user

## 11. Offline / Network

Offline mode เป็น read-only: อ่าน cache ที่อนุญาตได้ แต่ write ต้องถูก block และ D1 ยังคงเป็น authoritative source

## 12. แนวทางแก้ข้อมูลผิด

1. ระบุ property/room/month/record
2. ตรวจ downstream document เช่น receipt
3. ตรวจ Audit Log
4. ใช้ correction flow ที่ระบบรองรับ
5. หลีกเลี่ยงแก้ D1 ตรงถ้ามี UI/API flow
6. หากต้องแก้ DB ตรง ต้องมีหลักฐานก่อน/หลังและเข้าใจ relation

ตัวอย่าง: baseline มิเตอร์ผิด → แก้มิเตอร์เก่า; bill ที่มี receipt ผิด → Void ก่อน; occupied แต่ไม่มีรายละเอียดผู้เช่า → เพิ่มรายละเอียด tenant

## 13. Backup / Recovery

- D1 เป็น production authority
- migrations เป็น forward-only
- ก่อน migration ควรมี backup/export, integrity check, validation และ rollback plan
- ห้าม replay migration เก่าโดยไม่ตรวจ schema state

## 14. Production Incident Checklist

1. ระบุ property / ห้อง / เดือน
2. ขอข้อความ Global Error Popup
3. ตรวจ production commit
4. ตรวจ GitHub Actions deploy
5. ตรวจ Audit Log
6. ตรวจ active receipt lock
7. ตรวจ D1 state
8. แก้ผ่าน correction flow
9. ยืนยันผลหลังแก้
10. บันทึกเหตุการณ์สำคัญ

## 15. เอกสารอ้างอิง

- PROJECT.md
- ACCESS-CONTROL-V1.md
- AUTH-SESSION-HARDENING-V2.md
- FINANCIAL-DATA-INTEGRITY-V1.md
- PAID-BILL-RECEIPT-VOID-V1.md
- AUDIT-LOG-VIEWER-V1.md
- OFFLINE-READONLY-V1.md
- TENANT-ACCOUNT-LIFECYCLE-V1.md