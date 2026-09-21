/**
 * สมุดหอพัก — Google Sheets backend
 * (v11: เพิ่มระบบ "ผู้ใช้งาน/login" — ให้หลายคน (หลายเจ้าของหอ) ใช้ Web App ลิงก์เดียวกันได้
 *       โดยแต่ละคนเห็นเฉพาะอพาร์ทเมนท์ของตัวเอง ไม่ทะลุข้ามบัญชี
 *  v12: เพิ่ม action 'register' — เปิดให้ใครก็ตามที่มีลิงก์เว็บนี้สมัครบัญชีใหม่เองได้จากหน้าเว็บ
 *       โดยตรง ไม่ต้องรอให้แอดมินสร้างให้ผ่าน editor แล้ว (ใช้กติกาเดียวกับ ADMIN_createUser
 *       ทั้งหมด: username ห้ามซ้ำ, รหัสผ่านอย่างน้อย 4 ตัวอักษร) — ข้อควรรู้: เพราะลิงก์ /exec
 *       ฝังอยู่ใน index.html แบบเปิดเผยอยู่แล้ว การเปิด register หมายถึงใครก็ตามที่มีลิงก์เว็บแอป
 *       จะสมัครบัญชีของตัวเองได้ (แต่จะเห็นเฉพาะข้อมูลของบัญชีตัวเองเท่านั้น ไม่เห็นของคนอื่น)
 *  v13: เพิ่ม 2 ชีตใหม่ —
 *       (1) "ใบเสร็จ" — บันทึกใบเสร็จรับเงินที่ออกตอนกดปุ่ม "ออกใบเสร็จรับเงิน" ในหน้าบิล
 *           (กดแล้วปรับสถานะบิลจาก "ค้างชำระ" เป็น "ชำระแล้ว" ให้อัตโนมัติด้วย)
 *       (2) "ตำแหน่งผัง" — เก็บตำแหน่ง x/y ของห้องในมุมมอง "ผังอิสระ" ให้ซิงก์ข้ามอุปกรณ์ได้
 *           (เดิมเก็บใน localStorage เครื่องเดียวเท่านั้น หายไปถ้าเปลี่ยนเครื่อง/ล้างเบราว์เซอร์)
 *       เพิ่มระบบสำรองข้อมูลอัตโนมัติ (ดูฟังก์ชัน SETUP_scheduledBackup ท้ายไฟล์) — คัดลอกทั้ง
 *       สเปรดชีตไปเก็บในโฟลเดอร์ Backups ทุก 15 วัน ต้องรัน SETUP_scheduledBackup() หนึ่งครั้งจาก
 *       Apps Script editor เพื่อเริ่มใช้งาน (เหมือนขั้นตอน ADMIN_createUser ตอนติดตั้งครั้งแรก)
 *  v14: เพิ่มระบบ VAT — เปิด/ปิดได้ต่ออพาร์ทเมนท์ (ไม่กระทบอพาร์ทเมนท์เดิมที่ไม่เปิดใช้)
 *       ตั้งอัตรา VAT (%) เองได้ และเลือกประเภท VAT แยกอิสระต่อค่าเช่า/ค่าน้ำ/ค่าไฟ ได้ 3 แบบ:
 *       "ไม่มี VAT" (ยกเว้น เช่น ค่าเช่าที่พักอาศัยตามกฎหมาย), "VAT นอก" (บวกเพิ่มจากราคาที่ตั้ง),
 *       "VAT ใน" (ราคาที่ตั้งรวมภาษีอยู่แล้ว แยกออกมาให้). คำนวณแยกทีละช่องแล้วรวมยอด VAT เข้าด้วยกัน
 *       เก็บผลคำนวณ (ยอดก่อนภาษี/VAT) ไว้ที่ตัวบิลตอนออกบิลเลย ไม่คำนวณสดใหม่ทุกครั้งที่เปิดดู กัน
 *       ปัญหาบิลเก่าเพี้ยนถ้าอัตรา VAT ถูกแก้ไขภายหลัง. เพิ่มเลขที่ใบกำกับภาษีแยกชุดจากเลขที่บิลปกติ
 * ------------------------------------------------------------
 * โครงสร้าง (9 ชีต):
 *
 *   ผู้ใช้งาน   : รหัส | username | รหัสผ่าน(hash) | salt | ชื่อที่แสดง | วันที่สมัคร   ← ใหม่ใน v11
 *   อพาร์ทเมนท์ : รหัส | ชื่ออพาร์ทเมนท์ | อัตราค่าน้ำ | อัตราค่าไฟ | ที่อยู่ | หมายเหตุท้ายบิล | QR | รหัสเจ้าของ
 *                                                                                    (คอลัมน์ "รหัสเจ้าของ" ใหม่ใน v11)
 *   ห้องพัก     : รหัส | รหัสอพาร์ทเมนท์ | เลขห้อง | ชั้น | ค่าเช่า | สถานะ
 *   ผู้เช่า     : รหัส | รหัสห้อง | ชื่อผู้เช่า | เบอร์โทร | วันที่เข้าพัก
 *   บิล        : รหัส | รหัสห้อง | เดือน | เลขที่บิล | ค่าเช่า | เลขมิเตอร์น้ำเดิม | เลขมิเตอร์น้ำปัจจุบัน |
 *                ค่าน้ำ | เลขมิเตอร์ไฟเดิม | เลขมิเตอร์ไฟปัจจุบัน | ค่าไฟ | รวม | สถานะ
 *   มัดจำ       : รหัส | รหัสห้อง | เลขที่ใบรับ | จำนวนเงิน | วันที่รับเงิน | หมายเหตุ
 *   จดมิเตอร์   : รหัส | รหัสห้อง | รหัสบิลอ้างอิง | เดือน | ประเภท | เลขเดิม | เลขปัจจุบัน |
 *                หน่วยที่ใช้ | อัตราต่อหน่วย | ค่าใช้จ่าย | เวลาบันทึก
 *   ใบเสร็จ     : รหัส | รหัสห้อง | รหัสบิลอ้างอิง | เลขที่ใบเสร็จ | จำนวนเงิน | วันที่รับเงิน | หมายเหตุ   ← ใหม่ใน v13
 *   ตำแหน่งผัง  : รหัส | รหัสห้อง | x | y                                                              ← ใหม่ใน v13
 *
 * หลักการของ v11:
 * - login (doPost action:'login') ตรวจ username/password กับชีต "ผู้ใช้งาน" (เก็บรหัสผ่านเป็น
 *   hash+salt เท่านั้น ไม่เก็บ plain text) แล้วออก "token" กลับไป — token เป็น JSON ที่เซ็นด้วย
 *   HMAC-SHA256 (secret สุ่มเก็บใน Script Properties ตอนใช้งานครั้งแรก) มีวันหมดอายุในตัวเอง
 *   ไม่ต้องเปิดชีต "sessions" แยกต่างหาก
 * - ทุก request อ่าน/เขียนข้อมูล (getAll, save) ต้องแนบ token มาด้วย backend จะถอด token
 *   เพื่อรู้ userId แล้วกรอง/บันทึกเฉพาะข้อมูลของอพาร์ทเมนท์ที่ ownerId ตรงกับ userId นั้น
 * - จุดสำคัญ: การ "save" ไม่ได้ลบทั้งชีตแล้วเขียนทับเหมือน v10 อีกต่อไป (ถ้าทำแบบนั้นบัญชี A
 *   save ทีนึงจะลบข้อมูลของบัญชี B ทิ้งหมด) เปลี่ยนเป็น "scoped replace": อ่านทั้งชีต แยกแถวที่
 *   เป็นของ user นี้ออกจากแถวของคนอื่น แล้วแทนที่เฉพาะส่วนของ user นี้ด้วยข้อมูลใหม่ที่ส่งมา
 *   โดยคงแถวของคนอื่นไว้เหมือนเดิมทุกครั้ง
 * - ชีต "ผู้ใช้งาน" ไม่ถูกอ่าน/เขียนผ่าน action ทั่วไป (getAll/save) เลย เพื่อไม่ให้ password hash
 *   หลุดออกไปที่ฝั่ง client โดยไม่ตั้งใจ — จัดการผ่านฟังก์ชัน ADMIN_createUser ด้านล่างเท่านั้น
 *
 * วิธีติดตั้ง (อัปเกรดจาก v10 ที่มีข้อมูลอยู่แล้ว):
 * 1) วางโค้ดนี้ทับ Code.gs ทั้งหมด แล้ว Deploy > Manage deployments > แก้ไข > New version > Deploy
 * 2) เปิด Apps Script editor เลือกฟังก์ชัน ADMIN_createUser จาก dropdown ด้านบน แก้บรรทัดท้ายไฟล์
 *    ให้เรียกด้วย username/รหัสผ่าน/ชื่อที่ต้องการ แล้วกด Run เพื่อสร้างบัญชีแรกของคุณ (ดู userId
 *    ที่ได้จาก Logger — View > Logs)
 * 3) เลือกฟังก์ชัน ADMIN_assignAllPropertiesToUser แก้ให้ใส่ userId จากข้อ 2 แล้ว Run อีกครั้ง —
 *    ขั้นตอนนี้จะ "โอน" อพาร์ทเมนท์เดิมทั้งหมดที่ยังไม่มีเจ้าของ ให้เป็นของบัญชีคุณ ไม่งั้นข้อมูลเดิม
 *    จะไม่โผล่ให้ใครเห็นเลยหลังอัปเดต (รันซ้ำได้ปลอดภัย จะข้ามอพาร์ทเมนท์ที่มีเจ้าของแล้ว)
 * 4) สร้างบัญชีเพิ่มให้คนอื่น (ถ้ามี) ด้วย ADMIN_createUser อีกครั้ง คนละ username
 * 5) ยังไม่มีหน้า "ลืมรหัสผ่าน"/สมัครเอง ใน v1 นี้ — ถ้าใครลืมรหัส ให้รัน ADMIN_createUser ซ้ำไม่ได้
 *    (username ซ้ำจะ error) ต้องลบแถวเดิมในชีต "ผู้ใช้งาน" ก่อน แล้วค่อยสร้างใหม่
 */

var SHEETS = {
  users: { name: 'ผู้ใช้งาน', headers: ['รหัส','username','รหัสผ่าน(hash)','salt','ชื่อที่แสดง','วันที่สมัคร'] },
  properties: { name: 'อพาร์ทเมนท์', headers: [
                  'รหัส','ชื่ออพาร์ทเมนท์','อัตราค่าน้ำ(บาท/หน่วย)','อัตราค่าไฟ(บาท/หน่วย)','ที่อยู่',
                  'หมายเหตุท้ายบิล','QR ชำระเงิน (base64)','รหัสเจ้าของ',
                  'เปิดใช้VAT','อัตราVAT(%)','VATค่าเช่า','VATค่าน้ำ','VATค่าไฟ','เลขผู้เสียภาษี','ชื่อนิติบุคคล'
                ] },
  rooms:      { name: 'ห้องพัก',     headers: ['รหัส','รหัสอพาร์ทเมนท์','เลขห้อง','ชั้น','ค่าเช่า','สถานะ','ประเภทห้อง','ค่ามัดจำ'] },
  tenants:    { name: 'ผู้เช่า',     headers: ['รหัส','รหัสห้อง','ชื่อผู้เช่า','เบอร์โทร','วันที่เข้าพัก'] },
  bills:      { name: 'บิล',        headers: [
                  'รหัส','รหัสห้อง','เดือน','เลขที่บิล','ค่าเช่า',
                  'เลขมิเตอร์น้ำเดิม','เลขมิเตอร์น้ำปัจจุบัน','ค่าน้ำ',
                  'เลขมิเตอร์ไฟเดิม','เลขมิเตอร์ไฟปัจจุบัน','ค่าไฟ','รวม','สถานะ',
                  'ยอดก่อนภาษี','VAT','เลขที่ใบกำกับภาษี'
                ] },
  deposits:      { name: 'มัดจำ', headers: ['รหัส','รหัสห้อง','เลขที่ใบรับ','จำนวนเงิน','วันที่รับเงิน','หมายเหตุ'] },
  meterReadings: { name: 'จดมิเตอร์', headers: [
                  'รหัส','รหัสห้อง','รหัสบิลอ้างอิง','เดือน','ประเภท',
                  'เลขเดิม','เลขปัจจุบัน','หน่วยที่ใช้','อัตราต่อหน่วย','ค่าใช้จ่าย','เวลาบันทึก'
                ] },
  receipts:      { name: 'ใบเสร็จ', headers: [
                  'รหัส','รหัสห้อง','รหัสบิลอ้างอิง','เลขที่ใบเสร็จ','จำนวนเงิน','วันที่รับเงิน','หมายเหตุ',
                  'ยอดก่อนภาษี','VAT'
                ] },
  roomLayouts:   { name: 'ตำแหน่งผัง', headers: ['รหัส','รหัสห้อง','x','y'] },
  logs:          { name: 'ล็อก', headers: [
                  'เวลา','userId','username','การกระทำ','ตาราง','รหัสที่กระทบ','จำนวนรายการ','หมายเหตุ'
                ] }
};

/* ============================================================
 * PK / FK ของแต่ละตาราง (v15) — ใช้ตรวจสอบความสัมพันธ์ระหว่างตารางก่อนบันทึกจริง
 * ทุกตารางใช้ "รหัส" (คอลัมน์แรกเสมอ) เป็น primary key
 * fks: [{ field: ชื่อฟิลด์ในข้อมูล client, refTable: ตารางที่อ้างอิงถึง }]
 * ตาราง properties อ้างอิง "รหัสเจ้าของ" ไปที่ users แต่ field นี้ปิดการบังคับใช้ไปแล้ว
 * (ดู doPost — ไม่ scope ตาม ownerId อีกต่อไป) จึงไม่ตรวจ FK นี้ ให้ค่าว่างได้เสมอ
 * ============================================================ */
var SCHEMA_FK = {
  properties:    { pk: 'id', fks: [] },
  rooms:         { pk: 'id', fks: [ { field: 'propertyId', refTable: 'properties' } ] },
  tenants:       { pk: 'id', fks: [ { field: 'roomId', refTable: 'rooms' } ] },
  bills:         { pk: 'id', fks: [ { field: 'roomId', refTable: 'rooms' } ] },
  deposits:      { pk: 'id', fks: [ { field: 'roomId', refTable: 'rooms' } ] },
  meterReadings: { pk: 'id', fks: [ { field: 'roomId', refTable: 'rooms' } ] },
  receipts:      { pk: 'id', fks: [ { field: 'roomId', refTable: 'rooms' } ] },
  roomLayouts:   { pk: 'id', fks: [ { field: 'roomId', refTable: 'rooms' } ] }
};

/* ตรวจว่าทุก item ที่จะบันทึกอ้างอิง FK ไปยัง record ที่มีอยู่จริงหรือไม่ — ถ้าอ้างอิงไปยัง "รหัส"
   ที่ไม่มีอยู่จริงในตารางปลายทาง (เช่น รหัสห้องที่ถูกลบไปแล้ว) จะโยน error ทันที ไม่บันทึกอะไรเลย
   ป้องกันข้อมูลกำพร้า (orphan row) ที่หาต้นตอไม่เจอทีหลัง — เป็นการ "เตือนตั้งแต่ตอนเขียน"
   แทนที่จะปล่อยให้ข้อมูลเงียบๆ หายไปทีหลังแบบที่เคยเกิดปัญหา */
function validateForeignKeys_(table, items) {
  var cfg = SCHEMA_FK[table];
  if (!cfg || !cfg.fks.length || !items || !items.length) return;
  cfg.fks.forEach(function (fk) {
    var validIds = {};
    readTable_(fk.refTable).forEach(function (row) { validIds[String(row.id)] = true; });
    items.forEach(function (item) {
      var refVal = item[fk.field];
      if (refVal === undefined || refVal === null || refVal === '') return; // ค่าว่างข้ามได้ (ยังไม่ผูก)
      if (!validIds[String(refVal)]) {
        throw new Error(
          'ข้อมูลอ้างอิงผิด: ตาราง "' + table + '" มีรายการที่ ' + fk.field + '=' + refVal +
          ' แต่ไม่พบ "รหัส"=' + refVal + ' ในตาราง "' + fk.refTable + '" — ไม่บันทึกข้อมูลทั้งชุดนี้'
        );
      }
    });
  });
}

/* บันทึก log ทุกครั้งที่มีการเขียนข้อมูลผ่าน doPost (ไม่ใช่แค่ตอน login) — เผื่อใช้สืบย้อนหลังได้
   ว่า login ไหน แก้ไข/บันทึกตารางอะไร รายการไหนบ้าง ถ้าเกิดข้อมูลหายหรือผิดพลาดอีกในอนาคต
   ไม่ throw error ถ้าการเขียน log ล้มเหลว (กัน log พังจนกระทบการบันทึกข้อมูลจริง) */
function appendLog_(uid, username, action, table, ids, count, note) {
  try {
    var sheet = getOrCreateSheet_('logs');
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([stamp, uid || '', username || '', action || '', table || '', (ids || []).join(','), count || 0, note || '']);
  } catch (e) {
    // เงียบไว้ — log พังไม่ควรทำให้การบันทึกข้อมูลจริงล้มเหลวตาม
  }
}

/* คอลัมน์ที่ต้องบังคับเป็น Plain text (@) เสมอ — เฉพาะช่องที่หน้าตาคล้ายตัวเลข/วันที่ ซึ่งเสี่ยงถูก
   Google Sheets แปลงชนิดข้อมูลเองอัตโนมัติ (เลขห้องมีเลขศูนย์นำหน้าได้ เช่น "001", เบอร์โทรไทยขึ้นต้น
   ด้วย 0 เสมอ, เดือน/วันที่เก็บเป็นข้อความรูปแบบ YYYY-MM/YYYY-MM-DD, เวลาบันทึกเป็น ISO timestamp)
   คอลัมน์ "รหัส" (id) ไม่บังคับเป็นข้อความ เพราะเป็นเลขวิ่งธรรมดา ไม่มีเลขศูนย์นำหน้า */
var TEXT_COLUMNS = {
  users:         [2, 3, 4, 6], // username, hash, salt, วันที่สมัคร (เผื่อ username ล้วนตัวเลข)
  rooms:         [3],        // เลขห้อง
  tenants:       [4, 5],     // เบอร์โทร, วันที่เข้าพัก
  bills:         [3, 16],    // เดือน, เลขที่ใบกำกับภาษี
  deposits:      [5],        // วันที่รับเงิน
  meterReadings: [4, 11],    // เดือน, เวลาบันทึก
  receipts:      [6]         // วันที่รับเงิน
};

function getOrCreateSheet_(table) {
  var cfg = SHEETS[table];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(cfg.name);
  if (!sheet) {
    sheet = ss.insertSheet(cfg.name);
    sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
  }
  var textCols = TEXT_COLUMNS[table];
  if (textCols) {
    textCols.forEach(function (col) {
      sheet.getRange(2, col, 5000, 1).setNumberFormat('@');
    });
  }
  return sheet;
}

function dateCellToText_(v, withDay) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var y = v.getFullYear();
    var m = String(v.getMonth() + 1); if (m.length < 2) m = '0' + m;
    if (!withDay) return y + '-' + m;
    var d = String(v.getDate()); if (d.length < 2) d = '0' + d;
    return y + '-' + m + '-' + d;
  }
  return String(v || '');
}

/* ---- แปลงระหว่างข้อมูลภายในแอป กับแถวในชีต — ทุกตารางเชื่อมกันด้วย "รหัส" ตรงๆ ---- */

/* ownerId เป็นคอลัมน์สุดท้าย (ต่อท้าย ไม่แทรกกลาง) เพื่อไม่ให้ตำแหน่งคอลัมน์เดิมขยับ —
   แถวเก่าที่ยังไม่เคยมีเจ้าของจะมีช่องนี้ว่าง จนกว่าจะรัน ADMIN_assignAllPropertiesToUser
   v14: เพิ่มชุดข้อมูล VAT ต่อท้ายเช่นกัน — อพาร์ทเมนท์เก่าที่ไม่เคยตั้งค่าจะได้ vatEnabled=false
   โดยอัตโนมัติ (ช่องว่าง) ไม่กระทบการทำงานเดิมเลย ต้องเข้าไปเปิดใช้เองในหน้าตั้งค่าอพาร์ทเมนท์ */
function propertyToRow_(p) {
  return [
    p.id, p.name || '', Number(p.waterRate) || 0, Number(p.electricRate) || 0, p.address || '', p.notes || '', p.qrImage || '', p.ownerId || '',
    p.vatEnabled ? 'เปิด' : '', Number(p.vatRate) || 0,
    vatTypeToLabel_(p.vatTypeRent), vatTypeToLabel_(p.vatTypeWater), vatTypeToLabel_(p.vatTypeElectric),
    p.taxId || '', p.legalName || ''
  ];
}
function rowToProperty_(row) {
  return {
    id: String(row[0]), name: String(row[1] || ''), waterRate: Number(row[2]) || 0, electricRate: Number(row[3]) || 0,
    address: String(row[4] || ''), notes: String(row[5] || ''), qrImage: String(row[6] || ''), ownerId: String(row[7] || ''),
    vatEnabled: row[8] === 'เปิด', vatRate: Number(row[9]) || 0,
    vatTypeRent: labelToVatType_(row[10]), vatTypeWater: labelToVatType_(row[11]), vatTypeElectric: labelToVatType_(row[12]),
    taxId: String(row[13] || ''), legalName: String(row[14] || '')
  };
}

/* แปลงประเภท VAT ระหว่างรหัสภายในแอป (none/exclusive/inclusive) กับข้อความอ่านง่ายที่โชว์ในชีตจริง
   - none:      ไม่ต้องเสีย VAT เลย (เช่น ค่าเช่าที่พักอาศัย ได้รับยกเว้นตามกฎหมาย)
   - exclusive: "VAT นอก" ราคาที่ตั้งไว้เป็นราคาก่อนภาษี บวก VAT เพิ่มเข้าไปตอนออกบิล
   - inclusive: "VAT ใน" ราคาที่ตั้งไว้รวมภาษีอยู่แล้ว ระบบแยกภาษีออกมาจากยอดนั้นให้เอง */
function vatTypeToLabel_(t) {
  if (t === 'exclusive') return 'VAT นอก';
  if (t === 'inclusive') return 'VAT ใน';
  return 'ไม่มี VAT';
}
function labelToVatType_(label) {
  if (label === 'VAT นอก') return 'exclusive';
  if (label === 'VAT ใน') return 'inclusive';
  return 'none';
}

function roomToRow_(r) {
  return [
    r.id, r.propertyId, r.number || '', r.floor || '', Number(r.rent) || 0,
    r.status === 'occupied' ? 'มีผู้เช่า' : 'ว่าง',
    r.roomType || '', Number(r.deposit) || 0
  ];
}
function rowToRoom_(row) {
  return {
    id: String(row[0]), propertyId: String(row[1]), number: String(row[2] || ''),
    floor: String(row[3] || ''), rent: Number(row[4]) || 0,
    status: row[5] === 'มีผู้เช่า' ? 'occupied' : 'vacant',
    roomType: String(row[6] || ''), deposit: Number(row[7]) || 0
  };
}

function tenantToRow_(t) {
  return [ t.id, t.roomId, t.name || '', t.phone || '', t.moveIn || '' ];
}
function rowToTenant_(row) {
  return { id: String(row[0]), roomId: String(row[1]), name: String(row[2] || ''), phone: String(row[3] || ''), moveIn: dateCellToText_(row[4], true) };
}

/* v14: เพิ่ม vatSubtotal(ยอดก่อนภาษี), vatAmount(VAT), taxInvoiceNo(เลขที่ใบกำกับภาษี) ต่อท้าย —
   บิลเก่าที่ออกก่อนมี VAT จะมี 3 ช่องนี้ว่าง/เป็น 0 อัตโนมัติ ไม่กระทบข้อมูลเดิม
   "รวม" (total) ยังคงหมายถึงยอดสุทธิที่ต้องชำระเหมือนเดิมทุกประการ ไม่ว่าจะมี VAT หรือไม่ */
function billToRow_(b) {
  return [
    b.id, b.roomId, b.month, b.invoiceNo || '', Number(b.rent) || 0,
    Number(b.waterPrev) || 0, Number(b.waterCurr) || 0, Number(b.water) || 0,
    Number(b.electricPrev) || 0, Number(b.electricCurr) || 0, Number(b.electric) || 0,
    Number(b.total) || 0, b.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ',
    Number(b.vatSubtotal) || 0, Number(b.vatAmount) || 0, b.taxInvoiceNo || ''
  ];
}
function rowToBill_(row) {
  return {
    id: String(row[0]), roomId: String(row[1]), month: dateCellToText_(row[2], false),
    invoiceNo: String(row[3] || ''), rent: Number(row[4]) || 0,
    waterPrev: Number(row[5]) || 0, waterCurr: Number(row[6]) || 0, water: Number(row[7]) || 0,
    electricPrev: Number(row[8]) || 0, electricCurr: Number(row[9]) || 0, electric: Number(row[10]) || 0,
    total: Number(row[11]) || 0, status: row[12] === 'ชำระแล้ว' ? 'paid' : 'unpaid',
    vatSubtotal: Number(row[13]) || 0, vatAmount: Number(row[14]) || 0, taxInvoiceNo: String(row[15] || '')
  };
}

/* tenantId ในแอปหน้าบ้านเท่ากับ roomId เสมอ (1 ห้อง 1 ผู้เช่าปัจจุบัน) จึงไม่ต้องเก็บซ้ำเป็นคอลัมน์แยก */
function depositToRow_(d) {
  return [ d.id, d.roomId, d.receiptNo || '', Number(d.amount) || 0, d.date || '', d.note || '' ];
}
function rowToDeposit_(row) {
  return {
    id: String(row[0]), roomId: String(row[1]), tenantId: String(row[1]),
    receiptNo: String(row[2] || ''), amount: Number(row[3]) || 0,
    date: dateCellToText_(row[4], true), note: String(row[5] || '')
  };
}

function meterReadingToRow_(m) {
  return [
    m.id, m.roomId, m.billId || '', m.month || '', m.type || '',
    Number(m.prev) || 0, Number(m.curr) || 0, Number(m.units) || 0,
    Number(m.rate) || 0, Number(m.cost) || 0, m.recordedAt || ''
  ];
}
function rowToMeterReading_(row) {
  return {
    id: String(row[0]), roomId: String(row[1]), billId: String(row[2] || ''),
    month: dateCellToText_(row[3], false), type: String(row[4] || ''),
    prev: Number(row[5]) || 0, curr: Number(row[6]) || 0, units: Number(row[7]) || 0,
    rate: Number(row[8]) || 0, cost: Number(row[9]) || 0, recordedAt: String(row[10] || '')
  };
}

/* ใบเสร็จรับเงิน — ออกตอนบิลได้รับการชำระ อ้างอิงกลับไปที่บิลต้นทางผ่าน billId
   (คนละเอกสารกับ "มัดจำ" ซึ่งเป็นเงินมัดจำตอนเข้าพัก ไม่ใช่ค่าเช่ารายเดือน)
   v14: เพิ่ม vatSubtotal/vatAmount ต่อท้าย ให้ตรงกับของบิลต้นทาง เผื่อพิมพ์ใบเสร็จแบบมี VAT */
function receiptToRow_(rc) {
  return [ rc.id, rc.roomId, rc.billId || '', rc.receiptNo || '', Number(rc.amount) || 0, rc.date || '', rc.note || '',
    Number(rc.vatSubtotal) || 0, Number(rc.vatAmount) || 0 ];
}
function rowToReceipt_(row) {
  return {
    id: String(row[0]), roomId: String(row[1]), billId: String(row[2] || ''),
    receiptNo: String(row[3] || ''), amount: Number(row[4]) || 0,
    date: dateCellToText_(row[5], true), note: String(row[6] || ''),
    vatSubtotal: Number(row[7]) || 0, vatAmount: Number(row[8]) || 0
  };
}

/* ตำแหน่งห้องในมุมมอง "ผังอิสระ" — เก็บแยกต่อห้อง (roomId ไม่ซ้ำกันอยู่แล้วในทุกอพาร์ทเมนท์)
   ไม่ต้องเก็บรหัสอพาร์ทเมนท์/ชั้นซ้ำ เพราะสืบได้จากตัวห้องเองอยู่แล้ว */
function roomLayoutToRow_(rl) {
  return [ rl.id, rl.roomId, Number(rl.x) || 0, Number(rl.y) || 0 ];
}
function rowToRoomLayout_(row) {
  return { id: String(row[0]), roomId: String(row[1]), x: Number(row[2]) || 0, y: Number(row[3]) || 0 };
}

var CONVERTERS = {
  properties:    { toRow: propertyToRow_,     fromRow: rowToProperty_ },
  rooms:         { toRow: roomToRow_,         fromRow: rowToRoom_ },
  tenants:       { toRow: tenantToRow_,       fromRow: rowToTenant_ },
  bills:         { toRow: billToRow_,         fromRow: rowToBill_ },
  deposits:      { toRow: depositToRow_,      fromRow: rowToDeposit_ },
  meterReadings: { toRow: meterReadingToRow_,  fromRow: rowToMeterReading_ },
  receipts:      { toRow: receiptToRow_,      fromRow: rowToReceipt_ },
  roomLayouts:   { toRow: roomLayoutToRow_,   fromRow: rowToRoomLayout_ }
};

/* ============================================================
 * ระบบ login / token (v11)
 * ============================================================ */

/* ============================================================
 * Auth แยกต่างหากสำหรับบอท (Facebook Messenger) — คนละชุดกับ token ของ user จริง
 * เก็บ key ไว้ใน Script Properties ชื่อ BOT_API_KEY — ดึง/สร้างผ่าน action 'issueBotApiKey'
 * ใน doGet ด้วย username/password เดิมของเจ้าของหอ ไม่ต้องเปิด Apps Script editor เลย
 * ============================================================ */
function verifyBotApiKey_(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('BOT_API_KEY');
  return !!expected && !!key && String(key) === String(expected);
}

/* secret สำหรับเซ็น token — สุ่มสร้างครั้งแรกที่ใช้งาน แล้วเก็บถาวรไว้ใน Script Properties
   ของโปรเจกต์นี้ (คนละชุดกับ Properties ของสเปรดชีต) ไม่ต้องตั้งค่าเอง */
function getAuthSecret_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('AUTH_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('AUTH_SECRET', secret);
  }
  return secret;
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var v = b < 0 ? b + 256 : b;
    var h = v.toString(16);
    return h.length < 2 ? '0' + h : h;
  }).join('');
}

function hmacSign_(payloadB64) {
  var raw = Utilities.computeHmacSha256Signature(payloadB64, getAuthSecret_());
  return bytesToHex_(raw);
}

/* token = base64url(JSON payload) + "." + ลายเซ็น HMAC ของส่วน payload นั้น
   ไม่ต้องเปิดชีต "sessions" แยก เพราะวันหมดอายุ (exp) อยู่ในตัว payload เองแล้ว ตรวจได้ทันที */
function createToken_(user) {
  var payload = { uid: user.id, u: user.username, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  var payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  return payloadB64 + '.' + hmacSign_(payloadB64);
}

function verifyToken_(token) {
  if (!token || token.indexOf('.') === -1) return null;
  var parts = token.split('.');
  var payloadB64 = parts[0], sig = parts[1];
  if (hmacSign_(payloadB64) !== sig) return null;
  try {
    var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload; // { uid, u, exp }
  } catch (e) {
    return null;
  }
}

function hashPassword_(password, salt) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + salt);
  return bytesToHex_(digest);
}

/* หาแถวผู้ใช้จาก username — ไม่ผ่าน CONVERTERS/readTable_ ทั่วไป เพราะ users ไม่ใช่ตารางที่
   ถูก sync แบบ getAll/save เหมือนตารางอื่น (กัน password hash หลุดไปฝั่ง client) */
function findUserByUsername_(username) {
  var sheet = getOrCreateSheet_('users');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, SHEETS.users.headers.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][1]) === username) {
      return {
        id: String(values[i][0]), username: String(values[i][1]),
        passwordHash: String(values[i][2]), salt: String(values[i][3]),
        displayName: String(values[i][4] || ''), createdAt: String(values[i][5] || '')
      };
    }
  }
  return null;
}

/* ชุดอพาร์ทเมนท์/ห้องที่เป็นของ user นี้ ณ ตอนนี้ (ใช้ทั้งกรองตอนอ่าน และกันเขตตอนเขียน) */
function getOwnedPropertyIds_(uid) {
  var ids = {};
  readTable_('properties').forEach(function (p) {
    if (String(p.ownerId) === String(uid)) ids[p.id] = true;
  });
  return ids;
}
function getOwnedRoomIds_(ownedPropIds) {
  var ids = {};
  readTable_('rooms').forEach(function (r) {
    if (ownedPropIds[r.propertyId]) ids[r.id] = true;
  });
  return ids;
}

function readTable_(table) {
  var sheet = getOrCreateSheet_(table);
  var cfg = SHEETS[table];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, cfg.headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i].join('') === '') continue;
    out.push(CONVERTERS[table].fromRow(values[i]));
  }
  return out;
}

function writeTable_(table, items) {
  var sheet = getOrCreateSheet_(table);
  var cfg = SHEETS[table];
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, cfg.headers.length).clearContent();
  }
  if (items && items.length) {
    var rows = items.map(function (it) { return CONVERTERS[table].toRow(it); });
    sheet.getRange(2, 1, rows.length, cfg.headers.length).setValues(rows);
  }
}

function doGet(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var action = (e.parameter && e.parameter.action) || 'getAll';
    if (action === 'ping') {
      return jsonOutput_({ ok: true });
    }

    /* ให้เจ้าของหอดึง/สร้างใหม่ BOT_API_KEY ได้เองทุกเมื่อ ผ่าน username/password เดียวกับที่ล็อกอิน
       เข้าแอป — ไม่ต้องเปิด Apps Script editor หรือคัดลอกจาก Logger เลย กันลืม/พิมพ์ผิดจากการคัดลอก
       ด้วยมือ ยิงซ้ำได้เรื่อยๆ จะได้ key เดิมกลับมาเสมอ ไม่หายแม้ไม่ได้จดไว้ทันที
       ใส่ &regenerate=yes ถ้าต้องการสุ่ม key ใหม่ทับของเดิม (เช่น สงสัยว่าหลุด) */
    if (action === 'issueBotApiKey') {
      var iUser = findUserByUsername_(String(e.parameter.username || '').trim());
      if (!iUser || hashPassword_(String(e.parameter.password || ''), iUser.salt) !== iUser.passwordHash) {
        return jsonOutput_({ error: 'invalid_credentials' });
      }
      var botProps = PropertiesService.getScriptProperties();
      var existingKey = botProps.getProperty('BOT_API_KEY');
      if (existingKey && e.parameter.regenerate !== 'yes') {
        return jsonOutput_({ apiKey: existingKey, regenerated: false });
      }
      var newBotKey = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
      botProps.setProperty('BOT_API_KEY', newBotKey);
      return jsonOutput_({ apiKey: newBotKey, regenerated: !!existingKey });
    }

    var auth = verifyToken_(e.parameter && e.parameter.token);
    if (!auth) return jsonOutput_({ error: 'unauthorized' });

    /* v15: เปิดให้ทุกบัญชีที่ login แล้วเห็นข้อมูลทั้งหมดของทุกอพาร์ทเมนท์ ไม่กรองตาม
       "รหัสเจ้าของ" อีกต่อไป (ตามที่ตกลงกันไว้ว่ายังไม่มีผู้ใช้งานจริงหลายคนพร้อมกัน) —
       คอลัมน์ "รหัสเจ้าของ" ในชีต "อพาร์ทเมนท์" ยังเก็บไว้เหมือนเดิม ไม่ได้ลบทิ้ง เผื่อกลับมา
       เปิดใช้การกรองนี้อีกครั้งในอนาคต แค่ตอนนี้ตัวแปร ownedPropIds/ownedRoomIds ไม่ถูกใช้กรองแล้ว */
    var properties = readTable_('properties')
      .map(function (p) {
        return { id: p.id, name: p.name, waterRate: p.waterRate, electricRate: p.electricRate, address: p.address, notes: p.notes, qrImage: p.qrImage };
      });

    return jsonOutput_({
      properties: properties,
      rooms: readTable_('rooms'),
      tenants: readTable_('tenants'),
      bills: readTable_('bills'),
      deposits: readTable_('deposits'),
      meterReadings: readTable_('meterReadings'),
      receipts: readTable_('receipts'),
      roomLayouts: readTable_('roomLayouts')
    });
  } catch (err) {
    return jsonOutput_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'login') {
      var username = String(body.username || '').trim();
      var password = String(body.password || '');
      var user = username ? findUserByUsername_(username) : null;
      if (!user || hashPassword_(password, user.salt) !== user.passwordHash) {
        return jsonOutput_({ error: 'invalid_credentials' });
      }
      return jsonOutput_({
        success: true,
        token: createToken_(user),
        user: { id: user.id, username: user.username, displayName: user.displayName }
      });
    }

    /* สมัครสมาชิกเอง (เปิดให้ใครก็ได้ที่มีลิงก์เว็บนี้สมัครบัญชีใหม่ได้) — ตามที่ต้องการให้แชร์
       โปรแกรมนี้ใช้งานร่วมกันหลายคนได้ ใช้ ADMIN_createUser ตัวเดียวกับที่ทำผ่าน editor ด้วยมือ
       เพื่อให้กติกา (ความยาวรหัสผ่าน, username ห้ามซ้ำ) เป็นชุดเดียวกันทั้งสองทาง */
    if (body.action === 'register') {
      try {
        var regUsername = String(body.username || '').trim();
        var regPassword = String(body.password || '');
        var regDisplayName = String(body.displayName || '').trim() || regUsername;
        var newUserId = ADMIN_createUser(regUsername, regPassword, regDisplayName);
        var newUser = findUserByUsername_(regUsername);
        return jsonOutput_({
          success: true,
          token: createToken_(newUser),
          user: { id: newUser.id, username: newUser.username, displayName: newUser.displayName }
        });
      } catch (regErr) {
        return jsonOutput_({ error: String(regErr.message || regErr) });
      }
    }

    /* ============================================================
     * Endpoint สาธารณะสำหรับบอท (Facebook Messenger) — read-only เท่านั้น
     * ใช้ BOT_API_KEY แยกต่างหาก ไม่ผ่าน verifyToken_/uid ของ user เลย
     * คืนแค่ ชั้น/ประเภทห้อง/ค่าเช่า/ค่ามัดจำ ของห้องที่ "ว่าง" เท่านั้น —
     * ไม่แตะชีต "ผู้เช่า", "บิล", "มัดจำ" (ใบเสร็จจริง) หรือ field ใดๆ ที่ระบุตัวบุคคลเด็ดขาด
     * ============================================================ */
    if (body.action === 'getPublicAvailability') {
      if (!verifyBotApiKey_(body.apiKey)) return jsonOutput_({ error: 'unauthorized' });

      var vacantRooms = readTable_('rooms')
        .filter(function (r) { return r.status === 'vacant'; })
        .map(function (r) {
          return {
            floor: r.floor,
            roomType: r.roomType || null,
            rent: r.rent,
            deposit: r.deposit || null
          };
        });

      return jsonOutput_({
        rooms: vacantRooms,
        updatedAt: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX")
      });
    }

    var auth = verifyToken_(body.token);
    if (!auth) return jsonOutput_({ error: 'unauthorized' });
    var uid = auth.uid;

    var table = body.table;
    if (!SHEETS[table] || table === 'users' || table === 'logs') throw new Error('unknown table: ' + table);
    var items = body.items || [];

    /* v15: เปิดให้ทุกบัญชีแก้ไขข้อมูลร่วมกันได้ทั้งหมด (ตามที่ตกลงกัน เพราะยังไม่มีผู้ใช้งานจริง
       หลายคนพร้อมกัน) — ไม่ทำ "scoped replace" ตาม ownerId อีกต่อไป เขียนทับทั้งตารางตรงๆ
       เหมือน v10 (ทุกคนแก้ของกันและกันได้) แต่ตรวจ FK ก่อนเขียนเสมอ (validateForeignKeys_) กัน
       ข้อมูลอ้างอิงไปยัง "รหัส" ที่ไม่มีอยู่จริง แล้วบันทึก log ไว้ทุกครั้งเผื่อสืบย้อนหลัง */
    if (table === 'properties') {
      // คอลัมน์ "รหัสเจ้าของ" ยังเก็บค่าที่ client ส่งมาได้ตามปกติ แต่ไม่ถูกใช้กรองอะไรแล้ว
      // (ดู doGet) — ไม่บังคับ overwrite เป็น uid ปัจจุบันเหมือนก่อนหน้านี้
    } else {
      validateForeignKeys_(table, items);
    }

    writeTable_(table, items);

    var ids = items.map(function (it) { return it.id; });
    appendLog_(uid, auth.u, 'save', table, ids, items.length, '');

    return jsonOutput_({ success: true });
  } catch (err) {
    return jsonOutput_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 * ฟังก์ชันย้ายข้อมูลครั้งเดียว (รันด้วยมือจาก Apps Script editor)
 * ไม่เกี่ยวกับ doGet/doPost — ไม่ถูกเรียกจากแอปเลย ปลอดภัยจากการรันซ้ำโดยไม่ตั้งใจของแอป
 * แต่ถ้ารันฟังก์ชันนี้ซ้ำเองด้วยมือ 2 ครั้ง จะ error ตั้งแต่ครั้งที่ 2 (หาชีตต้นฉบับไม่เจอเพราะลบไปแล้ว)
 * ซึ่งปลอดภัย ไม่ทำอะไรซ้ำเสียหาย
 * ============================================================ */
function ONE_TIME_migrateFromEnglishSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();

  function findByHeader(headerSet) {
    for (var i = 0; i < sheets.length; i++) {
      var sh = sheets[i];
      var lastCol = sh.getLastColumn();
      if (lastCol < headerSet.length) continue;
      var hdr = sh.getRange(1, 1, 1, headerSet.length).getValues()[0].map(String);
      var match = true;
      for (var j = 0; j < headerSet.length; j++) {
        if (hdr[j] !== headerSet[j]) { match = false; break; }
      }
      if (match) return sh;
    }
    return null;
  }

  function readRows(sh) {
    if (!sh) return [];
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return [];
    return sh.getRange(2, 1, lastRow - 1, lastCol).getValues().filter(function (r) {
      return r.join('') !== '';
    });
  }

  var engProps    = findByHeader(['id', 'name', 'waterRate', 'electricRate', 'address', 'notes', 'qrImage']);
  var engRooms    = findByHeader(['id', 'propertyId', 'number', 'floor', 'rent', 'status']);
  var engTenants  = findByHeader(['id', 'roomId', 'name', 'phone', 'moveIn']);
  var engBills    = findByHeader(['id', 'roomId', 'month', 'invoiceNo', 'rent']);
  var engDeposits = findByHeader(['id', 'roomId', 'tenantId', 'receiptNo', 'amount']);
  var strayIdOnly = findByHeader(['id']);

  if (!engProps || !engRooms) {
    throw new Error('ไม่พบชีตต้นฉบับภาษาอังกฤษ (ต้องมีหัวตาราง id,name,waterRate,... สำหรับอพาร์ทเมนท์ และ id,propertyId,number,... สำหรับห้องพัก) — อาจถูกลบไปแล้ว หรือรันฟังก์ชันนี้ไปแล้วก่อนหน้านี้');
  }

  var propRows    = readRows(engProps);
  var roomRows    = readRows(engRooms);
  var tenantRows  = readRows(engTenants);
  var billRows    = readRows(engBills);
  var depositRows = readRows(engDeposits);

  function writeRowsDirect_(sheet, rows, numCols) {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, numCols).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, numCols).setValues(rows);
  }

  // properties: id, name, waterRate, electricRate, address, notes, qrImage, (ownerId ว่างไว้ก่อน — ไป
  // stamp เจ้าของทีหลังด้วย ADMIN_assignAllPropertiesToUser)
  var propOut = propRows.map(function (r) {
    return [ r[0], r[1], Number(r[2]) || 0, Number(r[3]) || 0, r[4] || '', r[5] || '', r[6] || '', '' ];
  });
  writeRowsDirect_(getOrCreateSheet_('properties'), propOut, SHEETS.properties.headers.length);

  // rooms: id, propertyId, number, floor, rent, status  (ตรงกับ schema ใหม่พอดี แค่แปลสถานะเป็นไทย)
  var roomOut = roomRows.map(function (r) {
    return [ r[0], r[1], r[2], r[3] || '', Number(r[4]) || 0, r[5] === 'occupied' ? 'มีผู้เช่า' : 'ว่าง' ];
  });
  writeRowsDirect_(getOrCreateSheet_('rooms'), roomOut, SHEETS.rooms.headers.length);

  // tenants: id, roomId, name, phone, moveIn  (ตรงกับ schema ใหม่พอดี)
  var tenantOut = tenantRows.map(function (r) {
    return [ r[0], r[1], r[2] || '', r[3] || '', r[4] || '' ];
  });
  writeRowsDirect_(getOrCreateSheet_('tenants'), tenantOut, SHEETS.tenants.headers.length);

  // bills เก่า: id, roomId, month, invoiceNo, rent, waterPrev, waterCurr, water,
  //             electricPrev, electricCurr, electric, total, status
  // ใหม่ต้องการ: id, roomId, month, invoiceNo, rent, waterPrev, waterCurr, water,
  //             electricPrev, electricCurr, electric, total, status(ไทย)  -- ลำดับเดียวกัน แค่แปลสถานะ
  var billOut = billRows.map(function (r) {
    return [
      r[0], r[1], r[2], r[3] || '', Number(r[4]) || 0,
      Number(r[5]) || 0, Number(r[6]) || 0, Number(r[7]) || 0,
      Number(r[8]) || 0, Number(r[9]) || 0, Number(r[10]) || 0,
      Number(r[11]) || 0, r[12] === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'
    ];
  });
  writeRowsDirect_(getOrCreateSheet_('bills'), billOut, SHEETS.bills.headers.length);

  // deposits เก่า: id, roomId, tenantId, receiptNo, amount, date, note
  // ใหม่ต้องการ: id, roomId, receiptNo, amount, date, note  (ตัด tenantId ออก เพราะซ้ำกับ roomId เสมอ)
  var depOut = depositRows.map(function (r) {
    return [ r[0], r[1], r[3] || '', Number(r[4]) || 0, r[5] || '', r[6] || '' ];
  });
  writeRowsDirect_(getOrCreateSheet_('deposits'), depOut, SHEETS.deposits.headers.length);

  // ลบชีตต้นฉบับภาษาอังกฤษ (และชีตเปล่าที่มีแต่หัวตาราง "id" ค้างอยู่) ทิ้งให้อัตโนมัติ
  [engProps, engRooms, engTenants, engBills, engDeposits, strayIdOnly].forEach(function (sh) {
    if (sh) ss.deleteSheet(sh);
  });

  Logger.log(
    'ย้ายข้อมูลเสร็จแล้ว: อพาร์ทเมนท์ ' + propOut.length +
    ' รายการ, ห้องพัก ' + roomOut.length +
    ' ห้อง, ผู้เช่า ' + tenantOut.length +
    ' คน, บิล ' + billOut.length +
    ' ใบ, มัดจำ ' + depOut.length + ' รายการ — ลบชีตต้นฉบับภาษาอังกฤษเรียบร้อย'
  );
}

/* ============================================================
 * ฟังก์ชันดูแลบัญชีผู้ใช้ (รันด้วยมือจาก Apps Script editor เท่านั้น)
 * ไม่ถูกเรียกจาก doGet/doPost เลย — ปลอดภัยจากการถูกเรียกผ่านเว็บโดยไม่ตั้งใจ
 * ============================================================ */

/* สร้างบัญชีผู้ใช้ใหม่ 1 คน — แก้ค่า username/password/displayName ด้านล่างสุดของไฟล์นี้
   (ในฟังก์ชัน RUN_createUser) แล้วเลือกฟังก์ชัน RUN_createUser จาก dropdown ด้านบนของ
   Apps Script editor กด Run — ดู userId ที่ได้จาก View > Logs (Ctrl+Enter) */
function ADMIN_createUser(username, password, displayName) {
  username = String(username || '').trim();
  if (!username) throw new Error('username ห้ามว่าง');
  if (!password || String(password).length < 4) throw new Error('รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัวอักษร)');
  if (findUserByUsername_(username)) throw new Error('username นี้มีอยู่แล้ว: ' + username);

  var sheet = getOrCreateSheet_('users');
  var lastRow = sheet.getLastRow();
  var maxId = 0;
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 1).getValues().forEach(function (r) {
      var n = parseInt(r[0], 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
  }
  var newId = maxId + 1;
  var salt = Utilities.getUuid();
  var hash = hashPassword_(String(password), salt);
  var createdAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  sheet.appendRow([newId, username, hash, salt, displayName || username, createdAt]);
  Logger.log('สร้างบัญชีสำเร็จ — userId = ' + newId + ', username = ' + username);
  return newId;
}

/* โอนอพาร์ทเมนท์ทั้งหมดที่ "ยังไม่มีเจ้าของ" (ownerId ว่าง) ให้เป็นของ userId ที่ระบุ
   ใช้ตอนอัปเกรดจาก v10 ครั้งแรก เพื่อไม่ให้อพาร์ทเมนท์เดิมหายไปจากทุกบัญชีหลังอัปเดต
   รันซ้ำได้ปลอดภัย — จะข้ามแถวที่มีเจ้าของแล้วเสมอ ไม่เขียนทับของคนอื่น */
function ADMIN_assignAllPropertiesToUser(userId) {
  var sheet = getOrCreateSheet_('properties');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('ไม่มีอพาร์ทเมนท์ในระบบเลย'); return; }
  var ownerCol = SHEETS.properties.headers.length; // คอลัมน์สุดท้าย = รหัสเจ้าของ
  var range = sheet.getRange(2, ownerCol, lastRow - 1, 1);
  var values = range.getValues();
  var changed = 0;
  for (var i = 0; i < values.length; i++) {
    if (!values[i][0]) { values[i][0] = userId; changed++; }
  }
  range.setValues(values);
  Logger.log('กำหนดเจ้าของ (userId=' + userId + ') ให้อพาร์ทเมนท์ที่ยังไม่มีเจ้าของ: ' + changed + ' รายการ');
}

/* ---- ตัวอย่างการเรียกใช้: แก้ค่าด้านล่างนี้แล้วเลือกรันฟังก์ชัน RUN_createUser จาก
   Apps Script editor ครั้งเดียว (เปลี่ยน username/password/ชื่อที่แสดงตามต้องการก่อนรัน) ---- */
function RUN_createUser() {
  var newId = ADMIN_createUser('เจ้าของหอ', 'เปลี่ยนรหัสผ่านนี้ก่อนใช้จริง', 'เจ้าของหอ');
  // ถ้าอยากให้อพาร์ทเมนท์เดิมทั้งหมดเป็นของบัญชีนี้เลยในรอบเดียว ลบเครื่องหมาย // หน้าบรรทัดล่างออก:
  // ADMIN_assignAllPropertiesToUser(newId);
}

/* ============================================================
 * กู้คืนข้อมูลที่หายจากบัคหน้า login/สมัครสมาชิก (v15)
 * ------------------------------------------------------------
 * สาเหตุเดิม: การสมัครสมาชิกบัญชีใหม่ระหว่างที่การเชื่อมต่อ Google Sheets ล้มเหลวชั่วคราว ทำให้
 * แอปฝั่ง client โหลด cache เก่าขึ้นมาแสดง แล้ว auto-save ทับข้อมูลจริงของ "ผู้เช่า", "บิล" และ
 * "จดมิเตอร์" ของอพาร์ทเมนท์ "ภาณุภณแมนชั่น" ไปบางส่วน (ตัวอพาร์ทเมนท์และห้องพักไม่ได้หายไปด้วย)
 * ฟังก์ชันนี้ดึงเฉพาะแถวที่ "รหัส" ยังไม่มีอยู่ในชีตจริงตอนนี้ กลับเข้าไปจากไฟล์สำรอง
 * (ไม่แตะแถวที่มีอยู่แล้วเลย ปลอดภัยที่จะรันซ้ำได้หลายครั้ง)
 * ============================================================ */
var RESTORE_BACKUP_FILE_ID = '1_OW4yl3wx4bux9kBGJ670QdphXWTbA_8pAwvcJavGVo'; // "dataAI - สำรอง 2026-09-15_0359"

/* คัดลอกเฉพาะแถวที่ "รหัส" (คอลัมน์แรก) ยังไม่มีอยู่ในชีตจริงตอนนี้ จากชีตชื่อเดียวกันในไฟล์สำรอง
   extraDefaults: object { colIndex(0-based): ค่า default } สำหรับคอลัมน์ที่มีเฉพาะในสคีมาปัจจุบัน
   แต่ไม่มีในไฟล์สำรองเก่า (เช่น คอลัมน์ VAT ที่เพิ่มเข้ามาทีหลัง) */
function ONE_TIME_restoreMissingRows_(table, backupSs, extraDefaults) {
  var liveSheet = getOrCreateSheet_(table);
  var cfg = SHEETS[table];
  var backupSheet = backupSs.getSheetByName(cfg.name);
  if (!backupSheet) { Logger.log('ไม่พบชีต "' + cfg.name + '" ในไฟล์สำรอง — ข้าม'); return { restored: 0, ids: [] }; }

  var liveLastRow = liveSheet.getLastRow();
  var existingIds = {};
  if (liveLastRow >= 2) {
    liveSheet.getRange(2, 1, liveLastRow - 1, 1).getValues().forEach(function (r) {
      if (r[0] !== '' && r[0] !== null) existingIds[String(r[0])] = true;
    });
  }

  var backupLastRow = backupSheet.getLastRow();
  if (backupLastRow < 2) return { restored: 0, ids: [] };
  var backupLastCol = backupSheet.getLastColumn();
  var backupRows = backupSheet.getRange(2, 1, backupLastRow - 1, backupLastCol).getValues();

  var targetCols = cfg.headers.length;
  var rowsToAdd = [];
  var restoredIds = [];
  backupRows.forEach(function (row) {
    if (row.join('') === '') return; // แถวว่าง
    var id = row[0];
    if (id === '' || id === null || existingIds[String(id)]) return; // มีอยู่แล้ว/ไม่มีรหัส ข้าม

    var newRow = row.slice(0, targetCols);
    while (newRow.length < targetCols) {
      var colIndex = newRow.length; // 0-based index ของคอลัมน์ที่กำลังจะเติม (นับจาก 0)
      newRow.push(extraDefaults && extraDefaults[colIndex] !== undefined ? extraDefaults[colIndex] : '');
    }
    rowsToAdd.push(newRow);
    restoredIds.push(id);
  });

  if (rowsToAdd.length) {
    var startRow = liveSheet.getLastRow() + 1;
    liveSheet.getRange(startRow, 1, rowsToAdd.length, targetCols).setValues(rowsToAdd);
  }
  return { restored: rowsToAdd.length, ids: restoredIds };
}

/* รันฟังก์ชันนี้ "ครั้งเดียว" จาก Apps Script editor: เลือก ONE_TIME_restoreLostData จาก dropdown
   ด้านบน กด Run แล้วดูผลที่ View > Logs (Ctrl+Enter) — ไม่ต้อง Deploy เวอร์ชันใหม่ก่อนก็รันได้
   เพราะฟังก์ชันนี้ไม่ได้ถูกเรียกผ่าน doGet/doPost เลย ปลอดภัยที่จะรันซ้ำได้ถ้าไม่มั่นใจว่าสำเร็จ
   (รอบต่อไปจะไม่เจอแถวไหนให้กู้คืนเพิ่มแล้ว เพราะรอบแรกเติมเข้าไปแล้ว) */
function ONE_TIME_restoreLostData() {
  var backupSs = SpreadsheetApp.openById(RESTORE_BACKUP_FILE_ID);

  var tenantsResult = ONE_TIME_restoreMissingRows_('tenants', backupSs, null);
  // ตาราง "บิล" ตอนนี้มี 3 คอลัมน์เพิ่มจาก v14 (VAT) ที่ไฟล์สำรองเก่ายังไม่มี — เติมค่าเริ่มต้นให้
  // ยอดก่อนภาษี=0, VAT=0, เลขที่ใบกำกับภาษี='' (index 13,14,15 นับจาก 0 = คอลัมน์ที่ 14-16)
  var billsResult = ONE_TIME_restoreMissingRows_('bills', backupSs, { 13: 0, 14: 0, 15: '' });
  var meterResult = ONE_TIME_restoreMissingRows_('meterReadings', backupSs, null);

  appendLog_('', '', 'restore', 'tenants', tenantsResult.ids, tenantsResult.restored, 'กู้คืนจากไฟล์สำรอง ' + RESTORE_BACKUP_FILE_ID);
  appendLog_('', '', 'restore', 'bills', billsResult.ids, billsResult.restored, 'กู้คืนจากไฟล์สำรอง ' + RESTORE_BACKUP_FILE_ID);
  appendLog_('', '', 'restore', 'meterReadings', meterResult.ids, meterResult.restored, 'กู้คืนจากไฟล์สำรอง ' + RESTORE_BACKUP_FILE_ID);

  Logger.log(
    'กู้คืนเสร็จแล้ว — ผู้เช่า: ' + tenantsResult.restored + ' คน (รหัส ' + tenantsResult.ids.join(',') + '), ' +
    'บิล: ' + billsResult.restored + ' ใบ (รหัส ' + billsResult.ids.join(',') + '), ' +
    'จดมิเตอร์: ' + meterResult.restored + ' รายการ (รหัส ' + meterResult.ids.join(',') + ')'
  );
}

/* ฟังก์ชันเสริม (ทางเลือก ไม่บังคับรัน) — ลบแถวขยะที่เกิดจากบัคเดิม: ตอนสมัครสมาชิกทดสอบ (test02)
   แอปสร้างอพาร์ทเมนท์ default ชื่อ "อพาร์ทเมนท์ 1" ให้อัตโนมัติ ซึ่งบังเอิญได้ "รหัส"=1 ชนกับ
   "ภาณุภณแมนชั่น" ตัวจริง (เป็นต้นตอที่ทำให้ข้อมูลเชื่อมกันผิดจนบางส่วนหาย) แถวนี้ไม่มีห้อง/ข้อมูล
   อะไรข้างในเลย ลบทิ้งได้อย่างปลอดภัย — ตรวจ 3 เงื่อนไขตรงกันเป๊ะก่อนลบเสมอ (รหัส, ชื่อ, เจ้าของ)
   กันลบผิดแถว ถ้าไม่แน่ใจข้ามฟังก์ชันนี้ไปก็ได้ ไม่กระทบการกู้คืนข้อมูลด้านบน */
function ONE_TIME_removeDuplicateTestProperty() {
  var sheet = getOrCreateSheet_('properties');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('ไม่มีข้อมูลอพาร์ทเมนท์เลย'); return; }
  var values = sheet.getRange(2, 1, lastRow - 1, SHEETS.properties.headers.length).getValues();
  var rowToDelete = -1;
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0]), name = String(values[i][1] || ''), ownerId = String(values[i][7] || '');
    if (id === '1' && name === 'อพาร์ทเมนท์ 1' && ownerId === '3') { rowToDelete = i + 2; break; } // +2: แถวข้อมูลเริ่มที่แถวชีตที่ 2
  }
  if (rowToDelete === -1) { Logger.log('ไม่พบแถวขยะที่ตรงเงื่อนไข — อาจถูกลบไปแล้ว หรือไม่เจอ'); return; }
  sheet.deleteRow(rowToDelete);
  Logger.log('ลบแถวขยะ "อพาร์ทเมนท์ 1" (รหัส=1, เจ้าของ=3) ที่แถวชีตที่ ' + rowToDelete + ' เรียบร้อยแล้ว');
}

/* ============================================================
 * ระบบสำรองข้อมูลอัตโนมัติ (v13)
 * ------------------------------------------------------------
 * คัดลอกทั้งไฟล์สเปรดชีตนี้ (ทุกชีต ทุกบัญชี) ไปเก็บไว้ในโฟลเดอร์ Google Drive ชื่อ
 * BACKUP_FOLDER_NAME (สร้างให้อัตโนมัติถ้ายังไม่มี อยู่ในโฟลเดอร์เดียวกับไฟล์ต้นฉบับ)
 * ทุกๆ BACKUP_INTERVAL_DAYS วัน — ป้องกันเหตุการณ์ข้อมูลหายจากการแก้ไข/migration ผิดพลาด
 *
 * วิธีเริ่มใช้งาน (ทำครั้งเดียว):
 * 1) วางโค้ดทั้งไฟล์นี้ทับ Code.gs แล้ว Deploy > Manage deployments > New version > Deploy
 *    (ขั้นตอนนี้จำเป็นเสมอทุกครั้งที่แก้ .gs — แค่ push ขึ้น GitHub ไม่ทำให้ Apps Script อัปเดตเอง)
 * 2) เปิด Apps Script editor เลือกฟังก์ชัน "SETUP_scheduledBackup" จาก dropdown ด้านบน กด Run
 *    ครั้งแรกจะมีหน้าต่างขอสิทธิ์เข้าถึง Drive — กด "อนุญาต" (Allow) ได้เลย ปลอดภัย ใช้เพื่อสร้าง
 *    ไฟล์สำรองในไดรฟ์ของคุณเองเท่านั้น
 * 3) เสร็จแล้ว — จะได้ไฟล์สำรองชุดแรกทันที (ดูในโฟลเดอร์ Drive ชื่อด้านล่าง) และระบบจะสำรองซ้ำ
 *    ให้อัตโนมัติทุก 15 วันหลังจากนี้ตลอดไป ไม่ต้องทำอะไรเพิ่ม
 *
 * ปลอดภัยที่จะรัน SETUP_scheduledBackup() ซ้ำได้เสมอ (เช่น เผลอกดซ้ำ) — จะลบตัวจับเวลา (trigger)
 * เดิมทิ้งก่อนเสมอ ไม่ทำให้เกิดการสำรองซ้อนสองชุดพร้อมกัน
 * ============================================================ */

var BACKUP_FOLDER_NAME = 'สำรองข้อมูล สมุดหอพัก (อัตโนมัติ)';
var BACKUP_TRIGGER_HANDLER = 'BACKUP_onScheduledRun';
var BACKUP_INTERVAL_DAYS = 15;

/* หาโฟลเดอร์สำรอง ถ้ายังไม่มีให้สร้างใหม่ — วางไว้ในโฟลเดอร์เดียวกับตัวสเปรดชีตต้นฉบับเสมอ
   เพื่อให้หาเจอง่าย (ไม่ใช่ไปกองอยู่ที่ root ของ Drive) */
function BACKUP_getOrCreateFolder_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var file = DriveApp.getFileById(ss.getId());
  var parents = file.getParents();
  var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var existing = parentFolder.getFoldersByName(BACKUP_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  return parentFolder.createFolder(BACKUP_FOLDER_NAME);
}

/* ทำสำเนาไฟล์สเปรดชีตทั้งไฟล์ (ทุกชีต ทุกบัญชี) ไปเก็บในโฟลเดอร์สำรอง
   ตั้งชื่อไฟล์ให้มีวันที่-เวลาติดไปด้วย เพื่อแยกแต่ละชุดออกจากกันชัดเจน */
function BACKUP_runNow_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var folder = BACKUP_getOrCreateFolder_();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd_HHmm');
  var backupName = ss.getName() + ' - สำรอง ' + stamp;
  DriveApp.getFileById(ss.getId()).makeCopy(backupName, folder);
  Logger.log('สำรองข้อมูลสำเร็จ: ' + backupName);
}

/* ฟังก์ชันที่ตัวจับเวลา (time-driven trigger) เรียกอัตโนมัติทุก 15 วัน — ชื่อฟังก์ชันนี้ต้องตรงกับ
   ค่าตัวแปร BACKUP_TRIGGER_HANDLER ด้านบนเป๊ะๆ ไม่งั้นตัวจับเวลาจะหาไม่เจอ */
function BACKUP_onScheduledRun() {
  BACKUP_runNow_();
}

/* รันฟังก์ชันนี้ "ครั้งเดียว" จาก Apps Script editor เพื่อเริ่มระบบสำรองอัตโนมัติ (ดูวิธีด้านบน) —
   จะสำรองข้อมูลชุดแรกทันทีตอนกด Run เลย (ไม่ต้องรอ 15 วัน) แล้วตั้งตัวจับเวลาให้ทำซ้ำทุก 15 วัน
   นับจากตอนนี้ไปเรื่อยๆ โดยอัตโนมัติ */
function SETUP_scheduledBackup() {
  // ลบตัวจับเวลาเดิมที่ผูกกับฟังก์ชันนี้ทิ้งก่อนเสมอ กันตั้งซ้ำถ้ารันฟังก์ชันนี้มากกว่า 1 ครั้ง
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === BACKUP_TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger(BACKUP_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(BACKUP_INTERVAL_DAYS)
    .atHour(3) // สำรองตอนตี 3 (เวลาของสคริปต์) ของทุกรอบ 15 วัน ช่วงที่ไม่มีคนใช้งาน
    .create();
  BACKUP_runNow_(); // สำรองชุดแรกทันที
  Logger.log('ตั้งเวลาสำรองข้อมูลอัตโนมัติทุก ' + BACKUP_INTERVAL_DAYS + ' วันเรียบร้อยแล้ว + สำรองชุดแรกเสร็จแล้ว');
}