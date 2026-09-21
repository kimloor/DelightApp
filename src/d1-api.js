const TABLES = {
  properties: {
    columns: ['id','name','water_rate','electric_rate','address','bill_notes','qr_image','owner_id','vat_enabled','vat_rate','vat_type_rent','vat_type_water','vat_type_electric','tax_id','legal_name'],
    fromClient: p => [
      s(p.id), s(p.name), n(p.waterRate), n(p.electricRate), s(p.address), s(p.notes), s(p.qrImage), s(p.ownerId),
      p.vatEnabled ? 1 : 0, n(p.vatRate), vat(p.vatTypeRent), vat(p.vatTypeWater), vat(p.vatTypeElectric), s(p.taxId), s(p.legalName)
    ],
  },
  rooms: {
    columns: ['id','property_id','room_number','floor','rent','status','room_type','deposit'],
    fromClient: r => [s(r.id),s(r.propertyId),s(r.number),s(r.floor),n(r.rent),statusRoom(r.status),s(r.roomType),n(r.deposit)],
  },
  tenants: {
    columns: ['id','room_id','name','phone','move_in_date'],
    fromClient: t => [s(t.id),s(t.roomId),s(t.name),s(t.phone),s(t.moveInDate)],
  },
  bills: {
    columns: ['id','room_id','month','invoice_no','rent','water_prev','water_curr','water_charge','electric_prev','electric_curr','electric_charge','total','status','vat_subtotal','vat_amount','tax_invoice_no'],
    fromClient: b => [s(b.id),s(b.roomId),s(b.month),s(b.invoiceNo),n(b.rent),n(b.waterPrev),n(b.waterCurr),n(b.water),n(b.electricPrev),n(b.electricCurr),n(b.electric),n(b.total),statusBill(b.status),n(b.vatSubtotal),n(b.vatAmount),s(b.taxInvoiceNo)],
  },
  deposits: {
    columns: ['id','room_id','receipt_no','amount','received_date','note'],
    fromClient: d => [s(d.id),s(d.roomId),s(d.receiptNo),n(d.amount),s(d.date),s(d.note)],
  },
  meterReadings: {
    dbTable: 'meter_readings',
    columns: ['id','room_id','bill_id','month','type','previous_reading','current_reading','units_used','rate','cost','recorded_at'],
    fromClient: m => [s(m.id),s(m.roomId),s(m.billId),s(m.month),s(m.type),n(m.prev),n(m.curr),n(m.units),n(m.rate),n(m.cost),s(m.recordedAt)],
  },
  receipts: {
    columns: ['id','room_id','bill_id','receipt_no','amount','received_date','note','vat_subtotal','vat_amount'],
    fromClient: r => [s(r.id),s(r.roomId),s(r.billId),s(r.receiptNo),n(r.amount),s(r.date),s(r.note),n(r.vatSubtotal),n(r.vatAmount)],
  },
  roomLayouts: {
    dbTable: 'room_layouts',
    columns: ['id','room_id','x','y'],
    fromClient: r => [s(r.id),s(r.roomId),n(r.x),n(r.y)],
  },
};

const s = v => v == null ? '' : String(v);
const n = v => Number(v) || 0;
const vat = v => ['exclusive','inclusive'].includes(v) ? v : 'none';
const statusRoom = v => v === 'occupied' ? 'occupied' : 'vacant';
const statusBill = v => v === 'paid' ? 'paid' : 'unpaid';

const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2,'0')).join('');
const b64url = bytes => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const unb64url = text => {
  let x = text.replace(/-/g,'+').replace(/_/g,'/');
  while (x.length % 4) x += '=';
  const bin = atob(x);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function sha256Hex(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))));
}

async function createToken(env, user) {
  requireSecret(env);
  const payload = { uid:String(user.id), u:String(user.username), exp:Date.now() + 30*24*60*60*1000 };
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return payloadB64 + '.' + await hmacHex(env.AUTH_SECRET, payloadB64);
}

async function verifyToken(env, token) {
  requireSecret(env);
  if (!token || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.', 2);
  if (!payloadB64 || !sig) return null;
  const expected = await hmacHex(env.AUTH_SECRET, payloadB64);
  if (!timingSafeText(expected, sig)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(payloadB64)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function timingSafeText(a,b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireSecret(env) {
  if (!env.AUTH_SECRET) throw new Error('server_not_configured');
}

function publicUser(u) {
  return { id:String(u.id), username:u.username, displayName:u.display_name || '', isAdmin:u.role === 'admin' };
}

function json(data, status=200, request=null, env=null) {
  const origin = request?.headers.get('Origin') || '';
  const allowed = env?.ALLOWED_ORIGIN || '*';
  const cors = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type':'application/json;charset=UTF-8',
      'access-control-allow-origin': cors,
      'access-control-allow-headers':'content-type',
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'cache-control':'no-store',
    }
  });
}

async function userByUsername(env, username) {
  return env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
}
async function userById(env, id) {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(String(id)).first();
}

async function authenticate(env, token) {
  const auth = await verifyToken(env, token);
  if (!auth) return null;
  const user = await userById(env, auth.uid);
  return user ? {auth,user} : null;
}

async function requireAdmin(env, token) {
  const x = await authenticate(env, token);
  if (!x) throw new Error('unauthorized');
  if (x.user.role !== 'admin') throw new Error('forbidden');
  return x;
}

async function appendLog(env, user, action, tableName='', ids=[], count=0, note='') {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_logs (created_at,user_id,username,action,table_name,affected_ids,item_count,note) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(new Date().toISOString(), user?.id || '', user?.username || '', action, tableName, ids.join(','), count, note).run();
  } catch (e) {
    console.error('audit_log_write_failed', {
      action,
      tableName,
      userId: user?.id || '',
      error: String(e?.message || e),
    });
  }
}

function rowProperty(r) {
  return {
    id:String(r.id), name:r.name || '', waterRate:n(r.water_rate), electricRate:n(r.electric_rate),
    address:r.address || '', notes:r.bill_notes || '', qrImage:r.qr_image || '', ownerId:r.owner_id || '',
    vatEnabled:!!r.vat_enabled, vatRate:n(r.vat_rate), vatTypeRent:r.vat_type_rent || 'none',
    vatTypeWater:r.vat_type_water || 'none', vatTypeElectric:r.vat_type_electric || 'none',
    taxId:r.tax_id || '', legalName:r.legal_name || ''
  };
}
function rowRoom(r) { return {id:String(r.id),propertyId:String(r.property_id),number:r.room_number||'',floor:r.floor||'',rent:n(r.rent),status:r.status==='occupied'?'occupied':'vacant',roomType:r.room_type||'',deposit:n(r.deposit)}; }
function rowTenant(r) { return {id:String(r.id),roomId:String(r.room_id),name:r.name||'',phone:r.phone||'',moveInDate:r.move_in_date||''}; }
function rowBill(r) { return {id:String(r.id),roomId:String(r.room_id),month:r.month||'',invoiceNo:r.invoice_no||'',rent:n(r.rent),waterPrev:n(r.water_prev),waterCurr:n(r.water_curr),water:n(r.water_charge),electricPrev:n(r.electric_prev),electricCurr:n(r.electric_curr),electric:n(r.electric_charge),total:n(r.total),status:r.status==='paid'?'paid':'unpaid',vatSubtotal:n(r.vat_subtotal),vatAmount:n(r.vat_amount),taxInvoiceNo:r.tax_invoice_no||''}; }
function rowDeposit(r) { return {id:String(r.id),roomId:String(r.room_id),receiptNo:r.receipt_no||'',amount:n(r.amount),date:r.received_date||'',note:r.note||''}; }
function rowMeter(r) { return {id:String(r.id),roomId:String(r.room_id),billId:String(r.bill_id||''),month:r.month||'',type:r.type||'',prev:n(r.previous_reading),curr:n(r.current_reading),units:n(r.units_used),rate:n(r.rate),cost:n(r.cost),recordedAt:r.recorded_at||''}; }
function rowReceipt(r) { return {id:String(r.id),roomId:String(r.room_id),billId:String(r.bill_id||''),receiptNo:r.receipt_no||'',amount:n(r.amount),date:r.received_date||'',note:r.note||'',vatSubtotal:n(r.vat_subtotal),vatAmount:n(r.vat_amount)}; }
function rowLayout(r) { return {id:String(r.id),roomId:String(r.room_id),x:n(r.x),y:n(r.y)}; }

async function getAll(env) {
  const results = await Promise.all([
    env.DB.prepare('SELECT * FROM properties ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM rooms ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM tenants ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM bills ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM deposits ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM meter_readings ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM receipts ORDER BY CAST(id AS INTEGER), id').all(),
    env.DB.prepare('SELECT * FROM room_layouts ORDER BY CAST(id AS INTEGER), id').all(),
  ]);
  const [p,r,t,b,d,m,rc,l] = results.map(x=>x.results || []);
  return {
    properties:p.map(rowProperty), rooms:r.map(rowRoom), tenants:t.map(rowTenant), bills:b.map(rowBill),
    deposits:d.map(rowDeposit), meterReadings:m.map(rowMeter), receipts:rc.map(rowReceipt), roomLayouts:l.map(rowLayout)
  };
}

async function adminPropertyIds(env, userId) {
  const q = await env.DB.prepare(
    'SELECT property_id FROM property_admins WHERE user_id=? ORDER BY property_id'
  ).bind(String(userId)).all();
  return (q.results || []).map(r => String(r.property_id));
}

async function getAdminScopedAll(env, user) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const propertyIds = await adminPropertyIds(env, user.id);
  if (!propertyIds.length) {
    return {properties:[],rooms:[],tenants:[],bills:[],deposits:[],meterReadings:[],receipts:[],roomLayouts:[]};
  }

  const qs = propertyIds.map(()=>'?').join(',');
  const roomScope = `SELECT id FROM rooms WHERE property_id IN (${qs})`;

  const results = await Promise.all([
    env.DB.prepare(`SELECT * FROM properties WHERE id IN (${qs}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM rooms WHERE property_id IN (${qs}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM tenants WHERE room_id IN (${roomScope}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM bills WHERE room_id IN (${roomScope}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM deposits WHERE room_id IN (${roomScope}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM meter_readings WHERE room_id IN (${roomScope}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM receipts WHERE room_id IN (${roomScope}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
    env.DB.prepare(`SELECT * FROM room_layouts WHERE room_id IN (${roomScope}) ORDER BY CAST(id AS INTEGER), id`).bind(...propertyIds).all(),
  ]);

  const [p,r,t,b,d,m,rc,l] = results.map(x=>x.results || []);
  return {
    properties:p.map(rowProperty), rooms:r.map(rowRoom), tenants:t.map(rowTenant), bills:b.map(rowBill),
    deposits:d.map(rowDeposit), meterReadings:m.map(rowMeter), receipts:rc.map(rowReceipt), roomLayouts:l.map(rowLayout)
  };
}

async function getTenantHome(env, user) {
  if (user.role !== 'tenant') throw new Error('forbidden');

  const binding = await env.DB.prepare(
    `SELECT t.*, r.id AS mapped_room_id, r.property_id AS mapped_property_id
     FROM tenant_accounts ta
     JOIN tenants t ON t.id=ta.tenant_id
     JOIN rooms r ON r.id=t.room_id
     WHERE ta.user_id=?`
  ).bind(String(user.id)).first();

  if (!binding) throw new Error('tenant_not_linked');

  const roomId = String(binding.mapped_room_id);
  const propertyId = String(binding.mapped_property_id);

  const results = await Promise.all([
    env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(propertyId).all(),
    env.DB.prepare('SELECT * FROM rooms WHERE id=?').bind(roomId).all(),
    env.DB.prepare('SELECT * FROM tenants WHERE id=?').bind(String(binding.id)).all(),
    env.DB.prepare('SELECT * FROM bills WHERE room_id=? ORDER BY month DESC, CAST(id AS INTEGER) DESC, id DESC').bind(roomId).all(),
    env.DB.prepare('SELECT * FROM deposits WHERE room_id=? ORDER BY received_date DESC, CAST(id AS INTEGER) DESC, id DESC').bind(roomId).all(),
    env.DB.prepare('SELECT * FROM meter_readings WHERE room_id=? ORDER BY recorded_at DESC, CAST(id AS INTEGER) DESC, id DESC').bind(roomId).all(),
    env.DB.prepare('SELECT * FROM receipts WHERE room_id=? ORDER BY received_date DESC, CAST(id AS INTEGER) DESC, id DESC').bind(roomId).all(),
  ]);

  const [p,r,t,b,d,m,rc] = results.map(x=>x.results || []);
  return {
    property:p[0] ? rowProperty(p[0]) : null,
    room:r[0] ? rowRoom(r[0]) : null,
    tenant:t[0] ? rowTenant(t[0]) : null,
    bills:b.map(rowBill),
    deposits:d.map(rowDeposit),
    meterReadings:m.map(rowMeter),
    receipts:rc.map(rowReceipt),
  };
}

async function replaceLogicalTable(env, tableName, items) {
  const cfg = TABLES[tableName];
  if (!cfg) throw new Error('unknown table: ' + tableName);
  const dbTable = cfg.dbTable || tableName;
  const cols = cfg.columns;
  const clientRows = (items || []).map(cfg.fromClient);
  const ids = clientRows.map(r=>String(r[0]));

  // Upsert first, then delete rows absent from the client snapshot.
  // This avoids temporarily deleting parent rows that still have child FKs.
  const placeholders = cols.map(()=>'?').join(',');
  const updates = cols.slice(1).map(c=>c+'=excluded.'+c).join(',');
  const upsertSql = `INSERT INTO ${dbTable} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
  const stmts = clientRows.map(row=>env.DB.prepare(upsertSql).bind(...row));

  if (ids.length) {
    const qs = ids.map(()=>'?').join(',');
    stmts.push(env.DB.prepare(`DELETE FROM ${dbTable} WHERE id NOT IN (${qs})`).bind(...ids));
  } else {
    stmts.push(env.DB.prepare(`DELETE FROM ${dbTable}`));
  }
  await env.DB.batch(stmts);
}

async function nextNumericId(env, table) {
  const row = await env.DB.prepare(`SELECT COALESCE(MAX(CAST(id AS INTEGER)),0) AS max_id FROM ${table}`).first();
  return String((Number(row?.max_id)||0)+1);
}

async function handlePost(request, env, body) {
  if (body.action === 'login') {
    const username = s(body.username).trim();
    const user = username ? await userByUsername(env, username) : null;
    if (!user || await sha256Hex(s(body.password)+':'+user.salt) !== user.password_hash) return {error:'invalid_credentials'};
    return {success:true, token:await createToken(env,user), user:publicUser(user)};
  }

  if (body.action === 'register') {
    // Public self-registration is intentionally disabled in production.
    // New staff/tenant account provisioning must use an explicitly authorized flow.
    return {error:'registration_disabled'};
  }

  if (body.action === 'getPublicAvailability') {
    if (!env.BOT_API_KEY || s(body.apiKey) !== env.BOT_API_KEY) return {error:'unauthorized'};
    const q = await env.DB.prepare("SELECT floor,room_type,rent,deposit FROM rooms WHERE status='vacant' ORDER BY property_id, CAST(room_number AS INTEGER), room_number").all();
    return {rooms:(q.results||[]).map(r=>({floor:r.floor,roomType:r.room_type||null,rent:n(r.rent),deposit:n(r.deposit)||null})),updatedAt:new Date().toISOString()};
  }

  const x = await authenticate(env, body.token);
  if (!x) return {error:'unauthorized'};

  if (body.action === 'me') return {success:true,user:publicUser(x.user)};

  // Legacy full snapshot remains temporarily for the current admin UI until row-level writes replace whole-table saves.
  if (body.action === 'getAll') return await getAll(env);

  // Phase B shadow reads: scoped by server-side access mappings, not yet used by the legacy write UI.
  if (body.action === 'getAdminScoped') {
    try { return await getAdminScopedAll(env, x.user); }
    catch(e) { return {error:e.message}; }
  }

  if (body.action === 'getTenantHome') {
    try { return await getTenantHome(env, x.user); }
    catch(e) { return {error:e.message}; }
  }

  if (body.action === 'changePassword') {
    if (await sha256Hex(s(body.oldPassword)+':'+x.user.salt) !== x.user.password_hash) return {error:'wrong_old_password'};
    const p = s(body.newPassword);
    if (p.length < 4) return {error:'รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัวอักษร)'};
    const salt = crypto.randomUUID();
    const hash = await sha256Hex(p+':'+salt);
    await env.DB.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').bind(hash,salt,x.user.id).run();
    await appendLog(env,x.user,'changePassword','users',[String(x.user.id)],1,'');
    return {success:true};
  }

  if (body.action === 'adminListUsers') {
    try { await requireAdmin(env,body.token); } catch(e) { return {error:e.message}; }
    const q = await env.DB.prepare('SELECT id,username,display_name,created_at,role FROM users ORDER BY CAST(id AS INTEGER), id').all();
    return {success:true,users:(q.results||[]).map(u=>({...publicUser(u),createdAt:u.created_at||''}))};
  }

  if (body.action === 'adminCreateUser') {
    let admin;
    try { admin=(await requireAdmin(env,body.token)).user; } catch(e) { return {error:e.message}; }
    const username=s(body.username).trim();
    const password=s(body.password);
    const displayName=s(body.displayName).trim() || username;
    if(!username) return {error:'username ห้ามว่าง'};
    if(password.length<4) return {error:'รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัวอักษร)'};
    if(await userByUsername(env,username)) return {error:'username นี้มีผู้ใช้แล้ว'};
    const id=await nextNumericId(env,'users');
    const salt=crypto.randomUUID();
    const hash=await sha256Hex(password+':'+salt);
    await env.DB.prepare('INSERT INTO users (id,username,password_hash,salt,display_name,created_at,role) VALUES (?,?,?,?,?,?,?)')
      .bind(id,username,hash,salt,displayName,new Date().toISOString(),'').run();
    const created=await userById(env,id);
    await appendLog(env,admin,'adminCreateUser','users',[id],1,'บัญชี '+username);
    return {success:true,user:publicUser(created)};
  }

  if (body.action === 'adminResetPassword') {
    let admin;
    try { admin=(await requireAdmin(env,body.token)).user; } catch(e) { return {error:e.message}; }
    const target = await userById(env,s(body.userId));
    if (!target) return {error:'ไม่พบผู้ใช้นี้'};
    const p=s(body.newPassword);
    if (p.length<4) return {error:'รหัสผ่านสั้นเกินไป (อย่างน้อย 4 ตัวอักษร)'};
    const salt=crypto.randomUUID();
    const hash=await sha256Hex(p+':'+salt);
    await env.DB.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?').bind(hash,salt,target.id).run();
    await appendLog(env,admin,'adminResetPassword','users',[String(target.id)],1,'บัญชี '+target.username);
    return {success:true};
  }

  const table = body.table;
  if (!TABLES[table]) return {error:'unknown table: '+s(table)};
  await replaceLogicalTable(env, table, Array.isArray(body.items) ? body.items : []);
  const ids=(body.items||[]).map(it=>s(it.id));
  await appendLog(env,x.user,'save',table,ids,ids.length,'');
  return {success:true};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');

    // Single Worker architecture: only /api and /api/* execute backend logic.
    // Static frontend/assets are served by the same Worker via the ASSETS binding.
    if (!isApi) return env.ASSETS.fetch(request);

    if (request.method === 'OPTIONS') return json({ok:true},204,request,env);
    try {
      if (!env.DB) return json({error:'d1_binding_missing'},500,request,env);
      if (request.method === 'GET') {
        const action = url.searchParams.get('action') || 'getAll';
        if (action === 'ping') return json({ok:true,backend:'d1'},200,request,env);
        const token = url.searchParams.get('token') || '';
        const x = await authenticate(env,token);
        if (!x) return json({error:'unauthorized'},200,request,env);
        if (action === 'getAll') return json(await getAll(env),200,request,env);
        return json({error:'unknown action'},200,request,env);
      }

      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({error:'invalid_json'},400,request,env); }
        return json(await handlePost(request,env,body||{}),200,request,env);
      }

      return json({error:'method_not_allowed'},405,request,env);
    } catch (e) {
      return json({error:String(e?.message || e)},500,request,env);
    }
  }
};
