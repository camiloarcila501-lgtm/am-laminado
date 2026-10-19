// Pruebas end-to-end: node --test  (requiere TEST_DATABASE_URL o usa memoria)
const test = require('node:test'), assert = require('node:assert'), crypto = require('crypto');
Object.assign(process.env, { ADMIN_PASSWORD: 'clave-prueba', WOMPI_PUBLIC_KEY: 'pub_test_abc', WOMPI_INTEGRITY_SECRET: 'test_integrity_xyz', WOMPI_EVENTS_SECRET: 'test_events_123', WOMPI_ENV: 'sandbox', WOMPI_ENABLED: 'true', ORDERS_RATE_LIMIT: '1000' });
delete process.env.RESEND_API_KEY;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const { app } = require('../server');
const db = require('../lib/db'), catalog = require('../lib/catalog');
let base, srv, cookie;
const priced = catalog.list.filter(p => p.price);
const P1 = priced[0], P2 = priced[5], NOPRICE = catalog.list.find(p => !p.price);
const cust = { name: 'Laura Gómez', phone: '300 123 4567', email: 'laura@example.com', city: 'Medellín', department: 'Antioquia', address: 'Cra 43A # 1-50 apto 301' };
const csrf = async (path = '/admin') => (await (await fetch(base + path, { headers: { cookie } })).text()).match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] || '';
const post = (u, b, h = {}) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });

test.before(async () => {
  await db.init(process.env.TEST_DATABASE_URL);
  if (db._pool()) await db._pool().query('TRUNCATE orders RESTART IDENTITY; TRUNCATE stock');
  await new Promise(r => { srv = app.listen(0, r); }); base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => { srv.close(); db._pool()?.end(); });

let order;
test('config pública', async () => {
  const c = await (await fetch(base + '/api/config')).json();
  assert.equal(c.payments, true); assert.equal(c.shippingMode, 'convenir');
});
test('validación de datos y carrito', async () => {
  const r = await post('/api/orders', { items: [], name: 'x', email: 'malo' });
  assert.equal(r.status, 400); const j = await r.json();
  assert.ok(j.fieldErrors.email && j.fieldErrors.phone && j.errors.length);
  const r2 = await post('/api/orders', { ...cust, items: [{ id: NOPRICE.id, qty: 1 }] });
  assert.equal(r2.status, 400);
});
test('pedido Wompi: precios recalculados en servidor y firma de integridad', async () => {
  const r = await post('/api/orders', { ...cust, payment: 'wompi', items: [{ id: P1.id, qty: 2, price: 1 }, { id: P2.id, qty: 1, price: 1 }] });
  const j = await r.json(); assert.equal(j.ok, true, JSON.stringify(j));
  const expected = P1.price * 2 + P2.price;
  assert.equal(j.subtotal, expected); assert.equal(j.total, expected); assert.equal(j.shipping.cost, null);
  const u = new URL(j.checkoutUrl);
  assert.equal(u.origin + u.pathname, 'https://checkout.wompi.co/p/');
  assert.equal(u.searchParams.get('amount-in-cents'), String(expected * 100));
  assert.equal(u.searchParams.get('signature:integrity'), sha(`${j.reference}${expected * 100}COPtest_integrity_xyz`));
  order = await db.byRef(j.reference); assert.equal(order.status, 'nuevo'); assert.equal(order.payment_method, 'wompi');
});
function event(tx, secret = 'test_events_123') {
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = sha(`${tx.id}${tx.status}${tx.amount_in_cents}${timestamp}${secret}`);
  return { event: 'transaction.updated', data: { transaction: tx }, environment: 'test', signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum }, timestamp, sent_at: new Date().toISOString() };
}
test('webhook Wompi: checksum inválido rechazado', async () => {
  const e = event({ id: '1-tx', status: 'APPROVED', amount_in_cents: order.total * 100, reference: order.reference }, 'otro-secreto');
  assert.equal((await post('/api/wompi/webhook', e)).status, 401);
  assert.equal((await db.byRef(order.reference)).status, 'nuevo');
});
test('webhook Wompi: monto distinto no marca pagado', async () => {
  const e = event({ id: '2-tx', status: 'APPROVED', amount_in_cents: 100, reference: order.reference });
  assert.equal((await post('/api/wompi/webhook', e)).status, 200);
  assert.equal((await db.byRef(order.reference)).status, 'nuevo');
});
test('webhook Wompi: APPROVED válido marca pagado', async () => {
  const e = event({ id: '15113-1700000000-12345', status: 'APPROVED', amount_in_cents: order.total * 100, reference: order.reference });
  const r = await post('/api/wompi/webhook', e); assert.equal(r.status, 200);
  const o = await db.byRef(order.reference); assert.equal(o.status, 'confirmado'); assert.equal(o.payment_id, '15113-1700000000-12345');
});
test('pedido por WhatsApp guardado sin pago', async () => {
  const j = await (await post('/api/orders', { ...cust, name: 'Carlos Ruiz', city: 'Cali', department: 'Valle del Cauca', payment: 'whatsapp', items: [{ id: P2.id, qty: 3 }] })).json();
  assert.equal(j.ok, true); assert.equal(j.checkoutUrl, undefined); assert.equal(j.total, P2.price * 3);
});
test('admin: requiere login', async () => {
  const r = await fetch(base + '/admin', { redirect: 'manual' }); assert.equal(r.status, 302);
  const bad = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=mala' });
  assert.match(bad.headers.get('location'), /e=1/);
  const ok = await fetch(base + '/admin/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=clave-prueba' });
  cookie = ok.headers.get('set-cookie').split(';')[0]; assert.match(cookie, /am_admin=/);
});
test('admin: lista, filtro, cambio de estado + costo de envío, CSV', async () => {
  const h = { headers: { cookie } };
  const html = await (await fetch(base + '/admin', h)).text(); assert.match(html, new RegExp(order.reference));
  const f = await (await fetch(base + '/admin?status=confirmado', h)).text(); assert.match(f, /Laura/); assert.doesNotMatch(f, /Carlos/);
  const r = await fetch(base + `/admin/pedido/${order.id}`, { method: 'POST', redirect: 'manual', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'status=enviado&shipping_cost=15000&tracking=Coordinadora+123&admin_notes=ok&_csrf=' + await csrf(`/admin/pedido/${order.id}`) });
  assert.equal(r.status, 302);
  const o = await db.byId(order.id); assert.equal(o.status, 'enviado'); assert.equal(o.shipping_cost, 15000); assert.equal(o.total, o.subtotal + 15000);
  const csv = await (await fetch(base + '/admin/export.csv', h)).text(); assert.match(csv, /referencia,fecha/); assert.match(csv, /Coordinadora 123/);
});

test('pedido con método de pago y referencia del cliente', async () => {
  const j = await (await post('/api/orders', { ...cust, client_reference: 'AM-261019-ABCD', payment: 'whatsapp', payment_method: 'Nequi', items: [{ id: P1.id, qty: 1 }] })).json();
  assert.equal(j.ok, true); assert.equal(j.reference, 'AM-261019-ABCD');
  const o = await db.byRef('AM-261019-ABCD'); assert.equal(o.status, 'nuevo'); assert.equal(o.payment_method, 'Nequi');
});
test('inventario: marcar agotado bloquea el pedido y aparece en /api/stock', async () => {
  const key = `${P2.ref}|${P2.cat}`;
  const r = await fetch(base + '/admin/inventario', { method: 'POST', redirect: 'manual', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key, agotado: '1', _csrf: await csrf('/admin/inventario') }).toString() });
  assert.equal(r.status, 302);
  const st = await (await fetch(base + '/api/stock')).json(); assert.deepEqual(st.agotados, [key]);
  const bad = await post('/api/orders', { ...cust, items: [{ id: P2.id, qty: 1 }] }); assert.equal(bad.status, 400);
  assert.match((await bad.json()).errors.join(), /agotado/);
  const inv = await (await fetch(base + '/admin/inventario?solo=agotados', { headers: { cookie } })).text(); assert.match(inv, /Marcar disponible/);
  await fetch(base + '/admin/inventario', { method: 'POST', redirect: 'manual', headers: { cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ key, agotado: '0', _csrf: await csrf('/admin/inventario') }).toString() });
  assert.deepEqual((await (await fetch(base + '/api/stock')).json()).agotados, []);
});
test('admin: borrar pedido con confirmación y CSRF', async () => {
  const j = await (await post('/api/orders', { ...cust, name: 'PRUEBA - borrar', items: [{ id: P1.id, qty: 1 }] })).json();
  const o = await db.byRef(j.reference);
  const conf = await (await fetch(base + `/admin/pedido/${o.id}/borrar`, { headers: { cookie } })).text();
  assert.match(conf, /no se puede deshacer/); assert.match(conf, /definitivamente/);
  const t = conf.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  const H = { cookie, 'Content-Type': 'application/x-www-form-urlencoded' };
  assert.equal((await fetch(base + `/admin/pedido/${o.id}/borrar`, { method: 'POST', redirect: 'manual', headers: H, body: '' })).status, 403);
  assert.equal((await fetch(base + `/admin/pedido/${o.id}/borrar`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_csrf=' + t })).status, 302);
  assert.ok(await db.byId(o.id), 'sigue existiendo sin sesión/CSRF');
  const r = await fetch(base + `/admin/pedido/${o.id}/borrar`, { method: 'POST', redirect: 'manual', headers: H, body: '_csrf=' + t });
  assert.equal(r.status, 303); assert.match(r.headers.get('location'), /borrado=AM-/);
  assert.equal(await db.byId(o.id), null);
  const list = await (await fetch(base + r.headers.get('location'), { headers: { cookie } })).text(); assert.match(list, /borrado definitivamente/);
  const detail = await (await fetch(base + '/admin/pedido/1', { headers: { cookie } })).text(); assert.match(detail, /Borrar pedido/);
});
test('admin: actualización automática (JSON con filtros, nuevos desde since, script externo)', async () => {
  assert.equal((await fetch(base + '/admin/api/pedidos', { redirect: 'manual' })).status, 302, 'requiere sesión');
  const page = await (await fetch(base + '/admin?status=nuevo', { headers: { cookie } })).text();
  assert.match(page, /<script src="\/admin\/static\/pedidos.js" defer><\/script>/); assert.ok(!/<script>/.test(page), 'sin JS en línea');
  assert.match(page, /Activar avisos/); assert.match(page, /id="live" data-max="\d+"/);
  const js = await fetch(base + '/admin/static/pedidos.js'); assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /javascript/);
  const a = await (await fetch(base + '/admin/api/pedidos?status=nuevo', { headers: { cookie } })).json();
  const j = await (await post('/api/orders', { ...cust, name: 'Cliente <b>Nuevo</b>', items: [{ id: P1.id, qty: 2 }] })).json();
  const b = await (await fetch(base + `/admin/api/pedidos?status=nuevo&since=${a.maxId}`, { headers: { cookie } })).json();
  assert.equal(b.nuevos.length, 1); assert.equal(b.nuevos[0].reference, j.reference); assert.equal(b.total, a.total + 1);
  assert.ok(b.html.includes('&lt;b&gt;Nuevo') && !b.html.includes('<b>Nuevo'), 'HTML escapado');
  const c = await (await fetch(base + `/admin/api/pedidos?status=entregado&since=${a.maxId}`, { headers: { cookie } })).json();
  assert.equal(c.nuevos.length, 0, 'respeta el filtro de estado');
  const del = await (await fetch(base + `/admin/pedido/${b.nuevos[0].id}/borrar`, { headers: { cookie } })).text();
  assert.ok(!del.includes('pedidos.js'), 'la confirmación de borrado no se actualiza sola');
  const det = await (await fetch(base + `/admin/pedido/${b.nuevos[0].id}`, { headers: { cookie } })).text();
  assert.ok(!det.includes('pedidos.js'), 'el detalle no se actualiza solo'); assert.equal((det.match(/\/borrar"/g) || []).length, 1, 'un solo botón borrar en el detalle');
});
test('pedido con Bre-B / Nu (QR) se acepta y guarda el método', async () => {
  const j = await (await post('/api/orders', { ...cust, payment: 'whatsapp', payment_method: 'Bre-B / Nu (QR)', items: [{ id: P1.id, qty: 1 }] })).json();
  assert.equal(j.ok, true); assert.equal((await db.byRef(j.reference)).payment_method, 'Bre-B / Nu (QR)');
  const r = await fetch(base + '/img/qr-breb-nu.png'); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /png/);
});
