// Sin ninguna variable: el sitio funciona (WhatsApp), pago oculto, pedidos en memoria, admin deshabilitado.
const test = require('node:test'), assert = require('node:assert');
for (const k of ['DATABASE_URL', 'ADMIN_PASSWORD', 'WOMPI_PUBLIC_KEY', 'WOMPI_INTEGRITY_SECRET', 'WOMPI_EVENTS_SECRET', 'RESEND_API_KEY']) delete process.env[k];
const { app } = require('../server'); const catalog = require('../lib/catalog');
let srv, base;
test.before(async () => { await new Promise(r => { srv = app.listen(0, r); }); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(() => srv.close());
test('sin llaves', async () => {
  const c = await (await fetch(base + '/api/config')).json(); assert.equal(c.payments, false); assert.equal(c.persistent, false);
  assert.equal((await fetch(base + '/')).status, 200);
  const p = catalog.list.find(x => x.price);
  const j = await (await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana Pérez', phone: '3001112233', email: 'ana@example.com', city: 'Bogotá', department: 'Cundinamarca', address: 'Calle 100 # 10-20', payment: 'wompi', items: [{ id: p.id, qty: 1 }] }) })).json();
  assert.equal(j.ok, true); assert.equal(j.checkoutUrl, undefined);
  assert.equal((await fetch(base + '/admin')).status, 503);
  assert.deepEqual((await (await fetch(base + '/api/stock')).json()).agotados, []);
  assert.equal((await fetch(base + '/api/wompi/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
});
