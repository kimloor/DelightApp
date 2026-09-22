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
    fromClient: t => [s(t.id),s(t.roomId),s(t.name),s(t.phone),s(t.moveIn != null ? t.moveIn : t.moveInDate)],
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

const PASSWORD_ALGO_V2 = 'pbkdf2_sha256';
const PASSWORD_ITERATIONS_V2 = 100000;
const SESSION_TTL_MS = 30*24*60*60*1000;
const LOGIN_WINDOW_MS = 15*60*1000;
const LOGIN_BLOCK_MS = 15*60*1000;
const LOGIN_MAX_FAILURES = 5;

async function pbkdf2Hex(password, salt, iterations=PASSWORD_ITERATIONS_V2) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    {name:'PBKDF2'},
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations},
    material,
    256
  );
  return hex(new Uint8Array(bits));
}

async function verifyUserPassword(user, password) {
  const algo = user?.password_algo || 'legacy_sha256';
  if (algo === PASSWORD_ALGO_V2) {
    const iterations = Number(user.password_iterations) || PASSWORD_ITERATIONS_V2;
    return timingSafeText(await pbkdf2Hex(password,user.salt,iterations), user.password_hash || '');
  }
  return timingSafeText(await sha256Hex(password+':'+user.salt), user.password_hash || '');
}

async function makePasswordV2(password) {
  const salt=crypto.randomUUID();
  return {
    salt,
    hash:await pbkdf2Hex(password,salt,PASSWORD_ITERATIONS_V2),
    algo:PASSWORD_ALGO_V2,
    iterations:PASSWORD_ITERATIONS_V2
  };
}

async function upgradeLegacyPassword(env, user, password) {
  if ((user?.password_algo || 'legacy_sha256') === PASSWORD_ALGO_V2) return user;
  const next=await makePasswordV2(password);
  await env.DB.prepare(
    'UPDATE users SET password_hash=?,salt=?,password_algo=?,password_iterations=? WHERE id=?'
  ).bind(next.hash,next.salt,next.algo,next.iterations,String(user.id)).run();
  return await userById(env,user.id);
}

async function loginLimitKey(request, username) {
  const ip=request?.headers?.get('CF-Connecting-IP') || request?.headers?.get('x-forwarded-for') || '';
  return sha256Hex(String(username).toLowerCase()+'|'+String(ip).split(',')[0].trim());
}

async function loginLimitState(env, request, username) {
  const key=await loginLimitKey(request,username);
  const now=Date.now();
  const row=await env.DB.prepare('SELECT * FROM auth_login_limits WHERE key_hash=?').bind(key).first();
  if (!row) return {key,blocked:false,now};
  if (Number(row.blocked_until)>now) return {key,blocked:true,now};
  if (Number(row.window_started_at)+LOGIN_WINDOW_MS<now) {
    await env.DB.prepare('DELETE FROM auth_login_limits WHERE key_hash=?').bind(key).run();
    return {key,blocked:false,now};
  }
  return {key,blocked:false,now,row};
}

async function recordLoginFailure(env, state) {
  const now=state.now || Date.now();
  const row=state.row;
  const failCount=(Number(row?.fail_count)||0)+1;
  const windowStarted=Number(row?.window_started_at)||now;
  const blockedUntil=failCount>=LOGIN_MAX_FAILURES ? now+LOGIN_BLOCK_MS : 0;
  await env.DB.prepare(
    `INSERT INTO auth_login_limits (key_hash,fail_count,window_started_at,blocked_until,updated_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(key_hash) DO UPDATE SET
       fail_count=excluded.fail_count,
       window_started_at=excluded.window_started_at,
       blocked_until=excluded.blocked_until,
       updated_at=excluded.updated_at`
  ).bind(state.key,failCount,windowStarted,blockedUntil,now).run();
}

async function clearLoginFailures(env, state) {
  await env.DB.prepare('DELETE FROM auth_login_limits WHERE key_hash=?').bind(state.key).run();
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))));
}

async function createToken(env, user) {
  requireSecret(env);
  const payload = {
    uid:String(user.id),
    u:String(user.username),
    sv:Number(user.session_version)||1,
    exp:Date.now() + SESSION_TTL_MS
  };
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
  return {
    id:String(u.id),
    username:u.username,
    displayName:u.display_name || '',
    isAdmin:u.role === 'admin',
    platformRole:u.platform_role || 'normal',
    isSuperadmin:u.platform_role === 'superadmin',
    accountStatus:u.account_status || 'active'
  };
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
  if (!user) return null;
  if ((user.account_status||'active')!=='active') return null;
  const tokenVersion=Number(auth.sv || 1);
  const currentVersion=Number(user.session_version)||1;
  if (tokenVersion !== currentVersion) return null;
  return {auth,user};
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
function rowTenant(r) { return {id:String(r.id),roomId:String(r.room_id),name:r.name||'',phone:r.phone||'',moveIn:r.move_in_date||''}; }
function rowBill(r) { return {id:String(r.id),roomId:String(r.room_id),month:r.month||'',invoiceNo:r.invoice_no||'',rent:n(r.rent),waterPrev:n(r.water_prev),waterCurr:n(r.water_curr),water:n(r.water_charge),electricPrev:n(r.electric_prev),electricCurr:n(r.electric_curr),electric:n(r.electric_charge),total:n(r.total),status:r.status==='paid'?'paid':'unpaid',vatSubtotal:n(r.vat_subtotal),vatAmount:n(r.vat_amount),taxInvoiceNo:r.tax_invoice_no||''}; }
function rowDeposit(r) { return {id:String(r.id),roomId:String(r.room_id),receiptNo:r.receipt_no||'',amount:n(r.amount),date:r.received_date||'',note:r.note||''}; }
function rowMeter(r) { return {id:String(r.id),roomId:String(r.room_id),billId:String(r.bill_id||''),month:r.month||'',type:r.type||'',prev:n(r.previous_reading),curr:n(r.current_reading),units:n(r.units_used),rate:n(r.rate),cost:n(r.cost),recordedAt:r.recorded_at||''}; }
function rowReceipt(r) {
  return {
    id:String(r.id),roomId:String(r.room_id),billId:String(r.bill_id||''),
    receiptNo:r.receipt_no||'',amount:n(r.amount),date:r.received_date||'',note:r.note||'',
    vatSubtotal:n(r.vat_subtotal),vatAmount:n(r.vat_amount),
    status:r.status==='void'?'void':'active',
    voidedAt:r.voided_at||'',
    voidedByUserId:String(r.voided_by_user_id||''),
    voidReason:r.void_reason||''
  };
}
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

  const managersQ = await env.DB.prepare(
    `SELECT pa.property_id,pa.access_role,u.id AS user_id,u.username,u.display_name,u.platform_role
     FROM property_admins pa
     JOIN users u ON u.id=pa.user_id
     WHERE pa.property_id IN (${qs})
     ORDER BY pa.property_id,
              CASE pa.access_role WHEN 'owner' THEN 0 ELSE 1 END,
              u.display_name,u.username`
  ).bind(...propertyIds).all();

  return {
    properties:p.map(rowProperty), rooms:r.map(rowRoom), tenants:t.map(rowTenant), bills:b.map(rowBill),
    deposits:d.map(rowDeposit), meterReadings:m.map(rowMeter), receipts:rc.map(rowReceipt), roomLayouts:l.map(rowLayout),
    propertyAdmins:(managersQ.results||[]).map(x=>({
      propertyId:String(x.property_id),
      userId:String(x.user_id),
      username:x.username||'',
      displayName:x.display_name||'',
      accessRole:x.access_role||'admin',
      platformRole:x.platform_role||'normal'
    }))
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
    return {properties:[],rooms:[],tenants:[],bills:[],deposits:[],meterReadings:[],receipts:[],roomLayouts:[],tenantAccounts:[]};
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
  const tenantAccountsQ=await env.DB.prepare(
    `SELECT ta.tenant_id,ta.user_id,u.username,u.display_name,u.account_status
     FROM tenant_accounts ta
     JOIN users u ON u.id=ta.user_id
     JOIN tenants t ON t.id=ta.tenant_id
     JOIN rooms rr ON rr.id=t.room_id
     WHERE rr.property_id IN (${qs})
     ORDER BY CAST(ta.tenant_id AS INTEGER),ta.tenant_id`
  ).bind(...propertyIds).all();

  return {
    properties:p.map(rowProperty), rooms:r.map(rowRoom), tenants:t.map(rowTenant), bills:b.map(rowBill),
    deposits:d.map(rowDeposit), meterReadings:m.map(rowMeter), receipts:rc.map(rowReceipt), roomLayouts:l.map(rowLayout),
    tenantAccounts:(tenantAccountsQ.results||[]).map(x=>({
      tenantId:String(x.tenant_id),
      userId:String(x.user_id),
      username:x.username||'',
      displayName:x.display_name||'',
      accountStatus:x.account_status||'active'
    }))
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
  const row=await env.DB.prepare(
    'UPDATE id_counters SET next_id=next_id+1 WHERE table_name=? RETURNING next_id-1 AS id'
  ).bind(String(table)).first();
  if (!row?.id) throw new Error('id_counter_missing');
  return String(row.id);
}

async function nextDocumentSequence(env, kind) {
  const row=await env.DB.prepare(
    'UPDATE document_counters SET next_seq=next_seq+1 WHERE kind=? RETURNING next_seq-1 AS seq'
  ).bind(String(kind)).first();
  if (!row?.seq) throw new Error('document_counter_missing');
  return Number(row.seq);
}

function businessErrorMessage(e) {
  const m=String(e?.message || e || 'operation_failed');
  if (!/UNIQUE constraint failed/i.test(m)) return m;
  if (m.includes('rooms.property_id') && m.includes('rooms.room_number')) return 'room_number_exists';
  if (m.includes('tenants.room_id')) return 'room_already_has_tenant';
  if (m.includes('bills.room_id') && m.includes('bills.month')) return 'bill_room_month_exists';
  if (m.includes('bills.invoice_no')) return 'invoice_no_exists';
  if (m.includes('receipts.bill_id')) return 'receipt_already_exists';
  if (m.includes('receipts.receipt_no')) return 'receipt_no_exists';
  if (m.includes('deposits.receipt_no')) return 'deposit_receipt_no_exists';
  if (m.includes('room_layouts.room_id')) return 'room_layout_exists';
  if (m.includes('users.username')) return 'username_exists';
  return 'conflict';
}


async function adminHasProperty(env, userId, propertyId) {
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM property_admins WHERE user_id=? AND property_id=? LIMIT 1'
  ).bind(String(userId), String(propertyId)).first();
  return !!row;
}

async function requireAdminProperty(env, user, propertyId) {
  if (!user || user.role !== 'admin') throw new Error('forbidden');
  if (!await adminHasProperty(env, user.id, propertyId)) throw new Error('forbidden');
}

async function dbRoom(env, roomId) {
  return env.DB.prepare('SELECT * FROM rooms WHERE id=?').bind(String(roomId)).first();
}

async function insertLogicalRow(env, tableName, item) {
  const cfg = TABLES[tableName];
  if (!cfg) throw new Error('unknown table: ' + tableName);
  const dbTable = cfg.dbTable || tableName;
  const cols = cfg.columns;
  const row = cfg.fromClient(item);
  const sql = `INSERT INTO ${dbTable} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`;
  await env.DB.prepare(sql).bind(...row).run();
}

async function updateLogicalRow(env, tableName, item) {
  const cfg = TABLES[tableName];
  if (!cfg) throw new Error('unknown table: ' + tableName);
  const dbTable = cfg.dbTable || tableName;
  const cols = cfg.columns;
  const row = cfg.fromClient(item);
  const setters = cols.slice(1).map(c=>c+'=?').join(',');
  await env.DB.prepare(`UPDATE ${dbTable} SET ${setters} WHERE id=?`)
    .bind(...row.slice(1), row[0]).run();
}

async function createPropertyRow(env, user, item) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const id = await nextNumericId(env,'properties');
  const next = {
    ...(item || {}),
    id,
    ownerId:String(user.id),
    name:s(item?.name).trim(),
  };
  if (!next.name) throw new Error('property_name_required');

  const dup = await env.DB.prepare('SELECT id FROM properties WHERE name=? LIMIT 1').bind(next.name).first();
  if (dup) throw new Error('property_name_exists');

  await insertLogicalRow(env,'properties',next);
  await env.DB.prepare(
    "INSERT INTO property_admins (property_id,user_id,access_role,created_at) VALUES (?,?, 'owner', ?)"
  ).bind(id,String(user.id),new Date().toISOString()).run();
  await appendLog(env,user,'create','properties',[id],1,'');
  return rowProperty(await env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(id).first());
}

async function updatePropertyRow(env, user, item) {
  const id=s(item?.id);
  if (!id) throw new Error('property_id_required');
  await requireAdminProperty(env,user,id);
  const existing = await env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(id).first();
  if (!existing) throw new Error('property_not_found');

  const name=s(item?.name).trim();
  if (!name) throw new Error('property_name_required');
  const dup = await env.DB.prepare('SELECT id FROM properties WHERE name=? AND id<>? LIMIT 1').bind(name,id).first();
  if (dup) throw new Error('property_name_exists');

  const next={...(item||{}),id,name,ownerId:existing.owner_id||''};
  await updateLogicalRow(env,'properties',next);
  await appendLog(env,user,'update','properties',[id],1,'');
  return rowProperty(await env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(id).first());
}

async function createRoomRow(env, user, item) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const propertyId=s(item?.propertyId);
  await requireAdminProperty(env,user,propertyId);
  const number=s(item?.number).trim();
  if (!number) throw new Error('room_number_required');
  const dup=await env.DB.prepare('SELECT id FROM rooms WHERE property_id=? AND room_number=? LIMIT 1').bind(propertyId,number).first();
  if (dup) throw new Error('room_number_exists');

  const id=await nextNumericId(env,'rooms');
  const next={...(item||{}),id,propertyId,number};
  await insertLogicalRow(env,'rooms',next);
  await appendLog(env,user,'create','rooms',[id],1,'');
  return rowRoom(await dbRoom(env,id));
}

async function updateRoomRow(env, user, item) {
  const id=s(item?.id);
  const existing=await dbRoom(env,id);
  if (!existing) throw new Error('room_not_found');
  await requireAdminProperty(env,user,existing.property_id);

  const propertyId=s(item?.propertyId);
  await requireAdminProperty(env,user,propertyId);
  const number=s(item?.number).trim();
  if (!number) throw new Error('room_number_required');
  const dup=await env.DB.prepare(
    'SELECT id FROM rooms WHERE property_id=? AND room_number=? AND id<>? LIMIT 1'
  ).bind(propertyId,number,id).first();
  if (dup) throw new Error('room_number_exists');

  const next={...(item||{}),id,propertyId,number};
  await updateLogicalRow(env,'rooms',next);
  await appendLog(env,user,'update','rooms',[id],1,'');
  return rowRoom(await dbRoom(env,id));
}

async function batchUpdateRooms(env, user, items) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const list=Array.isArray(items)?items:[];
  const out=[];
  for (const raw of list) {
    out.push(await updateRoomRow(env,user,raw));
  }
  return out;
}

async function deleteRoomRow(env, user, roomId) {
  const id=s(roomId);
  const existing=await dbRoom(env,id);
  if (!existing) throw new Error('room_not_found');
  await requireAdminProperty(env,user,existing.property_id);

  const checks=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS c FROM tenants WHERE room_id=?').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM bills WHERE room_id=?').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM deposits WHERE room_id=?').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM meter_readings WHERE room_id=?').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM receipts WHERE room_id=?').bind(id).first(),
  ]);
  if (checks.some(x=>(Number(x?.c)||0)>0)) throw new Error('room_has_related_data');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM room_layouts WHERE room_id=?').bind(id),
    env.DB.prepare('DELETE FROM rooms WHERE id=?').bind(id),
  ]);
  await appendLog(env,user,'delete','rooms',[id],1,'');
  return {success:true,id};
}


async function dbTenant(env, tenantId) {
  return env.DB.prepare('SELECT * FROM tenants WHERE id=?').bind(String(tenantId)).first();
}

async function createTenantRow(env, user, item) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const roomId=s(item?.roomId);
  const room=await dbRoom(env,roomId);
  if (!room) throw new Error('room_not_found');
  await requireAdminProperty(env,user,room.property_id);

  const existing=await env.DB.prepare('SELECT id FROM tenants WHERE room_id=? LIMIT 1').bind(roomId).first();
  if (existing) throw new Error('room_already_has_tenant');

  const id=await nextNumericId(env,'tenants');
  const next={...(item||{}),id,roomId};
  await env.DB.batch([
    env.DB.prepare('INSERT INTO tenants (id,room_id,name,phone,move_in_date) VALUES (?,?,?,?,?)')
      .bind(id,roomId,s(next.name),s(next.phone),s(next.moveIn)),
    env.DB.prepare("UPDATE rooms SET status='occupied' WHERE id=?").bind(roomId),
  ]);
  await appendLog(env,user,'create','tenants',[id],1,'room '+roomId);
  return {
    tenant:rowTenant(await dbTenant(env,id)),
    room:rowRoom(await dbRoom(env,roomId)),
  };
}

async function updateTenantRow(env, user, item) {
  const id=s(item?.id);
  const existing=await dbTenant(env,id);
  if (!existing) throw new Error('tenant_not_found');

  const oldRoom=await dbRoom(env,existing.room_id);
  if (!oldRoom) throw new Error('room_not_found');
  await requireAdminProperty(env,user,oldRoom.property_id);

  const newRoomId=s(item?.roomId);
  const newRoom=await dbRoom(env,newRoomId);
  if (!newRoom) throw new Error('room_not_found');
  await requireAdminProperty(env,user,newRoom.property_id);

  const conflict=await env.DB.prepare('SELECT id FROM tenants WHERE room_id=? AND id<>? LIMIT 1')
    .bind(newRoomId,id).first();
  if (conflict) throw new Error('room_already_has_tenant');

  const stmts=[
    env.DB.prepare('UPDATE tenants SET room_id=?,name=?,phone=?,move_in_date=? WHERE id=?')
      .bind(newRoomId,s(item?.name),s(item?.phone),s(item?.moveIn),id),
    env.DB.prepare("UPDATE rooms SET status='occupied' WHERE id=?").bind(newRoomId),
  ];
  if (String(existing.room_id)!==newRoomId) {
    stmts.push(env.DB.prepare("UPDATE rooms SET status='vacant' WHERE id=?").bind(String(existing.room_id)));
  }
  await env.DB.batch(stmts);
  await appendLog(env,user,'update','tenants',[id],1,'room '+newRoomId);
  return {
    tenant:rowTenant(await dbTenant(env,id)),
    room:rowRoom(await dbRoom(env,newRoomId)),
    oldRoom:String(existing.room_id)!==newRoomId ? rowRoom(await dbRoom(env,existing.room_id)) : null,
  };
}

async function deleteTenantRow(env, user, tenantId) {
  const id=s(tenantId);
  const existing=await dbTenant(env,id);
  if (!existing) throw new Error('tenant_not_found');
  const room=await dbRoom(env,existing.room_id);
  if (!room) throw new Error('room_not_found');
  await requireAdminProperty(env,user,room.property_id);

  const binding=await env.DB.prepare('SELECT user_id FROM tenant_accounts WHERE tenant_id=?').bind(id).first();
  const stmts=[];
  if(binding){
    stmts.push(
      env.DB.prepare("UPDATE users SET account_status='disabled',session_version=session_version+1 WHERE id=?").bind(String(binding.user_id))
    );
  }
  stmts.push(
    env.DB.prepare('DELETE FROM tenant_accounts WHERE tenant_id=?').bind(id),
    env.DB.prepare('DELETE FROM tenants WHERE id=?').bind(id),
    env.DB.prepare("UPDATE rooms SET status='vacant' WHERE id=?").bind(String(existing.room_id))
  );
  await env.DB.batch(stmts);
  await appendLog(env,user,'delete','tenants',[id],1,'room '+existing.room_id);
  return {success:true,id,room:rowRoom(await dbRoom(env,existing.room_id))};
}


async function requireRoomAdminAccess(env, user, roomId) {
  const room=await dbRoom(env,roomId);
  if (!room) throw new Error('room_not_found');
  await requireAdminProperty(env,user,room.property_id);
  return room;
}

async function dbBill(env, billId) {
  return env.DB.prepare('SELECT * FROM bills WHERE id=?').bind(String(billId)).first();
}

async function activeReceiptForBill(env, billId) {
  return env.DB.prepare(
    "SELECT * FROM receipts WHERE bill_id=? AND status='active' ORDER BY CAST(id AS INTEGER) DESC,id DESC LIMIT 1"
  ).bind(String(billId)).first();
}

async function requireBillUnlocked(env, billId) {
  if (await activeReceiptForBill(env,billId)) throw new Error('bill_locked_by_receipt');
}


async function nextInvoiceNo(env, month) {
  const seq=await nextDocumentSequence(env,'invoice');
  const ym=s(month).replace('-','');
  return `INV-${ym}-${String(seq).padStart(4,'0')}`;
}

async function createBillsRows(env, user, items) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const drafts=Array.isArray(items)?items:[];
  const out=[];
  for (const raw of drafts) {
    const roomId=s(raw?.roomId);
    await requireRoomAdminAccess(env,user,roomId);
    const month=s(raw?.month);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid_bill_month');

    const exists=await env.DB.prepare('SELECT id FROM bills WHERE room_id=? AND month=? LIMIT 1')
      .bind(roomId,month).first();
    if (exists) continue;

    const id=await nextNumericId(env,'bills');
    const invoiceNo=await nextInvoiceNo(env,month);
    const next={...(raw||{}),id,roomId,month,invoiceNo};
    try{
      await insertLogicalRow(env,'bills',next);
    }catch(e){
      if(businessErrorMessage(e)==='bill_room_month_exists') continue;
      throw e;
    }
    const saved=await dbBill(env,id);
    out.push(rowBill(saved));
    await appendLog(env,user,'create','bills',[id],1,'room '+roomId+' month '+month);
  }
  return out;
}

async function updateBillRow(env, user, item) {
  const id=s(item?.id);
  const existing=await dbBill(env,id);
  if (!existing) throw new Error('bill_not_found');
  await requireRoomAdminAccess(env,user,existing.room_id);
  await requireBillUnlocked(env,id);

  const roomId=s(item?.roomId);
  await requireRoomAdminAccess(env,user,roomId);
  const month=s(item?.month);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid_bill_month');

  const dupMonth=await env.DB.prepare(
    'SELECT id FROM bills WHERE room_id=? AND month=? AND id<>? LIMIT 1'
  ).bind(roomId,month,id).first();
  if (dupMonth) throw new Error('bill_room_month_exists');

  const invoiceNo=s(item?.invoiceNo);
  if (invoiceNo) {
    const dupInv=await env.DB.prepare('SELECT id FROM bills WHERE invoice_no=? AND id<>? LIMIT 1')
      .bind(invoiceNo,id).first();
    if (dupInv) throw new Error('invoice_no_exists');
  }

  const next={...(item||{}),id,roomId,month};
  await updateLogicalRow(env,'bills',next);
  await appendLog(env,user,'update','bills',[id],1,'');
  return rowBill(await dbBill(env,id));
}

async function batchUpdateBills(env, user, items) {
  const list=Array.isArray(items)?items:[];
  // Validate the whole batch before mutating any bill so a locked bill cannot
  // leave earlier rows updated and later rows rejected.
  for (const item of list) {
    const id=s(item?.id);
    const existing=await dbBill(env,id);
    if (!existing) throw new Error('bill_not_found');
    await requireRoomAdminAccess(env,user,existing.room_id);
    await requireBillUnlocked(env,id);
  }
  const out=[];
  for (const item of list) out.push(await updateBillRow(env,user,item));
  return out;
}

async function deleteBillRow(env, user, billId) {
  const id=s(billId);
  const existing=await dbBill(env,id);
  if (!existing) throw new Error('bill_not_found');
  await requireRoomAdminAccess(env,user,existing.room_id);
  await requireBillUnlocked(env,id);
  await env.DB.prepare('DELETE FROM bills WHERE id=?').bind(id).run();
  await appendLog(env,user,'delete','bills',[id],1,'room '+existing.room_id);
  return {success:true,id};
}


async function moveBillsRows(env, user, ids, targetMonth) {
  if (!/^\d{4}-\d{2}$/.test(s(targetMonth))) throw new Error('invalid_bill_month');
  const out=[];
  let skipped=0;
  for (const rawId of (Array.isArray(ids)?ids:[])) {
    const id=s(rawId);
    const existing=await dbBill(env,id);
    if (!existing) continue;
    await requireRoomAdminAccess(env,user,existing.room_id);
    if (await activeReceiptForBill(env,id)) { skipped++; continue; }
    if (existing.month===targetMonth) continue;

    const dup=await env.DB.prepare('SELECT id FROM bills WHERE room_id=? AND month=? AND id<>? LIMIT 1')
      .bind(String(existing.room_id),s(targetMonth),id).first();
    if (dup) { skipped++; continue; }

    const next=rowBill(existing);
    next.month=s(targetMonth);
    next.invoiceNo=await nextInvoiceNo(env,targetMonth);
    await updateLogicalRow(env,'bills',next);
    out.push(rowBill(await dbBill(env,id)));
  }
  if(out.length) await appendLog(env,user,'move','bills',out.map(x=>x.id),out.length,'month '+targetMonth);
  return {bills:out,skipped};
}

async function createMeterReadingRows(env, user, items) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const list=Array.isArray(items)?items:[];
  const out=[];
  for (const raw of list) {
    const roomId=s(raw?.roomId);
    await requireRoomAdminAccess(env,user,roomId);

    const billId=s(raw?.billId);
    if (billId) {
      const bill=await dbBill(env,billId);
      if (!bill || String(bill.room_id)!==roomId) throw new Error('meter_bill_room_mismatch');
    }

    const id=await nextNumericId(env,'meter_readings');
    const next={...(raw||{}),id,roomId,billId};
    await insertLogicalRow(env,'meterReadings',next);
    const saved=await env.DB.prepare('SELECT * FROM meter_readings WHERE id=?').bind(id).first();
    out.push(rowMeter(saved));
  }
  if(out.length) await appendLog(env,user,'create','meter_readings',out.map(x=>x.id),out.length,'');
  return out;
}


async function createRoomsRows(env, user, items) {
  if (user.role !== 'admin') throw new Error('forbidden');
  const list=Array.isArray(items)?items:[];
  const out=[];
  let skipped=0;
  for (const raw of list) {
    const propertyId=s(raw?.propertyId);
    await requireAdminProperty(env,user,propertyId);
    const number=s(raw?.number).trim();
    if (!number) { skipped++; continue; }
    const dup=await env.DB.prepare(
      'SELECT id FROM rooms WHERE property_id=? AND room_number=? LIMIT 1'
    ).bind(propertyId,number).first();
    if (dup) { skipped++; continue; }
    try{
      out.push(await createRoomRow(env,user,{...(raw||{}),propertyId,number}));
    }catch(e){
      if(businessErrorMessage(e)==='room_number_exists'){ skipped++; continue; }
      throw e;
    }
  }
  return {rooms:out,skipped};
}

async function requirePropertyOwner(env, user, propertyId) {
  if (!user || user.role !== 'admin') throw new Error('forbidden');
  const row=await env.DB.prepare(
    "SELECT access_role FROM property_admins WHERE property_id=? AND user_id=? LIMIT 1"
  ).bind(String(propertyId),String(user.id)).first();
  if (!row || row.access_role!=='owner') throw new Error('owner_required');
}

async function deletePropertyRow(env, user, propertyId) {
  const id=s(propertyId);
  await requirePropertyOwner(env,user,id);
  const prop=await env.DB.prepare('SELECT * FROM properties WHERE id=?').bind(id).first();
  if (!prop) throw new Error('property_not_found');

  const roomQ=await env.DB.prepare('SELECT id FROM rooms WHERE property_id=?').bind(id).all();
  const roomIds=(roomQ.results||[]).map(r=>String(r.id));
  const tenantQ=roomIds.length
    ? await env.DB.prepare(`SELECT id FROM tenants WHERE room_id IN (${roomIds.map(()=>'?').join(',')})`).bind(...roomIds).all()
    : {results:[]};
  const tenantIds=(tenantQ.results||[]).map(t=>String(t.id));

  const stmts=[];
  if (tenantIds.length) {
    stmts.push(env.DB.prepare(`DELETE FROM tenant_accounts WHERE tenant_id IN (${tenantIds.map(()=>'?').join(',')})`).bind(...tenantIds));
  }
  if (roomIds.length) {
    const qs=roomIds.map(()=>'?').join(',');
    stmts.push(
      env.DB.prepare(`DELETE FROM receipts WHERE room_id IN (${qs})`).bind(...roomIds),
      env.DB.prepare(`DELETE FROM meter_readings WHERE room_id IN (${qs})`).bind(...roomIds),
      env.DB.prepare(`DELETE FROM deposits WHERE room_id IN (${qs})`).bind(...roomIds),
      env.DB.prepare(`DELETE FROM bills WHERE room_id IN (${qs})`).bind(...roomIds),
      env.DB.prepare(`DELETE FROM tenants WHERE room_id IN (${qs})`).bind(...roomIds),
      env.DB.prepare(`DELETE FROM room_layouts WHERE room_id IN (${qs})`).bind(...roomIds),
      env.DB.prepare(`DELETE FROM rooms WHERE id IN (${qs})`).bind(...roomIds)
    );
  }
  stmts.push(
    env.DB.prepare('DELETE FROM property_admins WHERE property_id=?').bind(id),
    env.DB.prepare('DELETE FROM properties WHERE id=?').bind(id)
  );
  await env.DB.batch(stmts);
  await appendLog(env,user,'delete','properties',[id],1,'cascade property delete');
  return {success:true,id,roomIds,tenantIds};
}

async function nextDocumentNo(env, kind, prefix, dateOrMonth) {
  const seq=await nextDocumentSequence(env,kind);
  const source=s(dateOrMonth);
  const ym=(/^\d{4}-\d{2}/.test(source)?source.slice(0,7):new Date().toISOString().slice(0,7)).replace('-','');
  return `${prefix}-${ym}-${String(seq).padStart(4,'0')}`;
}

async function createDepositRow(env, user, item) {
  const roomId=s(item?.roomId);
  await requireRoomAdminAccess(env,user,roomId);
  const amount=n(item?.amount);
  if (!(amount>0)) throw new Error('invalid_deposit_amount');
  const date=s(item?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_deposit_date');

  const id=await nextNumericId(env,'deposits');
  const receiptNo=await nextDocumentNo(env,'deposit','DEP',date);
  const next={id,roomId,receiptNo,amount,date,note:s(item?.note)};
  await insertLogicalRow(env,'deposits',next);
  await appendLog(env,user,'create','deposits',[id],1,'room '+roomId);
  return rowDeposit(await env.DB.prepare('SELECT * FROM deposits WHERE id=?').bind(id).first());
}

async function deleteDepositRow(env, user, depositId) {
  const id=s(depositId);
  const row=await env.DB.prepare('SELECT * FROM deposits WHERE id=?').bind(id).first();
  if (!row) throw new Error('deposit_not_found');
  await requireRoomAdminAccess(env,user,row.room_id);
  await env.DB.prepare('DELETE FROM deposits WHERE id=?').bind(id).run();
  await appendLog(env,user,'delete','deposits',[id],1,'room '+row.room_id);
  return {success:true,id};
}

async function createReceiptRow(env, user, item) {
  const billId=s(item?.billId);
  const bill=await dbBill(env,billId);
  if (!bill) throw new Error('bill_not_found');
  await requireRoomAdminAccess(env,user,bill.room_id);

  const existingReceipt=await activeReceiptForBill(env,billId);
  if (existingReceipt) throw new Error('receipt_already_exists');

  const date=s(item?.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_receipt_date');
  const id=await nextNumericId(env,'receipts');
  const receiptNo=await nextDocumentNo(env,'receipt','RCP',date);
  const receipt={
    id,
    roomId:String(bill.room_id),
    billId,
    receiptNo,
    amount:n(bill.total),
    date,
    note:s(item?.note),
    vatSubtotal:n(bill.vat_subtotal),
    vatAmount:n(bill.vat_amount),
  };

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO receipts (id,room_id,bill_id,receipt_no,amount,received_date,note,vat_subtotal,vat_amount,status,voided_at,voided_by_user_id,void_reason) VALUES (?,?,?,?,?,?,?,?,?,'active','','','')"
    ).bind(id,receipt.roomId,billId,receiptNo,receipt.amount,date,receipt.note,receipt.vatSubtotal,receipt.vatAmount),
    env.DB.prepare("UPDATE bills SET status='paid' WHERE id=?").bind(billId),
  ]);
  await appendLog(env,user,'create','receipts',[id],1,'bill '+billId);
  return {
    receipt:rowReceipt(await env.DB.prepare('SELECT * FROM receipts WHERE id=?').bind(id).first()),
    bill:rowBill(await dbBill(env,billId)),
  };
}


async function voidReceiptRow(env, user, receiptId, reason) {
  const id=s(receiptId);
  const why=s(reason).trim();
  if (!why) throw new Error('void_reason_required');

  const receipt=await env.DB.prepare('SELECT * FROM receipts WHERE id=?').bind(id).first();
  if (!receipt) throw new Error('receipt_not_found');
  if ((receipt.status||'active')!=='active') throw new Error('receipt_already_void');

  const room=await dbRoom(env,receipt.room_id);
  if (!room) throw new Error('room_not_found');
  await requirePropertyOwner(env,user,room.property_id);

  const bill=await dbBill(env,receipt.bill_id);
  if (!bill) throw new Error('bill_not_found');

  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE receipts SET status='void',voided_at=?,voided_by_user_id=?,void_reason=? WHERE id=? AND status='active'"
    ).bind(now,String(user.id),why,id),
    env.DB.prepare("UPDATE bills SET status='unpaid' WHERE id=?").bind(String(bill.id))
  ]);

  await appendLog(env,user,'voidReceipt','receipts',[id],1,'bill '+bill.id+' reason '+why);
  return {
    receipt:rowReceipt(await env.DB.prepare('SELECT * FROM receipts WHERE id=?').bind(id).first()),
    bill:rowBill(await dbBill(env,bill.id))
  };
}

async function upsertRoomLayoutRow(env, user, item) {
  const roomId=s(item?.roomId);
  await requireRoomAdminAccess(env,user,roomId);
  const existing=await env.DB.prepare('SELECT id FROM room_layouts WHERE room_id=? LIMIT 1').bind(roomId).first();
  const id=existing ? String(existing.id) : await nextNumericId(env,'room_layouts');
  await env.DB.prepare(
    `INSERT INTO room_layouts (id,room_id,x,y) VALUES (?,?,?,?)
     ON CONFLICT(room_id) DO UPDATE SET x=excluded.x,y=excluded.y`
  ).bind(id,roomId,n(item?.x),n(item?.y)).run();
  const saved=await env.DB.prepare('SELECT * FROM room_layouts WHERE room_id=? LIMIT 1').bind(roomId).first();
  return rowLayout(saved);
}

async function deleteRoomLayoutsRows(env, user, roomIds) {
  const ids=[...new Set((Array.isArray(roomIds)?roomIds:[]).map(s).filter(Boolean))];
  for (const roomId of ids) await requireRoomAdminAccess(env,user,roomId);
  if (ids.length) {
    await env.DB.prepare(`DELETE FROM room_layouts WHERE room_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).run();
  }
  return {success:true,roomIds:ids};
}


async function adminUserScope(env, user) {
  if (!user || user.role !== 'admin') throw new Error('forbidden');

  const accessQ = await env.DB.prepare(
    `SELECT pa.property_id,pa.access_role,p.name
     FROM property_admins pa
     JOIN properties p ON p.id=pa.property_id
     WHERE pa.user_id=?
     ORDER BY p.name,p.id`
  ).bind(String(user.id)).all();
  const access=(accessQ.results||[]).map(r=>({
    propertyId:String(r.property_id),
    propertyName:r.name||'',
    accessRole:r.access_role||'admin'
  }));
  const propertyIds=access.map(a=>a.propertyId);

  const users=new Map();
  const me=await userById(env,user.id);
  if(me) users.set(String(me.id),{...publicUser(me),createdAt:me.created_at||'',propertyAccess:[]});

  if(propertyIds.length){
    const qs=propertyIds.map(()=>'?').join(',');

    const adminsQ=await env.DB.prepare(
      `SELECT DISTINCT u.id,u.username,u.display_name,u.created_at,u.role,u.platform_role,u.account_status
       FROM users u
       JOIN property_admins pa ON pa.user_id=u.id
       WHERE pa.property_id IN (${qs})
       ORDER BY CAST(u.id AS INTEGER),u.id`
    ).bind(...propertyIds).all();
    for(const u of (adminsQ.results||[])){
      users.set(String(u.id),{...publicUser(u),createdAt:u.created_at||'',propertyAccess:[]});
    }

    const tenantsQ=await env.DB.prepare(
      `SELECT DISTINCT u.id,u.username,u.display_name,u.created_at,u.role,u.platform_role,u.account_status,
              r.property_id,p.name AS property_name
       FROM users u
       JOIN tenant_accounts ta ON ta.user_id=u.id
       JOIN tenants t ON t.id=ta.tenant_id
       JOIN rooms r ON r.id=t.room_id
       JOIN properties p ON p.id=r.property_id
       WHERE r.property_id IN (${qs})
       ORDER BY CAST(u.id AS INTEGER),u.id`
    ).bind(...propertyIds).all();
    for(const u of (tenantsQ.results||[])){
      users.set(String(u.id),{
        ...publicUser(u),
        createdAt:u.created_at||'',
        tenantPropertyId:String(u.property_id),
        tenantPropertyName:u.property_name||'',
        propertyAccess:[]
      });
    }

    const paQ=await env.DB.prepare(
      `SELECT pa.user_id,pa.property_id,pa.access_role,p.name
       FROM property_admins pa
       JOIN properties p ON p.id=pa.property_id
       WHERE pa.property_id IN (${qs})
       ORDER BY p.name,p.id`
    ).bind(...propertyIds).all();
    for(const r of (paQ.results||[])){
      const item=users.get(String(r.user_id));
      if(item) item.propertyAccess.push({
        propertyId:String(r.property_id),
        propertyName:r.name||'',
        accessRole:r.access_role||'admin'
      });
    }
  }

  return {
    users:[...users.values()],
    properties:access,
    ownerProperties:access.filter(a=>a.accessRole==='owner')
  };
}

async function adminCanManageUser(env, admin, targetUserId) {
  if (!admin || admin.role!=='admin') return false;
  if (String(admin.id)===String(targetUserId)) return true;
  const scoped=await adminUserScope(env,admin);
  return scoped.users.some(u=>String(u.id)===String(targetUserId));
}

async function createScopedAdminUser(env, admin, body) {
  if (!admin || admin.role!=='admin') throw new Error('forbidden');
  const propertyIds=[...new Set((Array.isArray(body.propertyIds)?body.propertyIds:[]).map(s).filter(Boolean))];
  if (!propertyIds.length) throw new Error('property_access_required');

  for(const propertyId of propertyIds){
    await requirePropertyOwner(env,admin,propertyId);
  }

  const username=s(body.username).trim();
  const password=s(body.password);
  const displayName=s(body.displayName).trim() || username;
  if(!username) throw new Error('username_required');
  if(password.length<4) throw new Error('password_too_short');
  if(await userByUsername(env,username)) throw new Error('username_exists');

  const id=await nextNumericId(env,'users');
  const pw=await makePasswordV2(password);
  const createdAt=new Date().toISOString();

  const stmts=[
    env.DB.prepare(
      "INSERT INTO users (id,username,password_hash,salt,display_name,created_at,role,password_algo,password_iterations,session_version) VALUES (?,?,?,?,?,?, 'admin',?,?,1)"
    ).bind(id,username,pw.hash,pw.salt,displayName,createdAt,pw.algo,pw.iterations)
  ];
  for(const propertyId of propertyIds){
    stmts.push(env.DB.prepare(
      "INSERT INTO property_admins (property_id,user_id,access_role,created_at) VALUES (?,?, 'admin', ?)"
    ).bind(propertyId,id,createdAt));
  }
  await env.DB.batch(stmts);
  await appendLog(env,admin,'adminCreateUser','users',[id],1,'properties '+propertyIds.join(','));
  return publicUser(await userById(env,id));
}


async function provisionTenantAccount(env, admin, body) {
  if (!admin || admin.role!=='admin') throw new Error('forbidden');
  const tenantId=s(body.tenantId);
  const tenant=await dbTenant(env,tenantId);
  if(!tenant) throw new Error('tenant_not_found');
  const room=await dbRoom(env,tenant.room_id);
  if(!room) throw new Error('room_not_found');
  await requireAdminProperty(env,admin,room.property_id);

  const existingBinding=await env.DB.prepare('SELECT user_id FROM tenant_accounts WHERE tenant_id=? LIMIT 1')
    .bind(tenantId).first();
  if(existingBinding) throw new Error('tenant_account_exists');

  const username=s(body.username).trim();
  const password=s(body.password);
  const displayName=s(body.displayName).trim() || s(tenant.name).trim() || username;
  if(!username) throw new Error('username_required');
  if(password.length<4) throw new Error('password_too_short');
  if(await userByUsername(env,username)) throw new Error('username_exists');

  const id=await nextNumericId(env,'users');
  const pw=await makePasswordV2(password);
  const now=new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id,username,password_hash,salt,display_name,created_at,role,platform_role,password_algo,password_iterations,session_version,account_status) VALUES (?,?,?,?,?,?,'tenant','normal',?,?,1,'active')"
    ).bind(id,username,pw.hash,pw.salt,displayName,now,pw.algo,pw.iterations),
    env.DB.prepare(
      'INSERT INTO tenant_accounts (user_id,tenant_id,created_at) VALUES (?,?,?)'
    ).bind(id,tenantId,now)
  ]);

  await appendLog(env,admin,'provisionTenantAccount','tenant_accounts',[tenantId],1,'user '+id);
  const user=await userById(env,id);
  return {
    tenantId,
    user:publicUser(user)
  };
}

async function setTenantAccountStatus(env, admin, body) {
  if (!admin || admin.role!=='admin') throw new Error('forbidden');
  const tenantId=s(body.tenantId);
  const targetStatus=s(body.status);
  if(!['active','disabled'].includes(targetStatus)) throw new Error('invalid_account_status');

  const row=await env.DB.prepare(
    `SELECT ta.user_id,t.room_id,r.property_id
     FROM tenant_accounts ta
     JOIN tenants t ON t.id=ta.tenant_id
     JOIN rooms r ON r.id=t.room_id
     WHERE ta.tenant_id=?`
  ).bind(tenantId).first();
  if(!row) throw new Error('tenant_account_not_found');

  await requireAdminProperty(env,admin,row.property_id);
  await env.DB.prepare(
    'UPDATE users SET account_status=?,session_version=session_version+1 WHERE id=?'
  ).bind(targetStatus,String(row.user_id)).run();

  const user=await userById(env,row.user_id);
  await appendLog(env,admin,'setTenantAccountStatus','users',[String(row.user_id)],1,targetStatus+' tenant '+tenantId);
  return {
    tenantId,
    user:publicUser(user)
  };
}

async function removeAdminPropertyAccess(env, admin, targetUserId, propertyId) {
  await requirePropertyOwner(env,admin,propertyId);
  const targetId=s(targetUserId);
  if(String(admin.id)===targetId) throw new Error('cannot_remove_self_owner_access');

  const access=await env.DB.prepare(
    'SELECT access_role FROM property_admins WHERE property_id=? AND user_id=?'
  ).bind(s(propertyId),targetId).first();
  if(!access) throw new Error('access_not_found');
  if(access.access_role==='owner') throw new Error('cannot_remove_owner');

  await env.DB.prepare('DELETE FROM property_admins WHERE property_id=? AND user_id=?')
    .bind(s(propertyId),targetId).run();
  await appendLog(env,admin,'removePropertyAdmin','property_admins',[targetId],1,'property '+propertyId);
  return {success:true,userId:targetId,propertyId:s(propertyId)};
}

async function handlePost(request, env, body) {
  if (body.action === 'login') {
    const username = s(body.username).trim();
    const state=await loginLimitState(env,request,username || '__empty__');
    if (state.blocked) return {error:'too_many_attempts'};
    const user = username ? await userByUsername(env, username) : null;
    const valid = user && (user.account_status||'active')==='active'
      ? await verifyUserPassword(user,s(body.password))
      : false;
    if (!valid) {
      await recordLoginFailure(env,state);
      return {error:'invalid_credentials'};
    }
    await clearLoginFailures(env,state);
    const current=await upgradeLegacyPassword(env,user,s(body.password));
    return {success:true, token:await createToken(env,current), user:publicUser(current)};
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

  // Global shared reads are retired. Admin data is always scoped by property_admins.
  if (body.action === 'getAll') return {error:'legacy_global_read_disabled'};

  if (body.action === 'getAdminScoped') {
    try { return await getAdminScopedAll(env, x.user); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'getTenantHome') {
    try { return await getTenantHome(env, x.user); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createProperty') {
    try { return {success:true,property:await createPropertyRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'updateProperty') {
    try { return {success:true,property:await updatePropertyRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createRoom') {
    try { return {success:true,room:await createRoomRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'updateRoom') {
    try { return {success:true,room:await updateRoomRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'batchUpdateRooms') {
    try { return {success:true,rooms:await batchUpdateRooms(env,x.user,body.items)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'deleteRoom') {
    try { return await deleteRoomRow(env,x.user,body.id); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createTenant') {
    try { return {success:true,...await createTenantRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'updateTenant') {
    try { return {success:true,...await updateTenantRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'deleteTenant') {
    try { return await deleteTenantRow(env,x.user,body.id); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createBills') {
    try { return {success:true,bills:await createBillsRows(env,x.user,body.items)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'updateBill') {
    try { return {success:true,bill:await updateBillRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'batchUpdateBills') {
    try { return {success:true,bills:await batchUpdateBills(env,x.user,body.items)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'deleteBill') {
    try { return await deleteBillRow(env,x.user,body.id); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'moveBills') {
    try { return {success:true,...await moveBillsRows(env,x.user,body.ids,body.targetMonth)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createMeterReadings') {
    try { return {success:true,meterReadings:await createMeterReadingRows(env,x.user,body.items)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createRooms') {
    try { return {success:true,...await createRoomsRows(env,x.user,body.items)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'deleteProperty') {
    try { return await deletePropertyRow(env,x.user,body.id); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createDeposit') {
    try { return {success:true,deposit:await createDepositRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'deleteDeposit') {
    try { return await deleteDepositRow(env,x.user,body.id); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'createReceipt') {
    try { return {success:true,...await createReceiptRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'voidReceipt') {
    try { return {success:true,...await voidReceiptRow(env,x.user,body.receiptId,body.reason)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'upsertRoomLayout') {
    try { return {success:true,roomLayout:await upsertRoomLayoutRow(env,x.user,body.item||{})}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'deleteRoomLayouts') {
    try { return await deleteRoomLayoutsRows(env,x.user,body.roomIds); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'changePassword') {
    if (!await verifyUserPassword(x.user,s(body.oldPassword))) return {error:'wrong_old_password'};
    const p = s(body.newPassword);
    if (p.length < 4) return {error:'password_too_short'};
    const pw=await makePasswordV2(p);
    await env.DB.prepare(
      'UPDATE users SET password_hash=?,salt=?,password_algo=?,password_iterations=?,session_version=session_version+1 WHERE id=?'
    ).bind(pw.hash,pw.salt,pw.algo,pw.iterations,x.user.id).run();
    const current=await userById(env,x.user.id);
    await appendLog(env,x.user,'changePassword','users',[String(x.user.id)],1,'sessions revoked');
    return {success:true,token:await createToken(env,current)};
  }

  if (body.action === 'logoutAll') {
    await env.DB.prepare('UPDATE users SET session_version=session_version+1 WHERE id=?').bind(x.user.id).run();
    await appendLog(env,x.user,'logoutAll','users',[String(x.user.id)],1,'');
    return {success:true};
  }

  if (body.action === 'adminListUsers') {
    try {
      const scoped=await adminUserScope(env,x.user);
      return {success:true,...scoped};
    } catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'adminCreateUser') {
    try {
      return {success:true,user:await createScopedAdminUser(env,x.user,body)};
    } catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'adminResetPassword') {
    try {
      if(x.user.role!=='admin') throw new Error('forbidden');
      const target = await userById(env,s(body.userId));
      if (!target) throw new Error('user_not_found');
      if(!await adminCanManageUser(env,x.user,target.id)) throw new Error('forbidden');
      const p=s(body.newPassword);
      if (p.length<4) throw new Error('password_too_short');
      const pw=await makePasswordV2(p);
      await env.DB.prepare(
        'UPDATE users SET password_hash=?,salt=?,password_algo=?,password_iterations=?,session_version=session_version+1 WHERE id=?'
      ).bind(pw.hash,pw.salt,pw.algo,pw.iterations,target.id).run();
      await appendLog(env,x.user,'adminResetPassword','users',[String(target.id)],1,'account '+target.username+' sessions revoked');
      return {success:true};
    } catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'provisionTenantAccount') {
    try { return {success:true,...await provisionTenantAccount(env,x.user,body)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'setTenantAccountStatus') {
    try { return {success:true,...await setTenantAccountStatus(env,x.user,body)}; }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  if (body.action === 'adminRemovePropertyAccess') {
    try { return await removeAdminPropertyAccess(env,x.user,body.userId,body.propertyId); }
    catch(e) { return {error:businessErrorMessage(e)}; }
  }

  // Whole-table compatibility writes were retired in Access Control Phase C.
  // All mutations must use explicit row-level actions with server-side property authorization.
  if (body.table) return {error:'legacy_whole_table_write_disabled'};
  return {error:'unknown action'};
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
        const action = url.searchParams.get('action') || 'ping';
        if (action === 'ping') return json({ok:true,backend:'d1'},200,request,env);
        return json({error:'post_required'},405,request,env);
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
