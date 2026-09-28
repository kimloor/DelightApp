import assert from 'node:assert/strict';

const base = process.env.STAGING_URL;
const username = process.env.SMOKE_USERNAME;
const password = process.env.SMOKE_PASSWORD;

assert.ok(base, 'STAGING_URL is required');
assert.ok(username, 'SMOKE_USERNAME is required');
assert.ok(password, 'SMOKE_PASSWORD is required');

async function post(body) {
  const res = await fetch(base + '/api', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  });
  assert.equal(res.ok, true, 'HTTP '+res.status);
  return await res.json();
}

const login = await post({action:'login', username, password});
assert.equal(login.success, true, JSON.stringify(login));
assert.ok(login.token);
const token = login.token;

const scoped = await post({action:'getAdminScoped', token});
assert.equal(scoped.success, true, JSON.stringify(scoped));
assert.ok((scoped.properties||[]).some(p=>String(p.id)==='smoke-property'));

const rows = [
  {
    sourcePage:1, roomNumber:'101', matchedRoomId:'smoke-room-101',
    sourceDocumentNo:'8765', sourceBillDate:'2026-07-28', sourcePrintedAt:'2026-09-11T14:04:47', billingMonth:'2026-07',
    roomRentNet:2700, furnitureNet:747.66, furnitureVat:52.34, furnitureGross:800, transformedRent:3500,
    waterPrev:532, waterCurr:535, waterUnits:3, waterRate:30, waterCharge:90, waterRecordedAt:'2026-07-27',
    electricPrev:9127, electricCurr:9163.08, electricUnits:36.08, electricRate:8, electricCharge:288.64, electricRecordedAt:'2026-07-28',
    sourceVatSubtotal:3826.30, sourceVatAmount:78.84, calculatedTotal:3905.14, sourceTotal:3905, roundingAdjustment:-0.14,
    validationStatus:'ready', validationMessage:'ready', rawText:'smoke room 101'
  },
  {
    sourcePage:2, roomNumber:'102', matchedRoomId:'smoke-room-102',
    sourceDocumentNo:'8766', sourceBillDate:'2026-07-28', sourcePrintedAt:'2026-09-11T14:04:47', billingMonth:'2026-07',
    roomRentNet:2200, furnitureNet:747.66, furnitureVat:52.34, furnitureGross:800, transformedRent:3000,
    waterPrev:760, waterCurr:763, waterUnits:3, waterRate:30, waterCharge:90, waterRecordedAt:'2026-07-27',
    electricPrev:10965.89, electricCurr:11052.71, electricUnits:86.82, electricRate:8, electricCharge:694.56, electricRecordedAt:'2026-07-28',
    sourceVatSubtotal:3732.22, sourceVatAmount:107.26, calculatedTotal:3839.48, sourceTotal:3839, roundingAdjustment:-0.48,
    validationStatus:'ready', validationMessage:'ready', rawText:'smoke room 102'
  }
];

const first = await post({
  action:'commitBillImport', token, propertyId:'smoke-property',
  sourceFilename:'legacy-smoke.pdf',
  sourceFileHash:'smoke-file-hash-v1',
  sourceFormat:'legacy_pdf_v1',
  rows
});
assert.equal(first.success, true, JSON.stringify(first));
assert.deepEqual(first.summary, {total:2, imported:2, skipped:0, errors:0});
assert.equal(first.bills.length, 2);
assert.equal(first.meterReadings.length, 4);

const b101 = first.bills.find(b=>String(b.roomId)==='smoke-room-101');
const b102 = first.bills.find(b=>String(b.roomId)==='smoke-room-102');
assert.equal(b101.rent,3500);
assert.equal(b101.total,3905);
assert.equal(b101.vatAmount,78.84);
assert.equal(b101.calculationMode,'source_snapshot');
assert.equal(b101.sourceDocumentNo,'8765');

assert.equal(b102.rent,3000);
assert.equal(b102.total,3839);
assert.equal(b102.vatAmount,107.26);
assert.equal(b102.calculationMode,'source_snapshot');

const second = await post({
  action:'commitBillImport', token, propertyId:'smoke-property',
  sourceFilename:'legacy-smoke.pdf',
  sourceFileHash:'smoke-file-hash-v1',
  sourceFormat:'legacy_pdf_v1',
  rows
});
assert.equal(second.error,'import_file_already_confirmed', JSON.stringify(second));

const after = await post({action:'getAdminScoped', token});
const imported = (after.bills||[]).filter(b=>['8765','8766'].includes(String(b.sourceDocumentNo||'')));
assert.equal(imported.length,2);

console.log('api_import_smoke=PASS');
