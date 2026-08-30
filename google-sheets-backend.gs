/**
 * สมุดหอพัก — Google Sheets backend
 * (v10: เปลี่ยนมาใช้ "รหัส" (id) ตัวเลขวิ่งเป็น primary key ของทุกตาราง แทนการอิง
 *       ชื่ออพาร์ทเมนท์/เลขห้องเป็นตัวเชื่อมข้อมูล — เพราะอันนั้นคือต้นตอที่ทำให้ห้อง/ผู้เช่า/บิล
 *       เชื่อมกันผิดคู่ได้เวลาไปเจอชื่อซ้ำ หรือกรณี id ที่แอปสร้างเป็นเลขวิ่งอยู่แล้วภายใน)
 * ------------------------------------------------------------
 * โครงสร้างใหม่ (6 ชีต เชื่อมกันด้วย "รหัส" เท่านั้น):
 *
 *   อพาร์ทเมนท์ : รหัส | ชื่ออพาร์ทเมนท์ | อัตราค่าน้ำ | อัตราค่าไฟ | ที่อยู่ | หมายเหตุท้ายบิล | QR
 *   ห้องพัก     : รหัส | รหัสอพาร์ทเมนท์ | เลขห้อง | ชั้น | ค่าเช่า | สถานะ
 *   ผู้เช่า     : รหัส | รหัสห้อง | ชื่อผู้เช่า | เบอร์โทร | วันที่เข้าพัก
 *   บิล        : รหัส | รหัสห้อง | เดือน | เลขที่บิล | ค่าเช่า | เลขมิเตอร์น้ำเดิม | เลขมิเตอร์น้ำปัจจุบัน |
 *                ค่าน้ำ | เลขมิเตอร์ไฟเดิม | เลขมิเตอร์ไฟปัจจุบัน | ค่าไฟ | รวม | สถานะ
 *   มัดจำ       : รหัส | รหัสห้อง | เลขที่ใบรับ | จำนวนเงิน | วันที่รับเงิน | หมายเหตุ
 *   จดมิเตอร์   : รหัส | รหัสห้อง | รหัสบิลอ้างอิง | เดือน | ประเภท | เลขเดิม | เลขปัจจุบัน |
 *                หน่วยที่ใช้ | อัตราต่อหน่วย | ค่าใช้จ่าย | เวลาบันทึก
 *
 * ทำไมเปลี่ยน: ตัวแอปหน้าบ้าน (index.html) มีขั้นตอน migrateNumericIds() ที่แปลง id ของทุกอย่าง
 * (อพาร์ทเมนท์/ห้อง/ผู้เช่า/บิล) ให้เป็นเลขวิ่งง่ายๆ อยู่แล้วในตัวมันเอง แต่ backend เวอร์ชันก่อนหน้า
 * (v9 และเก่ากว่า) ยังผูกข้อมูลด้วยชื่ออพาร์ทเมนท์/เลขห้องแทน id จริง ทำให้เวลาข้อมูลไป-กลับผ่าน Sheets
 * รหัสเชื่อมโยงไม่ตรงกับที่แอปคาดหวัง เสี่ยงห้อง/ผู้เช่า/บิลจับคู่ผิดกัน โดยเฉพาะถ้ามีชื่อ/เลขห้องซ้ำ
 * v10 นี้แก้ให้ backend ใช้ระบบ id เดียวกับที่แอปใช้จริงภายใน ตรงไปตรงมา ไม่ต้องแปลงกลับไปกลับมา
 *
 * วิธีติดตั้ง (ครั้งแรกหลังอัปเกรดจาก v9/v8 ที่มีข้อมูลอยู่แล้วในชื่อ-อิงคีย์เดิม):
 * 1) วางโค้ดนี้ทับ Code.gs ทั้งหมด
 * 2) รันฟังก์ชัน ONE_TIME_migrateFromEnglishSheets ครั้งเดียว (เลือกฟังก์ชันนี้จาก dropdown ด้านบน
 *    ของ Apps Script editor แล้วกด Run) — ฟังก์ชันนี้จะหาชีตต้นฉบับที่มีหัวตารางภาษาอังกฤษ
 *    (id, name, waterRate, ... เป็นต้น) แล้วย้ายข้อมูลมาเขียนใหม่ในชีตภาษาไทยให้ถูกต้อง
 *    จากนั้นลบชีตต้นฉบับภาษาอังกฤษทิ้งให้อัตโนมัติ
 * 3) ถ้าไม่เคยมีชีตภาษาอังกฤษเลย (ติดตั้งใหม่ตั้งแต่ต้น) ข้ามขั้นตอนนี้ได้ ไม่ต้องรัน
 * 4) Deploy > Manage deployments > แก้ไข (ดินสอ) > Version: New version > Deploy
 */

var SHEETS = {
  properties: { name: 'อพาร์ทเมนท์', headers: ['รหัส','ชื่ออพาร์ทเมนท์','อัตราค่าน้ำ(บาท/หน่วย)','อัตราค่าไฟ(บาท/หน่วย)','ที่อยู่','หมายเหตุท้ายบิล','QR ชำระเงิน (base64)'] },
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

function propertyToRow_(p) {
  return [ p.id, p.name || '', Number(p.waterRate) || 0, Number(p.electricRate) || 0, p.address || '', p.notes || '', p.qrImage || '' ];
}
function rowToProperty_(row) {
  return { id: String(row[0]), name: String(row[1] || ''), waterRate: Number(row[2]) || 0, electricRate: Number(row[3]) || 0, address: String(row[4] || ''), notes: String(row[5] || ''), qrImage: String(row[6] || '') };
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
      bills: readTable_('bills'),
      deposits: readTable_('deposits'),
      meterReadings: readTable_('meterReadings')
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

  // properties: id, name, waterRate, electricRate, address, notes, qrImage  (ตรงกับ schema ใหม่พอดี)
  var propOut = propRows.map(function (r) {
    return [ r[0], r[1], Number(r[2]) || 0, Number(r[3]) || 0, r[4] || '', r[5] || '', r[6] || '' ];
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
