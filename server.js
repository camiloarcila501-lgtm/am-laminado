require('./lib/env');
const express = require('express'), crypto = require('crypto'), path = require('path'), cookieParser = require('cookie-parser');
const db = require('./lib/db'), catalog = require('./lib/catalog'), shipping = require('./lib/shipping'), wompi = require('./lib/wompi'), email = require('./lib/email');
const admin = require('./lib/admin');

const app = express();
const sec = require('./lib/security');
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render está detrás de un proxy: IP real del cliente para los límites
app.use(sec.headers()); app.use(sec.permissions);
app.set('trust proxy', 1);
app.use('/api/wompi/webhook', express.json({ limit: '100kb' }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 50 }));
app.use('/api', sec.apiLimiter);
app.use(cookieParser());
// Permite que la tienda estática (otro dominio) llame a /api si se define ALLOWED_ORIGINS
app.use('/api', (req, res, next) => {
  const allow = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const o = req.get('Origin'); if (o && allow.includes(o)) { res.set('Access-Control-Allow-Origin', o); res.set('Vary', 'Origin'); res.set('Access-Control-Allow-Headers', 'Content-Type'); res.set('Access-Control-Allow-Methods', 'GET,POST'); }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  // Solo la propia tienda o las direcciones de ALLOWED_ORIGINS pueden enviar datos
  if (req.method !== 'GET' && o && !allow.includes(o)) { let h = ''; try { h = new URL(o).host; } catch {} if (h !== req.get('Host')) return res.status(403).json({ ok: false, errors: ['Origen no permitido'] }); }
  next();
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

// Contador de visitas propio (texto plano para que el navegador no haga preflight CORS)
const visits = require('./lib/visits');
app.post('/api/visita', sec.visitsLimiter, express.text({ type: 'text/plain', limit: '2kb' }), visits.handler(db, catalog));

// Compras recientes para el aviso de la tienda: nombre (solo primer nombre), ciudad, un producto y fecha. Sin datos personales.
let recentCache = { t: 0, data: [] };
const capFirst = s => { const w = String(s || '').trim().split(/\s+/)[0] || ''; return w ? w.charAt(0).toLocaleUpperCase('es-CO') + w.slice(1).toLocaleLowerCase('es-CO') : ''; };
app.get('/api/compras-recientes', async (req, res) => {
  try {
    if (Date.now() - recentCache.t > 60000) {
      const rows = await db.recent(7, 10);
      recentCache = { t: Date.now(), data: rows.map(o => {
        const it = Array.isArray(o.items) ? o.items[0] : null, nombre = capFirst(o.customer_name);
        if (!nombre || !it || !it.name) return null;
        const r = { nombre, producto: String(it.name).slice(0, 120), hace: new Date(o.created_at).toISOString() };
        const c = String(o.city || '').trim(); if (c) r.ciudad = c.slice(0, 60);
        return r;
      }).filter(Boolean) };
    }
    res.set('Cache-Control', 'public, max-age=60').json(recentCache.data);
  } catch (e) { console.error('[compras-recientes]', e.message); res.set('Cache-Control', 'no-store').json([]); }
});

app.post('/api/shipping/quote', async (req, res) => {
  const { city, department, items } = req.body || {};
  const { subtotal } = priceItems(items || []);
  res.json(await shipping.quote({ city, department, subtotal }));
});

function priceItems(items, agotados = new Set()) {
  const out = []; let subtotal = 0; const errors = [];
  for (const raw of Array.isArray(items) ? items.slice(0, 100) : []) {
    const it = raw && typeof raw === 'object' ? raw : {};
    const p = Number.isInteger(Number(it.id)) ? catalog.get(it.id) : null; const qty = Math.floor(Number(it.qty));
    if (!p) { errors.push(`Producto ${String(it.id).slice(0, 12)} no existe`); continue; }
    if (!(qty >= 1 && qty <= 99)) { errors.push(`Cantidad inválida para ${p.ref}`); continue; }
    if (agotados.has(catalog.keyOf(p))) { errors.push(`${p.name} (${p.ref}) está agotado`); continue; }
    if (!p.price) { errors.push(`${p.name} (${p.ref}) no tiene precio publicado: consúltalo por WhatsApp`); continue; }
    out.push({ id: p.id, ref: p.ref, name: p.name, cat: p.cat, price: p.price, qty }); subtotal += p.price * qty;
  }
  return { items: out, subtotal, errors };
}
// Validación estricta: solo texto, longitudes máximas y formatos
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const LIMITS = { name: [3, 100], phone: [7, 20], email: [6, 120], city: [2, 80], department: [2, 80], address: [5, 250] };
function validateCustomer(b) {
  const e = {};
  for (const [k, [min, max]] of Object.entries(LIMITS)) {
    const v = b[k];
    if (typeof v !== 'string' || CTRL.test(v)) { e[k] = 'Dato inválido'; continue; }
    const t = v.trim(); if (t.length < min || t.length > max) e[k] = `Debe tener entre ${min} y ${max} caracteres`;
  }
  if (!e.phone && !/^\+?[\d\s().-]{7,20}$/.test(b.phone.trim())) e.phone = 'Teléfono inválido';
  if (!e.email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(b.email.trim())) e.email = 'Correo inválido';
  if (b.notes != null && (typeof b.notes !== 'string' || b.notes.length > 1000)) e.notes = 'Notas demasiado largas';
  return e;
}
const CLIENT_REF = /^AM-\d{6}-[A-Z0-9]{4,8}$/;
const newRef = () => 'AM-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

app.post('/api/orders', sec.ordersLimiter, async (req, res) => {
  try {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    // Honeypot: las personas no ven el campo "website"; si viene lleno es un bot. Respondemos "ok" sin guardar.
    if (b.website) { console.warn('[seguridad] pedido descartado por honeypot', req.ip); return res.json({ ok: true, reference: newRef() }); }
    if (!Array.isArray(b.items) || b.items.length > 50) return res.status(400).json({ ok: false, errors: ['Carrito inválido'] });
    const fieldErrors = validateCustomer(b);
    const priced = priceItems(b.items, new Set(await db.soldOut()));
    if (!priced.items.length) priced.errors.push('El carrito está vacío');
    if (Object.keys(fieldErrors).length || priced.errors.length) return res.status(400).json({ ok: false, fieldErrors, errors: priced.errors });
    const PAYS = ['Bre-B / Nu (QR)', 'Transferencia', 'Nequi', 'Daviplata', 'Contraentrega'];
    const wantsWompi = b.payment === 'wompi' && wompi.enabled() && process.env.WOMPI_ENABLED === 'true';
    const method = wantsWompi ? 'wompi' : (PAYS.includes(b.payment_method) ? b.payment_method : 'whatsapp');
    const q = await shipping.quote({ city: b.city, department: b.department, subtotal: priced.subtotal });
    const shipping_cost = q.cost ?? null;
    const order = await db.create({
      reference: CLIENT_REF.test(String(b.client_reference || '')) && !(await db.byRef(b.client_reference)) ? b.client_reference : newRef(), channel: 'web', customer_name: b.name.trim(), phone: String(b.phone).trim(), email: b.email.trim().toLowerCase(),
      city: b.city.trim(), department: b.department.trim(), address: b.address.trim(), notes: String(b.notes || '').replace(CTRL, '').slice(0, 1000),
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

app.use('/admin', sec.adminLimiter);
admin.mount(app, db);
app.get('/healthz', (req, res) => res.send('ok'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', extensions: ['html'], dotfiles: 'deny', index: 'index.html' }));
app.use('/api', (req, res) => res.status(404).json({ ok: false, errors: ['No encontrado'] }));
app.use(sec.errorHandler);

const port = process.env.PORT || 3000;
if (require.main === module) db.init().then(() => app.listen(port, () => console.log(`A&M laminado en http://localhost:${port}`)));
module.exports = { app, priceItems, resetRecentCache: () => { recentCache = { t: 0, data: [] }; } };
