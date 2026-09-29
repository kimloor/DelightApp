const importState={propertyId:null,file:null,fileName:'',fileHash:'',rows:[],selected:new Set(),busy:false,message:'',result:null};
function ieNum(v){ return Math.round((Number(v)||0)*100)/100; }
function ieMoney(v){ return Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function ieToken(v){
  const x=String(v==null?'':v).replace(/,/g,'').trim();
  return /^-?\d+(?:\.\d+)?$/.test(x)?Number(x):null;
}
function ieDate(v){
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v||'').trim());
  return m?`${m[3]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`:'';
}
function ieMonth(v){
  const m=/^(\d{1,2})\/(\d{4})$/.exec(String(v||'').trim());
  if(!m) return '';
  let y=Number(m[2]); if(y>=2400)y-=543;
  const mo=Number(m[1]); return mo>=1&&mo<=12?`${y}-${String(mo).padStart(2,'0')}`:'';
}
function ieAfter(a,label,re){
  const k=a.findIndex(x=>String(x).trim()===label); if(k<0)return '';
  for(let i=k+1;i<Math.min(a.length,k+8);i++){ const m=re.exec(String(a[i]).trim()); re.lastIndex=0; if(m)return m[1]||m[0]; }
  return '';
}
function ieNums(a,label,max){
  const k=a.findIndex(x=>String(x).trim().startsWith(label)); if(k<0)return [];
  const stop=['ค่าเช่าเฟอร์นิเจอร์','ค่าเช่าห้องพัก','ค่าไฟฟ้า','ค่าน้ำ'], out=[];
  for(let i=k+1;i<a.length&&out.length<max;i++){
    const s=String(a[i]).trim(); if(stop.some(x=>s.startsWith(x)))break;
    const n=ieToken(s); if(n!=null)out.push(n);
  }
  return out;
}
function ieMeter(s){
  const m=/\(([\d,.]+)-([\d,.]+)\s*::\s*(\d{1,2}\/\d{1,2}\/\d{4})-(\d{1,2}\/\d{1,2}\/\d{4})\)/.exec(String(s||''));
  return m?{prev:Number(m[1].replace(/,/g,''))||0,curr:Number(m[2].replace(/,/g,''))||0,start:ieDate(m[3]),end:ieDate(m[4])}:{prev:0,curr:0,start:'',end:''};
}
function ieReset(){
  if(importState.propertyId===currentPropertyId)return;
  Object.assign(importState,{propertyId:currentPropertyId,file:null,fileName:'',fileHash:'',rows:[],selected:new Set(),busy:false,message:'',result:null});
  renderImportExport._batches=null; renderImportExport._batchProperty=null;
}
function parseLegacyBillPage(items,pageNo){
  const a=items.map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(Boolean), raw=a.join('\n');
  const roomNumber=ieAfter(a,'เลขทะเบียนการค้า',/^([A-Za-z0-9._/-]+)$/);
  const sourceDocumentNo=ieAfter(a,'เลขที่',/^([A-Za-z0-9._/-]+)$/);
  const sourceBillDate=ieDate(ieAfter(a,'วันที่',/^(\d{1,2}\/\d{1,2}\/\d{4})$/));
  const billingMonth=ieMonth(ieAfter(a,'รอบ/ปี',/^(\d{1,2}\/\d{4})$/));
  const f=ieNums(a,'ค่าเช่าเฟอร์นิเจอร์',3), r=ieNums(a,'ค่าเช่าห้องพัก',3), e=ieNums(a,'ค่าไฟฟ้า',4), w=ieNums(a,'ค่าน้ำ',4);
  const furnitureNet=ieNum(f.length>=3?f[2]:(f.at(-1)||0)), roomRentNet=ieNum(r.length>=3?r[2]:(r.at(-1)||0));
  const meterChunk=label=>{const k=a.findIndex(x=>String(x).startsWith(label));return k>=0?a.slice(k,k+8).join(' '):'';};
  const em=ieMeter(meterChunk('ค่าไฟฟ้า')), wm=ieMeter(meterChunk('ค่าน้ำ'));
  const electricUnits=ieNum(e[0]||Math.max(em.curr-em.prev,0)), electricRate=ieNum(e[1]||0), electricCharge=ieNum(e[2]||0);
  const waterUnits=ieNum(w[0]||Math.max(wm.curr-wm.prev,0)), waterRate=ieNum(w[1]||0), waterCharge=ieNum(w[2]||0);
  const t=a.findIndex(x=>x==='รวมมูลค่า'), tail=[];
  if(t>=0)for(let i=t-1;i>=0&&tail.length<3;i--){const n=ieToken(a[i]);if(n!=null)tail.push(n);}
  tail.reverse();
  const sourceVatSubtotal=ieNum(tail[0]||0), sourceVatAmount=ieNum(tail[1]||0), sourceTotal=ieNum(tail[2]||0);
  const vm=/ภาษีมูลค่าเพิ่ม\s*(\d+(?:\.\d+)?)%/.exec(raw), vatRate=vm?Number(vm[1]):7;
  const furnitureVat=ieNum(furnitureNet*vatRate/100), furnitureGross=ieNum(furnitureNet+furnitureVat), transformedRent=ieNum(roomRentNet+furnitureGross);
  const calculatedTotal=ieNum(sourceVatSubtotal+sourceVatAmount);
  const pm=/พิมพ์เมื่อ\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2}:\d{2})/.exec(raw), sourcePrintedAt=pm?ieDate(pm[1])+'T'+pm[2]:'';
  const room=currentRooms().find(x=>String(x.number).trim()===roomNumber), missing=[];
  if(!roomNumber)missing.push('เลขห้อง'); if(!sourceDocumentNo)missing.push('เลขเอกสาร'); if(!sourceBillDate)missing.push('วันที่');
  if(!billingMonth)missing.push('รอบบิล'); if(!sourceTotal)missing.push('ยอดรวม');
  let validationStatus='ready',validationMessage='พร้อมนำเข้า';
  if(missing.length){validationStatus='error';validationMessage='อ่านไม่ครบ: '+missing.join(', ');}
  else if(!room){validationStatus='error';validationMessage='ไม่พบห้อง '+roomNumber;}
  else if(currentBills().some(b=>String(b.roomId)===String(room.id)&&b.month===billingMonth) || currentBills().some(b=>String(b.sourceDocumentNo||b.taxInvoiceNo||'')===sourceDocumentNo)){
    validationStatus='duplicate';validationMessage='มีบิลเดือนนี้หรือเลขเอกสารนี้แล้ว';
  }else{
    const q=[];
    if(Math.abs((wm.curr-wm.prev)-waterUnits)>.02)q.push('หน่วยน้ำ');
    if(Math.abs((em.curr-em.prev)-electricUnits)>.02)q.push('หน่วยไฟ');
    if(Math.abs(ieNum(waterUnits*waterRate)-waterCharge)>.05)q.push('ยอดน้ำ');
    if(Math.abs(ieNum(electricUnits*electricRate)-electricCharge)>.05)q.push('ยอดไฟ');
    const expectedVat=ieNum((furnitureNet+waterCharge+electricCharge)*vatRate/100);
    if(Math.abs(expectedVat-sourceVatAmount)>.05)q.push('VAT');
    if(Math.round(calculatedTotal)!==Math.round(sourceTotal)&&Math.abs(calculatedTotal-sourceTotal)>.01)q.push('ยอดรวม');
    if(q.length){validationStatus='review';validationMessage='ตรวจสอบ: '+q.join(', ');}
  }
  return {sourcePage:pageNo,roomNumber,matchedRoomId:room?room.id:'',sourceDocumentNo,sourceBillDate,sourcePrintedAt,billingMonth,
    roomRentNet,furnitureNet,furnitureVat,furnitureGross,transformedRent,
    waterPrev:wm.prev,waterCurr:wm.curr,waterUnits,waterRate,waterCharge,waterRecordedAt:wm.end,
    electricPrev:em.prev,electricCurr:em.curr,electricUnits,electricRate,electricCharge,electricRecordedAt:em.end,
    sourceVatSubtotal,sourceVatAmount,calculatedTotal,sourceTotal,roundingAdjustment:ieNum(sourceTotal-calculatedTotal),
    validationStatus,validationMessage,rawText:raw};
}
async function ieHash(file){
  const b=await file.arrayBuffer(),d=await crypto.subtle.digest('SHA-256',b);
  return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function parseImportPdf(file){
  ieReset(); importState.busy=true; importState.message='กำลังอ่านไฟล์…'; importState.rows=[]; importState.selected=new Set(); render();
  try{
    if(!window.pdfjsLib)throw new Error('PDF library unavailable');
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    importState.file=file; importState.fileName=file.name||''; importState.fileHash=await ieHash(file);
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise, rows=[];
    if(pdf.numPages>500)throw new Error('ไฟล์เกิน 500 หน้า');
    for(let p=1;p<=pdf.numPages;p++){
      importState.message=`กำลังอ่านหน้า ${p}/${pdf.numPages}…`; const el=document.getElementById('importProgress'); if(el)el.textContent=importState.message;
      const tc=await (await pdf.getPage(p)).getTextContent();
      rows.push(parseLegacyBillPage((tc.items||[]).map(x=>x.str),p));
    }
    importState.rows=rows; importState.selected=new Set(rows.filter(x=>x.validationStatus==='ready').map(x=>String(x.sourcePage))); importState.message=`อ่านสำเร็จ ${rows.length} หน้า`;
  }finally{importState.busy=false;render();}
}
function iePill(r){
  const m={ready:['✅ พร้อม','io-ready'],review:['⚠️ ตรวจ','io-review'],duplicate:['⏭ ซ้ำ','io-dup'],error:['❌ ผิดพลาด','io-error']}[r.validationStatus]||['?','io-error'];
  return `<span class="io-pill ${m[1]}" title="${escapeAuthHtml(r.validationMessage||'')}">${m[0]}</span>`;
}
function renderImportPane(){
  ieReset();
  const rows=importState.rows;
  const ready=rows.filter(r=>r.validationStatus==='ready');
  const selected=ready.filter(r=>importState.selected.has(String(r.sourcePage)));
  const batches=renderImportExport._batchProperty===currentPropertyId?renderImportExport._batches:null;

  const historyHtml=batches===null
    ? '<div class="io-history-empty">กำลังโหลด…</div>'
    : (batches||[]).length
      ? `<div class="io-history-list">${batches.map(b=>`<div class="io-history-item"><div><strong>${escapeAuthHtml(b.sourceFilename||'-')}</strong><span>${escapeAuthHtml(b.status||'')}</span></div><b>${b.importedRows}/${b.totalRows}</b></div>`).join('')}</div>`
      : '<div class="io-history-empty">ยังไม่มีประวัติการนำเข้า</div>';

  return `<div class="io-grid">
    <section class="card io-panel">
      <div class="card-head io-panel-head"><div><h3>Import บิลย้อนหลังจาก PDF</h3><p class="sub">ตรวจข้อมูลก่อนยืนยันทุกครั้ง</p></div></div>
      <div class="io-panel-body">
        <div class="io-import-note">
          <span>หอพัก</span>
          <strong>${escapeAuthHtml((currentProperty()||{}).name||'-')}</strong>
          <p>ระบบจะรวม ค่าเช่าห้อง + ค่าเฟอร์นิเจอร์ + VAT เฟอร์นิเจอร์ เป็นค่าห้อง ก่อนบันทึกลงฐานข้อมูล</p>
        </div>
        <label class="io-file-picker">
          <span class="io-file-title">เลือกไฟล์ PDF</span>
          <input id="importPdfFile" type="file" accept=".pdf,application/pdf" ${importState.busy?'disabled':''}>
        </label>
        <p id="importProgress" class="io-helper">${escapeAuthHtml(importState.message||'ยังไม่ได้เลือกไฟล์')}</p>

        ${rows.length?`
          <div class="io-summary">
            <span>พร้อม <b>${ready.length}</b></span>
            <span>ตรวจ <b>${rows.filter(r=>r.validationStatus==='review').length}</b></span>
            <span>ซ้ำ <b>${rows.filter(r=>r.validationStatus==='duplicate').length}</b></span>
            <span>ผิดพลาด <b>${rows.filter(r=>r.validationStatus==='error').length}</b></span>
          </div>
          <div class="io-table"><table>
            <thead><tr><th><input id="importAll" type="checkbox" ${selected.length===ready.length&&ready.length?'checked':''}></th><th>หน้า</th><th>ห้อง</th><th>เลขที่เดิม</th><th>เดือน</th><th>ค่าห้อง</th><th>น้ำ</th><th>ไฟ</th><th>VAT</th><th>ยอด</th><th>ผล</th></tr></thead>
            <tbody>${rows.map(r=>`<tr><td><input class="importSel" data-p="${r.sourcePage}" type="checkbox" ${importState.selected.has(String(r.sourcePage))?'checked':''} ${r.validationStatus==='ready'?'':'disabled'}></td><td>${r.sourcePage}</td><td><b>${escapeAuthHtml(r.roomNumber||'-')}</b></td><td>${escapeAuthHtml(r.sourceDocumentNo||'-')}</td><td>${r.billingMonth||'-'}</td><td>${ieMoney(r.transformedRent)}</td><td>${ieMoney(r.waterCharge)}</td><td>${ieMoney(r.electricCharge)}</td><td>${ieMoney(r.sourceVatAmount)}</td><td><b>${ieMoney(r.sourceTotal)}</b></td><td>${iePill(r)}</td></tr>`).join('')}</tbody>
          </table></div>
          <div class="io-inline-action io-import-actions">
            <button class="btn ghost" id="clearImport">ล้าง</button>
            <button class="btn" id="confirmImport" ${selected.length?'':'disabled'}>ยืนยันนำเข้า (${selected.length})</button>
          </div>
        `:''}

        ${importState.result?`<div class="io-result"><b>ผลการนำเข้า</b><span>สำเร็จ ${importState.result.imported} · ข้าม ${importState.result.skipped} · ผิดพลาด ${importState.result.errors}</span></div>`:''}
      </div>
    </section>

    <section class="card io-panel io-history-card">
      <div class="card-head io-panel-head"><div><h3>ประวัตินำเข้าล่าสุด</h3><p class="sub">เฉพาะหอพักที่กำลังเลือก</p></div></div>
      <div class="io-panel-body">${historyHtml}</div>
    </section>
  </div>`;
}

function ieExportBills(){
  const ms=[...availableMonths()].reverse(); if(!renderImportExport._month||!ms.includes(renderImportExport._month))renderImportExport._month=ms[0]||thisMonth();
  return currentBills().filter(b=>b.month===renderImportExport._month).sort((a,b)=>{const x=rooms.find(r=>r.id===a.roomId),y=rooms.find(r=>r.id===b.roomId);return (x?.number||'').localeCompare(y?.number||'','th',{numeric:true});});
}
function renderExportPane(){
  const ms=[...availableMonths()].reverse(), asc=[...availableMonths()], list=ieExportBills();
  if(!(renderImportExport._selected instanceof Set)||renderImportExport._selMonth!==renderImportExport._month){
    renderImportExport._selected=new Set(list.map(b=>String(b.id)));renderImportExport._selMonth=renderImportExport._month;
  }
  if(!renderImportExport._reportType)renderImportExport._reportType='monthly';
  if(!renderImportExport._rangeFrom||!asc.includes(renderImportExport._rangeFrom))renderImportExport._rangeFrom=asc[0]||renderImportExport._month;
  if(!renderImportExport._rangeTo||!asc.includes(renderImportExport._rangeTo))renderImportExport._rangeTo=asc[asc.length-1]||renderImportExport._month;

  const s=renderImportExport._selected, all=list.length>0&&list.every(b=>s.has(String(b.id)));
  const roomIds=new Set(currentRooms().map(r=>String(r.id)));
  const rcs=receipts.filter(r=>roomIds.has(String(r.roomId))).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const deps=deposits.filter(d=>roomIds.has(String(d.roomId))).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const hasBills=list.length>0;
  const hasMoneyDocs=rcs.length>0||deps.length>0;
  const hasAnyExport=hasBills||hasMoneyDocs;
  const roomLabel=id=>{const r=rooms.find(x=>String(x.id)===String(id));return r?r.number:'-';};

  if(!hasAnyExport){
    return `<div class="io-empty card">
      <div class="io-empty-icon">⇩</div>
      <div>
        <h3>ยังไม่มีข้อมูลให้ Export</h3>
        <p>เมื่อมีบิล ใบเสร็จ หรือใบรับเงินมัดจำ ระบบจะแสดงตัวเลือก Export ในหน้านี้อัตโนมัติ</p>
      </div>
    </div>`;
  }

  const billPanel=hasBills?`<section class="card io-panel">
    <div class="card-head io-panel-head">
      <div>
        <h3>บิล</h3>
        <p class="sub">เลือกเดือนและบิลที่ต้องการบันทึกเป็น PDF</p>
      </div>
      <select id="exportMonth" class="toolbar-select io-compact-select">${ms.map(m=>`<option value="${m}" ${m===renderImportExport._month?'selected':''}>${monthLabel(m)}</option>`).join('')}</select>
    </div>
    <div class="toolbar-actions io-panel-actions">
      <button class="btn" id="exportBills" ${s.size?'':'disabled'}>📄 PDF บิลที่เลือก (${s.size})</button>
    </div>
    <div class="io-table io-export-table"><table>
      <thead><tr><th><input id="exportAll" type="checkbox" ${all?'checked':''}></th><th>ห้อง</th><th>เลขบิล</th><th>ค่าห้อง</th><th>น้ำ</th><th>ไฟ</th><th>รวม</th></tr></thead>
      <tbody>${list.map(b=>{const r=rooms.find(x=>x.id===b.roomId);return `<tr><td><input class="exportSel" data-id="${b.id}" type="checkbox" ${s.has(String(b.id))?'checked':''}></td><td><b>${escapeAuthHtml(r?.number||'-')}</b></td><td>${escapeAuthHtml(b.invoiceNo||'-')}</td><td>${ieMoney(b.rent)}</td><td>${ieMoney(b.water)}</td><td>${ieMoney(b.electric)}</td><td><b>${ieMoney(b.total)}</b></td></tr>`}).join('')}</tbody>
    </table></div>
  </section>`:'';

  const reportPanel=hasBills?`<section class="card io-panel">
    <div class="card-head io-panel-head"><div><h3>รายงานสรุป</h3><p class="sub">ส่งออกรายงานจากข้อมูลบิลที่มีอยู่</p></div></div>
    <div class="io-panel-body">
      <div class="io-form-grid">
        <div class="field"><label>ประเภทรายงาน</label><select id="exportReportType"><option value="monthly" ${renderImportExport._reportType==='monthly'?'selected':''}>สรุปยอดรายเดือน</option><option value="water" ${renderImportExport._reportType==='water'?'selected':''}>สรุปค่าน้ำ</option><option value="electric" ${renderImportExport._reportType==='electric'?'selected':''}>สรุปค่าไฟ</option></select></div>
        <div class="field"><label>เดือน (รายงานรายเดือน)</label><select id="exportReportMonth">${ms.map(m=>`<option value="${m}" ${m===renderImportExport._month?'selected':''}>${monthLabel(m)}</option>`).join('')}</select></div>
        <div class="field"><label>ช่วงเริ่มต้น (น้ำ/ไฟ)</label><select id="exportRangeFrom">${asc.map(m=>`<option value="${m}" ${m===renderImportExport._rangeFrom?'selected':''}>${monthLabel(m)}</option>`).join('')}</select></div>
        <div class="field"><label>ถึงเดือน</label><select id="exportRangeTo">${asc.map(m=>`<option value="${m}" ${m===renderImportExport._rangeTo?'selected':''}>${monthLabel(m)}</option>`).join('')}</select></div>
      </div>
      <div class="io-inline-action"><button class="btn ghost" id="exportReport">📊 PDF รายงาน</button></div>
    </div>
  </section>`:'';

  const moneyPanel=hasMoneyDocs?`<section class="card io-panel">
    <div class="card-head io-panel-head"><div><h3>เอกสารรับเงิน</h3><p class="sub">เลือกเอกสารที่ต้องการบันทึกเป็น PDF</p></div></div>
    <div class="io-panel-body io-money-docs">
      ${rcs.length?`<div class="field"><label>ใบเสร็จรับเงิน</label><div class="io-doc-row"><select id="exportReceiptSelect"><option value="">เลือกใบเสร็จ…</option>${rcs.map(r=>`<option value="${r.id}">ห้อง ${escapeAuthHtml(roomLabel(r.roomId))} · ${escapeAuthHtml(r.receiptNo||'-')} · ${formatThaiDate(r.date)}</option>`).join('')}</select><button class="btn ghost" id="exportReceiptBtn">📄 PDF</button></div></div>`:''}
      ${deps.length?`<div class="field"><label>ใบรับเงินมัดจำ</label><div class="io-doc-row"><select id="exportDepositSelect"><option value="">เลือกใบรับมัดจำ…</option>${deps.map(d=>`<option value="${d.id}">ห้อง ${escapeAuthHtml(roomLabel(d.roomId))} · ${escapeAuthHtml(d.receiptNo||'-')} · ${formatThaiDate(d.date)}</option>`).join('')}</select><button class="btn ghost" id="exportDepositBtn">📄 PDF</button></div></div>`:''}
    </div>
  </section>`:'';

  return `<div class="io-export-stack">${billPanel}${reportPanel}${moneyPanel}</div>`;
}

function renderImportExport(){
  ieReset(); renderImportExport._tab=renderImportExport._tab||'import';
  return `<div class="io-page">
    <div class="page-head io-page-head"><div><h2>Import / Export</h2><p class="sub">นำเข้าบิลย้อนหลัง และส่งออกเอกสาร</p></div></div>
    <div class="io-tabs" role="tablist" aria-label="Import Export">
      <button class="io-tab ${renderImportExport._tab==='import'?'active':''}" data-io="import" role="tab" aria-selected="${renderImportExport._tab==='import'?'true':'false'}">↑ Import</button>
      <button class="io-tab ${renderImportExport._tab==='export'?'active':''}" data-io="export" role="tab" aria-selected="${renderImportExport._tab==='export'?'true':'false'}">↓ Export</button>
    </div>
    ${renderImportExport._tab==='import'?renderImportPane():renderExportPane()}
  </div>`;
}
async function loadImportBatches(){
  if(renderImportExport._batchProperty===currentPropertyId)return;
  try{const d=await remoteAuthPost({action:'listImportBatches',propertyId:currentPropertyId});renderImportExport._batchProperty=currentPropertyId;renderImportExport._batches=d.batches||[];if(currentPage==='importExport')render();}catch(e){if(handleUnauthorized(e))return;renderImportExport._batchProperty=currentPropertyId;renderImportExport._batches=[];}
}
async function confirmImportRows(){
  const rows=importState.rows.filter(r=>r.validationStatus==='ready'&&importState.selected.has(String(r.sourcePage))); if(!rows.length)return;
  if(!confirm(`ยืนยันนำเข้า ${rows.length} บิล?`))return;
  try{
    const d=await remoteAuthPost({action:'commitBillImport',propertyId:currentPropertyId,sourceFilename:importState.fileName,sourceFileHash:importState.fileHash,sourceFormat:'legacy_pdf_v1',rows});
    (d.bills||[]).forEach(x=>bills.push(x));(d.meterReadings||[]).forEach(x=>meterReadings.push(x));cacheLocally();importState.result=d.summary;importState.selected=new Set();renderImportExport._batchProperty=null;render();loadImportBatches();showToast(`นำเข้าสำเร็จ ${d.summary?.imported||0} บิล`);
  }catch(e){if(handleUnauthorized(e))return;showToast(String(e.message||e)==='import_file_already_confirmed'?'ไฟล์นี้เคยนำเข้าแล้ว':'นำเข้าไม่สำเร็จ');}
}
async function exportImportMonthlyReport(){
  if(!pdfLibsReady()){showToast('PDF library ยังไม่พร้อม');return;}
  const asc=[...availableMonths()], desc=[...asc].reverse(), type=renderImportExport._reportType||'monthly';
  const old={tab:renderReports._tab,month:renderReports._month,wf:renderReports._waterFrom,wt:renderReports._waterTo,ef:renderReports._electricFrom,et:renderReports._electricTo};
  renderReports._tab=type;renderReports._month=renderImportExport._month;
  if(type==='water'){renderReports._waterFrom=renderImportExport._rangeFrom;renderReports._waterTo=renderImportExport._rangeTo;}
  if(type==='electric'){renderReports._electricFrom=renderImportExport._rangeFrom;renderReports._electricTo=renderImportExport._rangeTo;}
  const html=type==='monthly'?renderMonthlyReport(desc):renderRangeReport(type,asc);
  renderReports._tab=old.tab;renderReports._month=old.month;renderReports._waterFrom=old.wf;renderReports._waterTo=old.wt;renderReports._electricFrom=old.ef;renderReports._electricTo=old.et;
  const box=document.createElement('div');box.className='pdf-render-box';box.style.width='900px';box.style.padding='4px';box.innerHTML=html;document.body.appendChild(box);
  try{
    await ensureFontsReady();await new Promise(r=>requestAnimationFrame(r));
    const cv=await html2canvas(box,{scale:2,useCORS:true,backgroundColor:'#fff',windowWidth:900});
    const {jsPDF}=window.jspdf,doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});addCanvasToDoc(doc,cv,8,true);
    const label=type==='monthly'?'รายเดือน-'+renderImportExport._month:(type==='water'?'ค่าน้ำ':'ค่าไฟ')+'-'+renderImportExport._rangeFrom+'-'+renderImportExport._rangeTo;
    doc.save(('รายงานสรุป-'+label).replace(/[\\/:*?"<>|]/g,'-')+'.pdf');showToast('บันทึก PDF รายงานแล้ว');
  }catch(e){console.error(e);showToast('สร้าง PDF รายงานไม่สำเร็จ');}finally{box.remove();}
}
function attachImportExportEvents(){
  document.querySelectorAll('[data-io]').forEach(x=>x.onclick=()=>{renderImportExport._tab=x.dataset.io;render();});
  if(currentPage==='importExport'&&renderImportExport._tab==='import')loadImportBatches();
  const f=document.getElementById('importPdfFile');if(f)f.onchange=async e=>{const z=e.target.files?.[0];if(z)try{await parseImportPdf(z)}catch(err){importState.busy=false;importState.message=String(err.message||err);render();showToast('อ่าน PDF ไม่สำเร็จ');}};
  const all=document.getElementById('importAll');if(all)all.onchange=e=>{importState.rows.filter(r=>r.validationStatus==='ready').forEach(r=>e.target.checked?importState.selected.add(String(r.sourcePage)):importState.selected.delete(String(r.sourcePage)));render();};
  document.querySelectorAll('.importSel').forEach(x=>x.onchange=e=>{e.target.checked?importState.selected.add(String(x.dataset.p)):importState.selected.delete(String(x.dataset.p));render();});
  const cl=document.getElementById('clearImport');if(cl)cl.onclick=()=>{importState.rows=[];importState.selected=new Set();importState.message='';importState.result=null;render();};
  const ci=document.getElementById('confirmImport');if(ci)ci.onclick=confirmImportRows;
  const m=document.getElementById('exportMonth');if(m)m.onchange=e=>{renderImportExport._month=e.target.value;renderImportExport._selMonth=null;render();};
  const ea=document.getElementById('exportAll');if(ea)ea.onchange=e=>{ieExportBills().forEach(b=>e.target.checked?renderImportExport._selected.add(String(b.id)):renderImportExport._selected.delete(String(b.id)));render();};
  document.querySelectorAll('.exportSel').forEach(x=>x.onchange=e=>{e.target.checked?renderImportExport._selected.add(String(x.dataset.id)):renderImportExport._selected.delete(String(x.dataset.id));render();});
  const eb=document.getElementById('exportBills');if(eb)eb.onclick=()=>exportInvoicesPdf(ieExportBills().filter(b=>renderImportExport._selected.has(String(b.id))));
  const rt=document.getElementById('exportReportType');if(rt)rt.onchange=e=>{renderImportExport._reportType=e.target.value;render();};
  const rm=document.getElementById('exportReportMonth');if(rm)rm.onchange=e=>{renderImportExport._month=e.target.value;renderImportExport._selMonth=null;render();};
  const rf=document.getElementById('exportRangeFrom');if(rf)rf.onchange=e=>{renderImportExport._rangeFrom=e.target.value;};
  const rr=document.getElementById('exportRangeTo');if(rr)rr.onchange=e=>{renderImportExport._rangeTo=e.target.value;};
  const er=document.getElementById('exportReport');if(er)er.onclick=exportImportMonthlyReport;
  const rb=document.getElementById('exportReceiptBtn');if(rb)rb.onclick=()=>{const id=document.getElementById('exportReceiptSelect')?.value,rc=receipts.find(r=>String(r.id)===String(id));if(rc)exportReceiptPdf(rc);else showToast('เลือกใบเสร็จก่อน');};
  const db=document.getElementById('exportDepositBtn');if(db)db.onclick=()=>{const id=document.getElementById('exportDepositSelect')?.value,dep=deposits.find(d=>String(d.id)===String(id));if(dep)exportDepositPdf(dep);else showToast('เลือกใบรับมัดจำก่อน');};
}
