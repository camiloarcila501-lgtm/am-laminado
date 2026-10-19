require('./lib/env');
const express = require('express'), crypto = require('crypto'), path = require('path'), cookieParser = require('cookie-parser');
const db = require('./lib/db'), catalog = require('./lib/catalog'), shipping = require('./lib/shipping'), wompi = require('./lib/wompi'), email = require('./lib/email');
const admin = require('./lib/admin');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// Permite que la tienda estática (otro dominio) llame a /api si se define ALLOWED_ORIGINS
app.use('/api', (req, res, next) => {
  const allow = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const o = req.get('Origin'); if (o && allow.includes(o)) { res.set('Access-Control-Allow-Origin', o); res.set('Vary', 'Origin'); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET,POST'); }
  if (req.method === 'OPTIONS') return res.sendStatus(204); next();
});

const baseUrl = req => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

// Configuración pública para el frontend (qué integraciones están activas)
app.get('/api/config', (req, res) => res.json({
  payments: wompi.enabled() && process.env.WOMPI_ENABLED === 'true', ordersSaved: true, persistent: db.enabled(), shippingMode: shipping.mode(),
  whatsapp: process.env.WHATSAPP_NUMBER || '573008918966'
}));

// Productos agotados (la tienda los consulta; si falla, todo se muestra disponible)
app.get('/api/stock', async (req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ agotados: await db.soldOut() }); }
  catch (e) { console.error('[stock]', e.message); res.json({ agotados: [] }); }
});

app.post('/api/shipping/quote', async (req, res) => {
  const { city, department, items } = req.body || {};
  const { subtotal } = priceItems(items || []);
  res.json(await shipping.quote({ city, department, subtotal }));
});

function priceItems(items, agotados = new Set()) {
  const out = []; let subtotal = 0; const errors = [];
  for (const it of Array.isArray(items) ? items.slice(0, 100) : []) {
    const p = catalog.get(it.id); const qty = Math.floor(Number(it.qty));
    if (!p) { errors.push(`Producto ${it.id} no existe`); continue; }
    if (!(qty >= 1 && qty <= 99)) { errors.push(`Cantidad inválida para ${p.ref}`); continue; }
    if (agotados.has(catalog.keyOf(p))) { errors.push(`${p.name} (${p.ref}) está agotado`); continue; }
    if (!p.price) { errors.push(`${p.name} (${p.ref}) no tiene precio publicado: consúltalo por WhatsApp`); continue; }
    out.push({ id: p.id, ref: p.ref, name: p.name, cat: p.cat, price: p.price, qty }); subtotal += p.price * qty;
  }
  return { items: out, subtotal, errors };
}
function validateCustomer(b) {
  const e = {}; const s = k => String(b[k] || '').trim();
  if (s('name').length < 3) e.name = 'Escribe tu nombre completo';
  if (s('phone').replace(/\D/g, '').length < 7) e.phone = 'Teléfono inválido';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s('email'))) e.email = 'Correo inválido';
  if (s('city').length < 2) e.city = 'Escribe tu ciudad';
  if (s('department').length < 2) e.department = 'Escribe tu departamento';
  if (s('address').length < 5) e.address = 'Escribe tu dirección';
  return e;
}
const CLIENT_REF = /^AM-\d{6}-[A-Z0-9]{4,8}$/;
const newRef = () => 'AM-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

app.post('/api/orders', async (req, res) => {
  try {
    const b = req.body || {};
    const fieldErrors = validateCustomer(b);
    const priced = priceItems(b.items, new Set(await db.soldOut()));
    if (!priced.items.length) priced.errors.push('El carrito está vacío');
    if (Object.keys(fieldErrors).length || priced.errors.length) return res.status(400).json({ ok: false, fieldErrors, errors: priced.errors });
    const PAYS = ['Transferencia', 'Nequi', 'Daviplata', 'Contraentrega'];
    const wantsWompi = b.payment === 'wompi' && wompi.enabled() && process.env.WOMPI_ENABLED === 'true';
    const method = wantsWompi ? 'wompi' : (PAYS.includes(b.payment_method) ? b.payment_method : 'whatsapp');
    const q = await shipping.quote({ city: b.city, department: b.department, subtotal: priced.subtotal });
    const shipping_cost = q.cost ?? null;
    const order = await db.create({
      reference: CLIENT_REF.test(String(b.client_reference || '')) && !(await db.byRef(b.client_reference)) ? b.client_reference : newRef(), channel: 'web', customer_name: b.name.trim(), phone: String(b.phone).trim(), email: b.email.trim().toLowerCase(),
      city: b.city.trim(), department: b.department.trim(), address: b.address.trim(), notes: String(b.notes || '').slice(0, 1000),
      items: priced.items, subtotal: priced.subtotal, shipping_cost, shipping_mode: q.mode, total: priced.subtotal + (shipping_cost || 0), payment_method: method
    });
    email.orderEmails(order, 'nuevo').catch(() => {});
    const resp = { ok: true, reference: order.reference, subtotal: order.subtotal, shipping: q, total: order.total, items: order.items };
    if (method === 'wompi') resp.checkoutUrl = wompi.checkoutUrl({ reference: order.reference, amountInCents: order.total * 100, redirectUrl: `${baseUrl(req)}/pedido/resultado?ref=${order.reference}`, email: order.email, name: order.customer_name, phone: order.phone });
    res.json(resp);
  } catch (e) { console.error(e); res.status(500).json({ ok: false, errors: ['Error guardando el pedido. Intenta por WhatsApp.'] }); }
});

async function markPaid(order, tx) {
  if (!order || order.status !== 'nuevo') return order;
  if (Number(tx.amount_in_cents) !== order.total * 100) { console.warn('[wompi] monto no coincide', order.reference); return order; }
  const up = await db.update(order.id, { status: 'confirmado', payment_id: tx.id, payment_status: tx.status, payment_method: 'wompi' });
  email.orderEmails(up, 'pagado').catch(() => {});
  return up;
}

// Webhook de eventos Wompi (configurar URL de eventos en el dashboard de Wompi)
app.post('/api/wompi/webhook', async (req, res) => {
  const evt = req.body;
  const headerSum = req.get('X-Event-Checksum');
  if (headerSum && evt?.signature && !evt.signature.checksum) evt.signature.checksum = headerSum;
  if (!wompi.verifyEvent(evt)) return res.status(401).json({ ok: false, error: 'checksum inválido' });
  try {
    if (evt.event === 'transaction.updated') {
      const tx = evt.data.transaction; const order = await db.byRef(tx.reference);
      if (order) {
        if (tx.status === 'APPROVED') await markPaid(order, tx);
        else await db.update(order.id, { payment_id: tx.id, payment_status: tx.status });
      }
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ ok: false }); }
});

// Página de resultado tras el Web Checkout (Wompi agrega ?id=<transacción>)
app.get('/pedido/resultado', async (req, res) => {
  const order = req.query.ref ? await db.byRef(String(req.query.ref)) : null;
  let tx = null;
  if (req.query.id) {
    try { const r = await fetch(`${wompi.apiBase()}/transactions/${encodeURIComponent(req.query.id)}`); if (r.ok) tx = (await r.json()).data; } catch {}
  }
  let o = order;
  if (tx && order && tx.reference === order.reference && tx.status === 'APPROVED') o = await markPaid(order, tx);
  res.send(admin.resultPage(o, tx));
});

admin.mount(app, db);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', extensions: ['html'] }));
app.get('/healthz', (req, res) => res.send('ok'));

const port = process.env.PORT || 3000;
if (require.main === module) db.init().then(() => app.listen(port, () => console.log(`A&M laminado en http://localhost:${port}`)));
module.exports = { app, priceItems };
