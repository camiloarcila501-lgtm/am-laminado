// Pruebas de seguridad: cabeceras, CSRF, bloqueo de login, honeypot, validación, CORS, XSS en el panel
const test = require('node:test'), assert = require('node:assert');
Object.assign(process.env, { ADMIN_PASSWORD: 'clave-segura-123', ALLOWED_ORIGINS: 'https://am-laminado18k.onrender.com', ORDERS_RATE_LIMIT: '6' });
delete process.env.RESEND_API_KEY; delete process.env.DATABASE_URL;
const { app } = require('../server');
const db = require('../lib/db'), catalog = require('../lib/catalog'), sec = require('../lib/security');
let base, srv;
const P = catalog.list.find(p => p.price);
const form = (u, body, h = {}) => fetch(base + u, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...h }, body: new URLSearchParams(body).toString() });
const order = (b, h = {}) => fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });
const cust = { name: '<img src=x onerror=alert(1)>', phone: '3001234567', email: 'x@example.com', city: 'Cali', department: 'Valle', address: 'Calle 1 # 2-3 <script>' };
test.before(async () => { await db.init(); await new Promise(r => { srv = app.listen(0, r); }); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv.close());

test('cabeceras de seguridad y sin x-powered-by', async () => {
  const r = await fetch(base + '/');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('permissions-policy'));
  assert.equal(r.headers.get('x-powered-by'), null);
});
test('no se sirven archivos privados', async () => {
  for (const u of ['/.env', '/server.js', '/lib/db.js', '/package.json', '/.git/config', '/render.yaml']) assert.notEqual((await fetch(base + u)).status, 200, u);
});
test('validación estricta y límite de tamaño', async () => {
  assert.equal((await order({ ...cust, name: 'a'.repeat(500), items: [{ id: P.id, qty: 1 }] })).status, 400);
  assert.equal((await order({ ...cust, name: ['x'], items: [{ id: P.id, qty: 1 }] })).status, 400);
  assert.equal((await order({ ...cust, items: 'nada' })).status, 400);
  const big = await order({ ...cust, notes: 'x'.repeat(30000), items: [{ id: P.id, qty: 1 }] }); assert.equal(big.status, 413);
  const j = await big.json(); assert.ok(!JSON.stringify(j).includes('at '), 'sin trazas');
});
test('honeypot: el bot recibe ok pero no se guarda', async () => {
  const before = (await db.list()).length;
  const r = await order({ ...cust, website: 'http://spam', items: [{ id: P.id, qty: 1 }] }); assert.equal((await r.json()).ok, true);
  assert.equal((await db.list()).length, before);
});
test('CORS: solo orígenes permitidos', async () => {
  const bad = await order({ ...cust, items: [{ id: P.id, qty: 1 }] }, { Origin: 'https://malo.example' }); assert.equal(bad.status, 403);
  const ok = await order({ ...cust, items: [{ id: P.id, qty: 1 }] }, { Origin: 'https://am-laminado18k.onrender.com' });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://am-laminado18k.onrender.com'); assert.equal(ok.status, 200);
});
test('XSS: datos del cliente escapados en el panel', async () => {
  const login = await form('/admin/login', { password: 'clave-segura-123' }); const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i);
  const c = cookie.split(';')[0];
  const list = await (await fetch(base + '/admin', { headers: { cookie: c } })).text();
  assert.ok(!list.includes('<img src=x'), 'no debe haber HTML sin escapar'); assert.ok(list.includes('&lt;img src=x'));
  const id = (await db.list())[0].id;
  const page = await (await fetch(base + '/admin/pedido/' + id, { headers: { cookie: c } })).text();
  assert.ok(!page.includes('<script>')); 
  // CSRF: sin token → 403; con token → 302
  assert.equal((await form('/admin/pedido/' + id, { status: 'enviado' }, { cookie: c })).status, 403);
  const t = page.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  assert.equal((await form('/admin/pedido/' + id, { status: 'enviado', _csrf: t }, { cookie: c, Origin: 'https://malo.example' })).status, 403);
  assert.equal((await form('/admin/pedido/' + id, { status: 'enviado', _csrf: t }, { cookie: c })).status, 302);
  // cookie falsificada
  assert.equal((await fetch(base + '/admin', { redirect: 'manual', headers: { cookie: 'am_admin=admin:99999999999999.abc' } })).status, 302);
});
test('límite de pedidos por IP', async () => {
  let last; for (let i = 0; i < 6; i++) last = await order({ ...cust, name: 'Ana Pérez', address: 'Calle 1 # 2-3', items: [{ id: P.id, qty: 1 }] });
  assert.equal(last.status, 429);
});
test('login: bloqueo tras 5 intentos fallidos, incluso con la clave correcta', async () => {
  sec._resetLogin();
  for (let i = 0; i < 5; i++) assert.equal((await form('/admin/login', { password: 'mala' + i })).status, 303);
  const locked = await form('/admin/login', { password: 'clave-segura-123' });
  assert.equal(locked.status, 429); assert.ok(Number(locked.headers.get('retry-after')) > 0);
  sec._resetLogin();
  assert.match((await form('/admin/login', { password: 'clave-segura-123' })).headers.get('set-cookie') || '', /am_admin=/);
});
