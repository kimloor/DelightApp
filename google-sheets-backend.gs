/**
 * สมุดหอพัก — Google Sheets backend
 * (v11: เพิ่มระบบ "ผู้ใช้งาน/login" — ให้หลายคน (หลายเจ้าของหอ) ใช้ Web App ลิงก์เดียวกันได้
 *       โดยแต่ละคนเห็นเฉพาะอพาร์ทเมนท์ของตัวเอง ไม่ทะลุข้ามบัญชี)
 * ------------------------------------------------------------
 * โครงสร้าง (7 ชีต):
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
  properties: { name: 'อพาร์ทเมนท์', headers: ['รหัส','ชื่ออพาร์ทเมนท์','อัตราค่าน้ำ(บาท/หน่วย)','อัตราค่าไฟ(บาท/หน่วย)','ที่อยู่','หมายเหตุท้ายบิล','QR ชำระเงิน (base64)','รหัสเจ้าของ'] },
  rooms:      { name: 'ห้องพัก',     headers: ['รหัส','รหัสอพาร์ทเมนท์','เลขห้อง','ชั้น','ค่าเช่า','สถานะ'] },
  tenants:    { name: 'ผู้เช่า',     headers: ['รหัส','รหัสห้อง','ชื่อผู้เช่า','เบอร์โทร','วันที่เข้าพัก'] },
  bills:      { name: 'บิล',        headers: [
                  'รหัส','รหัสห้อง','เดือน','เลขที่บิล','ค่าเช่า',
                  'เลขมิเตอร์น้ำเดิม','เลขมิเตอร์น้ำปัจจุบัน','ค่าน้ำ',
                  'เลขมิเตอร์ไฟเดิม','เลขมิเตอร์ไฟปัจจุบัน','ค่าไฟ','รวม','สถานะ'
                ] },
  deposits:      { name: 'มัดจำ', headers: ['รหัส','รหัสห้อง','เลขที่ใบรับ','จำนวนเงิน','วันที่รับเงิน','หมายเหตุ'] },
  meterReadings: { name: 'จดมิเตอร์', headers: [
                  'รหัส','รหัสห้อง','รหัสบิลอ้างอิง','เดือน','ประเภท',
                  'เลขเดิม','เลขปัจจุบัน','หน่วยที่ใช้','อัตราต่อหน่วย','ค่าใช้จ่าย','เวลาบันทึก'
                ] }
};

/* คอลัมน์ที่ต้องบังคับเป็น Plain text (@) เสมอ — เฉพาะช่องที่หน้าตาคล้ายตัวเลข/วันที่ ซึ่งเสี่ยงถูก
   Google Sheets แปลงชนิดข้อมูลเองอัตโนมัติ (เลขห้องมีเลขศูนย์นำหน้าได้ เช่น "001", เบอร์โทรไทยขึ้นต้น
   ด้วย 0 เสมอ, เดือน/วันที่เก็บเป็นข้อความรูปแบบ YYYY-MM/YYYY-MM-DD, เวลาบันทึกเป็น ISO timestamp)
   คอลัมน์ "รหัส" (id) ไม่บังคับเป็นข้อความ เพราะเป็นเลขวิ่งธรรมดา ไม่มีเลขศูนย์นำหน้า */
var TEXT_COLUMNS = {
  users:         [2, 3, 4, 6], // username, hash, salt, วันที่สมัคร (เผื่อ username ล้วนตัวเลข)
  rooms:         [3],        // เลขห้อง
  tenants:       [4, 5],     // เบอร์โทร, วันที่เข้าพัก
  bills:         [3],        // เดือน
  deposits:      [5],        // วันที่รับเงิน
  meterReadings: [4, 11]     // เดือน, เวลาบันทึก
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
   แถวเก่าที่ยังไม่เคยมีเจ้าของจะมีช่องนี้ว่าง จนกว่าจะรัน ADMIN_assignAllPropertiesToUser */
function propertyToRow_(p) {
  return [ p.id, p.name || '', Number(p.waterRate) || 0, Number(p.electricRate) || 0, p.address || '', p.notes || '', p.qrImage || '', p.ownerId || '' ];
}
function rowToProperty_(row) {
  return { id: String(row[0]), name: String(row[1] || ''), waterRate: Number(row[2]) || 0, electricRate: Number(row[3]) || 0, address: String(row[4] || ''), notes: String(row[5] || ''), qrImage: String(row[6] || ''), ownerId: String(row[7] || '') };
}

function roomToRow_(r) {
  return [ r.id, r.propertyId, r.number || '', r.floor || '', Number(r.rent) || 0, r.status === 'occupied' ? 'มีผู้เช่า' : 'ว่าง' ];
}
function rowToRoom_(row) {
  return {
    id: String(row[0]), propertyId: String(row[1]), number: String(row[2] || ''),
    floor: String(row[3] || ''), rent: Number(row[4]) || 0,
    status: row[5] === 'มีผู้เช่า' ? 'occupied' : 'vacant'
  };
}

function tenantToRow_(t) {
  return [ t.id, t.roomId, t.name || '', t.phone || '', t.moveIn || '' ];
}
function rowToTenant_(row) {
  return { id: String(row[0]), roomId: String(row[1]), name: String(row[2] || ''), phone: String(row[3] || ''), moveIn: dateCellToText_(row[4], true) };
}

function billToRow_(b) {
  return [
    b.id, b.roomId, b.month, b.invoiceNo || '', Number(b.rent) || 0,
    Number(b.waterPrev) || 0, Number(b.waterCurr) || 0, Number(b.water) || 0,
    Number(b.electricPrev) || 0, Number(b.electricCurr) || 0, Number(b.electric) || 0,
    Number(b.total) || 0, b.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'
  ];
}
function rowToBill_(row) {
  return {
    id: String(row[0]), roomId: String(row[1]), month: dateCellToText_(row[2], false),
    invoiceNo: String(row[3] || ''), rent: Number(row[4]) || 0,
    waterPrev: Number(row[5]) || 0, waterCurr: Number(row[6]) || 0, water: Number(row[7]) || 0,
    electricPrev: Number(row[8]) || 0, electricCurr: Number(row[9]) || 0, electric: Number(row[10]) || 0,
    total: Number(row[11]) || 0, status: row[12] === 'ชำระแล้ว' ? 'paid' : 'unpaid'
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

var CONVERTERS = {
  properties:    { toRow: propertyToRow_,     fromRow: rowToProperty_ },
  rooms:         { toRow: roomToRow_,         fromRow: rowToRoom_ },
  tenants:       { toRow: tenantToRow_,       fromRow: rowToTenant_ },
  bills:         { toRow: billToRow_,         fromRow: rowToBill_ },
  deposits:      { toRow: depositToRow_,      fromRow: rowToDeposit_ },
  meterReadings: { toRow: meterReadingToRow_,  fromRow: rowToMeterReading_ }
};

/* ============================================================
 * ระบบ login / token (v11)
 * ============================================================ */

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

    var auth = verifyToken_(e.parameter && e.parameter.token);
    if (!auth) return jsonOutput_({ error: 'unauthorized' });
    var uid = auth.uid;

    var ownedPropIds = getOwnedPropertyIds_(uid);
    var ownedRoomIds = getOwnedRoomIds_(ownedPropIds);

    // ไม่ส่ง ownerId ออกไปให้ฝั่ง client เห็น (ไม่จำเป็นต้องรู้ ตัดออกก่อนส่ง)
    var properties = readTable_('properties')
      .filter(function (p) { return ownedPropIds[p.id]; })
      .map(function (p) {
        return { id: p.id, name: p.name, waterRate: p.waterRate, electricRate: p.electricRate, address: p.address, notes: p.notes, qrImage: p.qrImage };
      });

    return jsonOutput_({
      properties: properties,
      rooms: readTable_('rooms').filter(function (r) { return ownedPropIds[r.propertyId]; }),
      tenants: readTable_('tenants').filter(function (t) { return ownedRoomIds[t.roomId]; }),
      bills: readTable_('bills').filter(function (b) { return ownedRoomIds[b.roomId]; }),
      deposits: readTable_('deposits').filter(function (d) { return ownedRoomIds[d.roomId]; }),
      meterReadings: readTable_('meterReadings').filter(function (m) { return ownedRoomIds[m.roomId]; })
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

    var auth = verifyToken_(body.token);
    if (!auth) return jsonOutput_({ error: 'unauthorized' });
    var uid = auth.uid;

    var table = body.table;
    if (!SHEETS[table] || table === 'users') throw new Error('unknown table: ' + table);
    var items = body.items || [];

    /* "scoped replace" — เขียนทับเฉพาะแถวที่เป็นของ user นี้ คงแถวของบัญชีอื่นไว้เหมือนเดิมเสมอ
       (ต่างจาก v10 ที่ writeTable_ ลบทั้งชีตแล้วเขียนใหม่ทั้งหมด ซึ่งใช้ไม่ได้แล้วเมื่อมีหลายบัญชี
       ใช้ชีตเดียวกัน — ไม่งั้นบัญชี A save ทีนึงจะลบข้อมูลของบัญชี B ทิ้งหมด) */
    if (table === 'properties') {
      items.forEach(function (p) { p.ownerId = uid; }); // บังคับเจ้าของเสมอ ไม่สนใจค่าที่ client ส่งมา
      var existingProps = readTable_('properties');
      var foreignProps = existingProps.filter(function (p) { return String(p.ownerId) !== String(uid); });
      writeTable_('properties', foreignProps.concat(items));
    } else if (table === 'rooms') {
      var ownedPropIds = getOwnedPropertyIds_(uid);
      var existingRooms = readTable_('rooms');
      var foreignRooms = existingRooms.filter(function (r) { return !ownedPropIds[r.propertyId]; });
      writeTable_('rooms', foreignRooms.concat(items));
    } else {
      // tenants, bills, deposits, meterReadings — ทั้งหมดอ้างอิงผ่าน roomId
      var ownedPropIds2 = getOwnedPropertyIds_(uid);
      var ownedRoomIds = getOwnedRoomIds_(ownedPropIds2);
      var existing = readTable_(table);
      var foreign = existing.filter(function (item) { return !ownedRoomIds[item.roomId]; });
      writeTable_(table, foreign.concat(items));
    }

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
