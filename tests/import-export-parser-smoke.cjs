const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('หอพัก/import-export.js', 'utf8');
const rooms = [{id:'r101',number:'101'},{id:'r102',number:'102'}];
const sandbox = {
  console,
  currentPropertyId:'smoke-property',
  currentRooms:()=>rooms,
  currentBills:()=>[],
  Set, Map, Math, Number, String, Array, Object, RegExp, Date, Intl, Promise,
  crypto: globalThis.crypto,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const pages = [
  [
    'ใบแจ้งหนี้ / ใบเสร็จรับเงิน','เลขทะเบียนการค้า','101','เลขที่','8765',
    'วันที่','28/07/2026','รอบ/ปี','7/2569',
    'ค่าเช่าเฟอร์นิเจอร์','1.00','747.66','747.66',
    'ค่าเช่าห้องพัก','1.00','2,700.00','2,700.00',
    'ค่าไฟฟ้า (9127.00-9163.08 :: 28/06/2026-28/07/2026)','36.08','8.00','288.64','1.00',
    'ค่าน้ำ (532.00-535.00 :: 28/06/2026-27/07/2026)','3.00','30.00','90.00','1.00',
    '3,826.30','78.84','3,905.00','รวมมูลค่า','ภาษีมูลค่าเพิ่ม  7%','รวมเงินที่ต้องชำระทั้งสิ้น',
    'พิมพ์เมื่อ   11/09/2026 14:04:47'
  ],
  [
    'ใบแจ้งหนี้ / ใบเสร็จรับเงิน','เลขทะเบียนการค้า','102','เลขที่','8766',
    'วันที่','28/07/2026','รอบ/ปี','7/2569',
    'ค่าเช่าเฟอร์นิเจอร์','1.00','747.66','747.66',
    'ค่าเช่าห้องพัก','1.00','2,200.00','2,200.00',
    'ค่าไฟฟ้า','(10965.89-11052.71 ::','28/06/2026-28/07/2026)','86.82','8.00','694.56','1.00',
    'ค่าน้ำ','(760.00-763.00 ::','28/06/2026-27/07/2026)','3.00','30.00','90.00','1.00',
    '3,732.22','107.26','3,839.00','รวมมูลค่า','ภาษีมูลค่าเพิ่ม  7%','รวมเงินที่ต้องชำระทั้งสิ้น',
    'พิมพ์เมื่อ   11/09/2026 14:04:47'
  ]
];

const rows = pages.map((p,i)=>sandbox.parseLegacyBillPage(p,i+1));

assert.equal(rows[0].roomNumber,'101');
assert.equal(rows[0].billingMonth,'2026-07');
assert.equal(rows[0].transformedRent,3500);
assert.equal(rows[0].waterCharge,90);
assert.equal(rows[0].electricCharge,288.64);
assert.equal(rows[0].sourceVatAmount,78.84);
assert.equal(rows[0].sourceTotal,3905);
assert.equal(rows[0].validationStatus,'ready');

assert.equal(rows[1].roomNumber,'102');
assert.equal(rows[1].transformedRent,3000);
assert.equal(rows[1].waterPrev,760);
assert.equal(rows[1].waterCurr,763);
assert.equal(rows[1].electricPrev,10965.89);
assert.equal(rows[1].electricCurr,11052.71);
assert.equal(rows[1].electricCharge,694.56);
assert.equal(rows[1].sourceVatAmount,107.26);
assert.equal(rows[1].sourceTotal,3839);
assert.equal(rows[1].validationStatus,'ready');

console.log('parser_smoke=PASS', rows.map(r=>({
  room:r.roomNumber,
  rent:r.transformedRent,
  water:r.waterCharge,
  electric:r.electricCharge,
  vat:r.sourceVatAmount,
  total:r.sourceTotal,
  status:r.validationStatus
})));
