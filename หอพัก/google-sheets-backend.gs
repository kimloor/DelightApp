/**
 * สมุดหอพัก — Google Sheets backend (v8: กันเบอร์โทร/เลขห้องไม่ให้ถูกแปลงเป็นตัวเลข)
 * ------------------------------------------------------------
 * เก็บข้อมูลเป็น 4 ชีตแยกกัน เชื่อมโยงกันด้วย "อพาร์ทเมนท์" + "เลขห้อง":
 *
 *   อพาร์ทเมนท์ : ชื่ออพาร์ทเมนท์ | อัตราค่าน้ำ(บาท/หน่วย) | อัตราค่าไฟ(บาท/หน่วย) | ที่อยู่ | หมายเหตุท้ายบิล | QR ชำระเงิน (base64)
 *   ห้องพัก     : อพาร์ทเมนท์ | เลขห้อง | ชั้น | ค่าเช่า | สถานะ
 *   ผู้เช่า     : อพาร์ทเมนท์ | เลขห้อง | ชื่อผู้เช่า | เบอร์โทร | วันที่เข้าพัก
 *   บิล        : อพาร์ทเมนท์ | เลขห้อง | เดือน | ค่าเช่า |
 *                เลขมิเตอร์น้ำเดิม | เลขมิเตอร์น้ำปัจจุบัน | ค่าน้ำ |
 *                เลขมิเตอร์ไฟเดิม | เลขมิเตอร์ไฟปัจจุบัน | ค่าไฟ | รวม | สถานะ
 *
 * วางโค้ดนี้ทับไฟล์ Code.gs ทั้งหมด แล้ว Deploy ใหม่เป็น Web App
 * (Deploy > Manage deployments > แก้ไข > Version: New version > Deploy)
 * ลิงก์ /exec เดิมจะยังใช้ได้เหมือนเดิม ไม่ต้องตั้งค่าใหม่ในแอป
 *
 * หมายเหตุการอัปเกรดจาก v7 → v8 (สำคัญ):
 * ขยายการป้องกันจาก v6/v7 (คอลัมน์ "เดือน" และ "วันที่เข้าพัก") ให้ครอบคลุมคอลัมน์
 * "เลขห้อง" (ทุกชีต, เผื่อมีเลขศูนย์นำหน้าเช่น "001") และ "เบอร์โทร" ด้วย เพราะเบอร์มือถือไทย
 * ขึ้นต้นด้วย 0 เสมอ (เช่น "0812345678") — ถ้าไม่บังคับเป็น Plain text คอลัมน์เหล่านี้จะเสี่ยงถูก
 * Google Sheets แปลงเป็นตัวเลขเอง ทำให้เลข 0 หน้าเบอร์หายไป ⚠️ ถ้าเบอร์โทร/เลขห้องแถวไหน
 * เพี้ยนไปแล้วก่อนหน้านี้ ต้องพิมพ์ทับด้วยมือให้ถูกต้องหลัง Deploy เวอร์ชันนี้ (กู้เลข 0 ที่หายคืนอัตโนมัติไม่ได้)
 * ตั้งใจไม่แตะช่องตัวเลขล้วน (ค่าเช่า/อัตราค่าน้ำ-ไฟ/เลขมิเตอร์/ยอดรวม) เพราะไม่มีความเสี่ยง
 * และเก็บเป็นตัวเลขจริงไว้จะเปิดดู/รวมยอดในหน้า Sheets เองได้สะดวกกว่า
 */

var SHEETS = {
  properties: { name: 'อพาร์ทเมนท์', headers: ['ชื่ออพาร์ทเมนท์', 'อัตราค่าน้ำ(บาท/หน่วย)', 'อัตราค่าไฟ(บาท/หน่วย)', 'ที่อยู่', 'หมายเหตุท้ายบิล', 'QR ชำระเงิน (base64)'] },
  rooms:      { name: 'ห้องพัก',     headers: ['อพาร์ทเมนท์','เลขห้อง','ชั้น','ค่าเช่า','สถานะ'] },
  tenants:    { name: 'ผู้เช่า',     headers: ['อพาร์ทเมนท์','เลขห้อง','ชื่อผู้เช่า','เบอร์โทร','วันที่เข้าพัก'] },
  bills:      { name: 'บิล',        headers: [
                  'อพาร์ทเมนท์','เลขห้อง','เดือน','ค่าเช่า',
                  'เลขมิเตอร์น้ำเดิม','เลขมิเตอร์น้ำปัจจุบัน','ค่าน้ำ',
                  'เลขมิเตอร์ไฟเดิม','เลขมิเตอร์ไฟปัจจุบัน','ค่าไฟ',
                  'รวม','สถานะ'
                ] }
};

/* คอลัมน์ที่ต้องบังคับเป็น Plain text (@) เสมอ ก่อนเขียนค่า — เฉพาะช่องที่เป็น "ข้อความ/รหัส"
   ที่หน้าตาคล้ายตัวเลขหรือวันที่ ซึ่งเสี่ยงถูก Google Sheets แปลงชนิดข้อมูลเองอัตโนมัติ:
     - เลขห้อง: เผื่อมีเลขศูนย์นำหน้า เช่น "001" (ไม่งั้นจะโดนตัดเหลือ "1")
     - เบอร์โทร: เบอร์มือถือไทยขึ้นต้นด้วย 0 เสมอ เช่น "0812345678"
       (ไม่งั้นจะโดนแปลงเป็นตัวเลขแล้วตัดเลข 0 หน้าทิ้ง กลายเป็นเบอร์ผิด)
     - เดือน / วันที่เข้าพัก: หน้าตาคล้ายวันที่ เช่น "2569-07", "2569-07-13"
   ช่องตัวเลขล้วน ๆ (ค่าเช่า, อัตราค่าน้ำ/ไฟ, เลขมิเตอร์, ยอดรวม ฯลฯ) ตั้งใจ "ไม่" บังคับเป็นข้อความ
   เพราะไม่มีความเสี่ยงข้อมูลเพี้ยน และเก็บเป็นตัวเลขจริงจะเปิดดู/รวมยอดในหน้า Sheets เองได้สะดวกกว่า */
var TEXT_COLUMNS = {
  rooms:    [2],        // เลขห้อง
  tenants:  [2, 4, 5],  // เลขห้อง, เบอร์โทร, วันที่เข้าพัก
  bills:    [2, 3]      // เลขห้อง, เดือน
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
    // ปรับหัวตารางให้ตรงกับ schema ปัจจุบันเสมอ (ไม่แตะข้อมูลแถวอื่น)
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

/* ---- แปลงระหว่างข้อมูลภายในแอป (ภาษาอังกฤษ) กับแถวในชีต (ภาษาไทย) ---- */

function propertyToRow_(p) {
  return [ p.name, Number(p.waterRate) || 0, Number(p.electricRate) || 0, p.address || '', p.notes || '', p.qrImage || '' ];
}
function rowToProperty_(row) {
  var name = String(row[0]);
  return { id: name, name: name, waterRate: Number(row[1]) || 0, electricRate: Number(row[2]) || 0, address: String(row[3] || ''), notes: String(row[4] || ''), qrImage: String(row[5] || '') };
}

function roomToRow_(r) {
  return [ r.propertyId, r.number, r.floor || '', Number(r.rent) || 0, r.status === 'occupied' ? 'มีผู้เช่า' : 'ว่าง' ];
}
function rowToRoom_(row) {
  var propertyId = String(row[0]);
  var number = String(row[1]);
  var id = propertyId + '::' + number;
  return {
    id: id, propertyId: propertyId, number: number,
    floor: String(row[2] || ''),
    rent: Number(row[3]) || 0,
    status: row[4] === 'มีผู้เช่า' ? 'occupied' : 'vacant'
  };
}

function splitRoomId_(roomId) {
  var idx = roomId.indexOf('::');
  if (idx === -1) return { propertyId: '', number: roomId };
  return { propertyId: roomId.substring(0, idx), number: roomId.substring(idx + 2) };
}

function tenantToRow_(t) {
  var parts = splitRoomId_(t.roomId);
  return [ parts.propertyId, parts.number, t.name || '', t.phone || '', t.moveIn || '' ];
}
function rowToTenant_(row) {
  var propertyId = String(row[0]), number = String(row[1]);
  var roomId = propertyId + '::' + number;
  return { id: roomId, roomId: roomId, name: String(row[2] || ''), phone: String(row[3] || ''), moveIn: dateCellToText_(row[4], true) };
}

function billToRow_(b) {
  var parts = splitRoomId_(b.roomId);
  return [
    parts.propertyId, parts.number, b.month, Number(b.rent) || 0,
    Number(b.waterPrev) || 0, Number(b.waterCurr) || 0, Number(b.water) || 0,
    Number(b.electricPrev) || 0, Number(b.electricCurr) || 0, Number(b.electric) || 0,
    Number(b.total) || 0, b.status === 'paid' ? 'ชำระแล้ว' : 'ค้างชำระ'
  ];
}
function dateCellToText_(v, withDay) {
  // เผื่อกรณีข้อมูลเก่าที่เคยถูก Sheets แปลงเป็นวันที่ไปแล้วก่อนจะแก้ไขปัญหานี้
  // ให้แปลงกลับเป็นข้อความ "YYYY-MM" หรือ "YYYY-MM-DD" แทนที่จะปล่อยเป็นค่าวันที่เพี้ยน ๆ
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var y = v.getFullYear();
    var m = String(v.getMonth() + 1); if (m.length < 2) m = '0' + m;
    if (!withDay) return y + '-' + m;
    var d = String(v.getDate()); if (d.length < 2) d = '0' + d;
    return y + '-' + m + '-' + d;
  }
  return String(v || '');
}

function rowToBill_(row) {
  var propertyId = String(row[0]), number = String(row[1]);
  var roomId = propertyId + '::' + number;
  var month = dateCellToText_(row[2], false);
  return {
    id: roomId + '::' + month, roomId: roomId, month: month,
    rent: Number(row[3]) || 0,
    waterPrev: Number(row[4]) || 0, waterCurr: Number(row[5]) || 0, water: Number(row[6]) || 0,
    electricPrev: Number(row[7]) || 0, electricCurr: Number(row[8]) || 0, electric: Number(row[9]) || 0,
    total: Number(row[10]) || 0, status: row[11] === 'ชำระแล้ว' ? 'paid' : 'unpaid'
  };
}

var CONVERTERS = {
  properties: { toRow: propertyToRow_, fromRow: rowToProperty_ },
  rooms:      { toRow: roomToRow_,     fromRow: rowToRoom_ },
  tenants:    { toRow: tenantToRow_,   fromRow: rowToTenant_ },
  bills:      { toRow: billToRow_,     fromRow: rowToBill_ }
};

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
    return jsonOutput_({
      properties: readTable_('properties'),
      rooms: readTable_('rooms'),
      tenants: readTable_('tenants'),
      bills: readTable_('bills')
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
    var table = body.table;
    if (!SHEETS[table]) throw new Error('unknown table: ' + table);
    writeTable_(table, body.items || []);
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
