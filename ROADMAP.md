# DelightApp — Product Roadmap

> Future features and product ideas.
> This document describes planned/desired capabilities, not current production behavior.
>
> Current production state: see `PROJECT.md`.

## Status legend

- `IDEA` — แนวคิดที่ต้องการเก็บไว้ก่อน
- `PLANNED` — ตกลงว่าจะทำ แต่ยังไม่เริ่ม
- `IN PROGRESS` — กำลังพัฒนา
- `DONE` — ขึ้น production แล้ว
- `HOLD` — พักไว้ก่อน

---

## 0. Multi-Tenant Access Control Foundation

**Status:** DONE — Phase A/B/C/D/E complete

เป้าหมาย: แยกข้อมูลของแต่ละผู้ดูแลออกจากกันอย่างปลอดภัย และรองรับหลาย admin ต่อ property

หลักการ:

- role หลัก: admin / tenant
- admin 1 คนดูแลหลาย property ได้
- property 1 แห่งมีหลาย admin ได้
- ใช้ `property_admins` เป็น permission mapping
- tenant account แยก mapping ผ่าน `tenant_accounts`
- backend ต้อง enforce access ทุก read/write
- whole-table writes เปลี่ยนเป็น row-level CRUD แล้ว
- strict admin property isolation เปิดใช้งานและผ่าน production verification แล้ว
- tenant foundation แยก tenant UI ออกจาก admin UI และใช้ `getTenantHome` เท่านั้น

รายละเอียด: `ACCESS-CONTROL-V1.md`

Progress:

- Phase A schema/mapping: DONE
- Phase B scoped reads: DONE
- Phase C row-level CRUD: DONE
- Phase D strict property isolation: DONE
- Phase E tenant foundation: DONE

---

## 1. Payment Slip Verification

**Status:** IDEA

เป้าหมาย: ตรวจสลิปก่อนบันทึกการชำระเงิน เพื่อลดสลิปปลอม สลิปแก้ไข และการส่งสลิปซ้ำ

ความสามารถที่ต้องการ:

- ตรวจยอดเงินจากสลิป
- ตรวจบัญชี/ผู้รับปลายทาง
- ตรวจวันเวลาและเลขอ้างอิงธุรกรรม
- ตรวจสลิปซ้ำ
- ป้องกันการใช้สลิปเดิมกับหลายบิล
- ตรวจความผิดปกติของสลิปที่ถูกแก้ไข/ตกแต่ง
- ผูกผลตรวจเข้ากับ bill / receipt / tenant
- เก็บสถานะ เช่น verified / rejected / manual review
- แจ้งเหตุผลเมื่อระบบไม่ผ่านการตรวจ

หมายเหตุ:

- ควรตรวจผ่านบริการ/API ของธนาคารหรือผู้ให้บริการที่เชื่อถือได้เมื่อเป็นไปได้
- ไม่ควรพึ่ง OCR หรือภาพเพียงอย่างเดียวเพื่อยืนยันว่ามีเงินจริง
- ต้องมี duplicate fingerprint/reference เพื่อป้องกันส่งสลิปซ้ำ

---

## 2. LINE Billing & Receipt Delivery

**Status:** IDEA

เป้าหมาย: ส่งบิลและใบเสร็จให้ผู้เช่าผ่าน LINE โดยไม่ต้องส่งด้วยมือ

ความสามารถที่ต้องการ:

- ส่งบิลเข้า LINE ผู้เช่า
- ส่งใบเสร็จหลังชำระเงิน
- แนบยอดที่ต้องชำระ / วันครบกำหนด / เลขห้อง / เดือน
- ปุ่มคัดลอกเลขบัญชี
- ปุ่มคัดลอกยอดเงิน
- ปุ่มเปิดหน้ารายละเอียดบิล
- รองรับ QR Payment ในอนาคต
- บันทึกสถานะส่งสำเร็จ/ไม่สำเร็จ
- รองรับการส่งเตือนบิลค้างชำระ

---

## 3. Online Room Booking + Deposit Slip

**Status:** IDEA

เป้าหมาย: ให้ผู้สนใจจองห้องออนไลน์ได้เองก่อนเข้าพัก

ความสามารถที่ต้องการ:

- หน้า public แสดงห้องว่าง
- เลือกห้อง / ประเภทห้อง
- กรอกชื่อ เบอร์โทร และข้อมูลผู้จอง
- เลือกวันเข้าอยู่
- แสดงเงินมัดจำ/ค่าจอง
- แนบสลิปมัดจำ
- เชื่อมกับระบบตรวจสลิป
- สถานะ booking เช่น pending / confirmed / rejected / expired
- ป้องกันห้องเดียวถูกจองซ้อน
- เมื่ออนุมัติ สามารถแปลง booking -> tenant ได้

---

## 4. Online Contract / E-Signature

**Status:** IDEA

เป้าหมาย: ทำสัญญาเช่าและเซ็นออนไลน์ โดยไม่ต้องพิมพ์เอกสารหรือนัดพบ

ความสามารถที่ต้องการ:

- สร้างสัญญาจากข้อมูล property / room / tenant
- template สัญญา
- กรอกข้อมูลอัตโนมัติ
- ผู้เช่าเปิดอ่านผ่านลิงก์
- เซ็นชื่อออนไลน์
- เจ้าของ/ผู้ดูแลเซ็น
- บันทึกวันเวลาและเวอร์ชันเอกสาร
- export/download PDF
- เก็บสัญญาที่เซ็นแล้วกับ tenant
- audit trail ของการเซ็น/แก้ไข

---

## 5. Thai ID Card OCR / Auto-fill

**Status:** IDEA

เป้าหมาย: ลดเวลาการกรอกข้อมูลผู้เช่าด้วยการถ่ายบัตรประชาชน

ความสามารถที่ต้องการ:

- ถ่าย/อัปโหลดภาพบัตรประชาชน
- OCR ชื่อ-นามสกุล
- เลขบัตรประชาชน
- วันเกิด (ถ้าต้องใช้)
- ที่อยู่
- ตรวจรูปแบบเลขบัตร
- ให้ผู้ใช้ตรวจทานก่อนบันทึก
- กรอกข้อมูล tenant ให้อัตโนมัติ

Privacy / Security:

- ข้อมูลบัตรประชาชนเป็นข้อมูลส่วนบุคคลสำคัญ
- ต้องกำหนดว่าจำเป็นต้องเก็บภาพต้นฉบับหรือไม่
- ถ้าไม่จำเป็น ควรประมวลผลแล้วลบภาพ
- ต้องจำกัดสิทธิ์การเข้าถึงและมี audit log

---

## 6. Tenant Self-Service App / Portal

**Status:** IDEA

เป้าหมาย: ให้ผู้เช่าทำรายการต่าง ๆ จากมือถือของตัวเองโดยไม่ต้องติดต่อหน้าเคาน์เตอร์

### 6.1 Repair Requests / แจ้งซ่อม

- เลือกห้องอัตโนมัติจากบัญชีผู้เช่า
- เลือกประเภทปัญหา
- รายละเอียดปัญหา
- แนบรูป
- ระดับความเร่งด่วน
- สถานะ: received / in progress / completed
- ประวัติการแจ้งซ่อม
- แจ้งเตือนเมื่อสถานะเปลี่ยน

### 6.2 Parcel Notifications / พัสดุ

- ผู้ดูแลบันทึกว่ามีพัสดุมาถึง
- แจ้งเตือนผู้เช่า
- แสดงผู้ส่ง/บริษัทขนส่ง/หมายเหตุ
- สถานะ waiting / picked up
- บันทึกเวลารับของ

### 6.3 News & Announcements / ข่าวสารและประกาศ

- เจ้าของ/ผู้ดูแลสร้างประกาศ
- ส่งให้ทุกห้อง หรือเลือก property/floor/room
- ตั้งวันเริ่ม/หมดอายุ
- pin ประกาศสำคัญ
- รองรับข้อความและรูป
- ผู้เช่าอ่านจากแอปของตัวเอง

---

## Suggested dependency order

ลำดับนี้เป็นข้อเสนอเพื่อให้ระบบต่อยอดง่ายและลดงานซ้ำ:

1. **Tenant account / tenant portal foundation**
2. **LINE integration**
3. **Online booking + deposit**
4. **Slip verification**
5. **Repair / parcel / announcements**
6. **Online contract + e-signature**
7. **ID card OCR / auto-fill**

เหตุผล:

- หลายฟีเจอร์ต้องรู้ก่อนว่า “ผู้เช่าคนนี้คือใคร / อยู่ห้องไหน”
- LINE, booking, contract และแจ้งซ่อมควรใช้ tenant identity และ notification layer ชุดเดียวกัน
- slip verification ควรเป็น service กลาง ใช้ได้ทั้งค่าจอง มัดจำ และชำระบิล
- OCR และ e-signature สามารถเพิ่มภายหลังโดยไม่บล็อกฟีเจอร์หลักอื่น

---

## Shared platform capabilities likely needed

ฟีเจอร์ด้านบนมี dependency ร่วมกันหลายส่วน ซึ่งควรออกแบบเป็นระบบกลางแทนการทำซ้ำ:

### Tenant identity

- tenant login/account
- mapping account -> tenant -> room -> property
- role/permission ระหว่าง owner/admin/tenant

### Notifications

- LINE
- in-app notifications
- future email/SMS if needed

### File storage

รองรับ:

- slip images
- repair photos
- ID card images (ถ้าจำเป็นต้องเก็บ)
- signed contracts
- QR/payment files

ควรใช้ object storage เช่น Cloudflare R2 แยกจาก D1 metadata.

### Audit trail

บันทึกเหตุการณ์สำคัญ เช่น:

- payment verification
- contract signing
- admin changes
- booking approval
- repair status changes

### Public / tenant-facing API

ควรแยก permission ชัดเจนระหว่าง:

- public
- tenant
- admin

---

## Not yet committed

รายการในเอกสารนี้ยังเป็นแนวคิด/แผนอนาคต จนกว่าจะเปลี่ยนสถานะจาก `IDEA` เป็น `PLANNED`.

เมื่อเริ่มฟีเจอร์ใด ควรสร้างเอกสารรายละเอียดของฟีเจอร์นั้นแยกต่างหากก่อนลงมือ เช่น:

- `PAYMENT-VERIFICATION.md`
- `LINE-NOTIFICATIONS.md`
- `TENANT-PORTAL.md`
- `BOOKING-SYSTEM.md`
- `E-CONTRACT.md`
