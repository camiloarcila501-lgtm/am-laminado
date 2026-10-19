// Pedidos en Postgres (DATABASE_URL). Si no hay DATABASE_URL se usa memoria (se pierde al reiniciar).
const { Pool } = require('pg');
let pool = null, mem = [], memId = 0;
const STATUSES = ['nuevo', 'confirmado', 'enviado', 'entregado', 'cancelado'];
let memStock = new Map();

async function init(connStr = process.env.DATABASE_URL) {
  if (!connStr) { console.warn('[db] DATABASE_URL no definido: pedidos en memoria (solo pruebas).'); return; }
  const ssl = /localhost|127\.0\.0\.1/.test(connStr) || process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false };
  pool = new Pool({ connectionString: connStr, ssl });
  try { await pool.query('SELECT 1'); } catch (e) {
    if (ssl && /ssl/i.test(e.message)) { await pool.end().catch(() => {}); pool = new Pool({ connectionString: connStr, ssl: false }); }
    else throw e;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'nuevo',
    channel TEXT NOT NULL DEFAULT 'web',
    customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
    city TEXT NOT NULL, department TEXT NOT NULL, address TEXT NOT NULL, notes TEXT,
    items JSONB NOT NULL,
    subtotal INTEGER NOT NULL,
    shipping_cost INTEGER,
    shipping_mode TEXT NOT NULL DEFAULT 'convenir',
    total INTEGER NOT NULL,
    payment_method TEXT, payment_id TEXT, payment_status TEXT,
    tracking TEXT, admin_notes TEXT
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status)`);
  await pool.query(`UPDATE orders SET status = CASE status WHEN 'pendiente' THEN 'nuevo' WHEN 'pagado' THEN 'confirmado' ELSE status END WHERE status IN ('pendiente','pagado')`);
  await pool.query(`ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'nuevo'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS stock (
    product_key TEXT PRIMARY KEY,
    ref TEXT NOT NULL, category TEXT NOT NULL,
    agotado BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}
const enabled = () => !!pool;

async function create(o) {
  if (!pool) { const r = { ...o, id: ++memId, created_at: new Date(), updated_at: new Date(), status: 'nuevo' }; mem.push(r); return r; }
  const { rows } = await pool.query(`INSERT INTO orders (reference,channel,customer_name,phone,email,city,department,address,notes,items,subtotal,shipping_cost,shipping_mode,total,payment_method)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [o.reference, o.channel, o.customer_name, o.phone, o.email, o.city, o.department, o.address, o.notes, JSON.stringify(o.items), o.subtotal, o.shipping_cost, o.shipping_mode, o.total, o.payment_method]);
  return rows[0];
}
async function byRef(ref) {
  if (!pool) return mem.find(o => o.reference === ref) || null;
  const { rows } = await pool.query('SELECT * FROM orders WHERE reference=$1', [ref]); return rows[0] || null;
}
async function byId(id) {
  id = Number(id); if (!Number.isSafeInteger(id) || id < 1) return null;
  if (!pool) return mem.find(o => o.id === Number(id)) || null;
  const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1', [id]); return rows[0] || null;
}
async function list({ status, q, from, to } = {}) {
  const D = /^\d{4}-\d{2}-\d{2}$/; status = STATUSES.includes(status) ? status : ''; q = typeof q === 'string' ? q.slice(0, 100) : '';
  from = D.test(from) ? from : ''; to = D.test(to) ? to : '';
  if (!pool) return mem.filter(o => (!status || o.status === status)).slice().reverse();
  const w = [], v = [];
  if (status) { v.push(status); w.push(`status=$${v.length}`); }
  if (q) { v.push('%' + q + '%'); w.push(`(reference ILIKE $${v.length} OR customer_name ILIKE $${v.length} OR email ILIKE $${v.length} OR phone ILIKE $${v.length} OR city ILIKE $${v.length})`); }
  if (from) { v.push(from); w.push(`created_at >= $${v.length}::date`); }
  if (to) { v.push(to); w.push(`created_at < ($${v.length}::date + 1)`); }
  const { rows } = await pool.query(`SELECT * FROM orders ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 1000`, v);
  return rows;
}
async function update(id, f) {
  const allowed = ['status', 'shipping_cost', 'total', 'payment_id', 'payment_status', 'payment_method', 'tracking', 'admin_notes'];
  const keys = Object.keys(f).filter(k => allowed.includes(k));
  if (!keys.length) return byId(id);
  if (!pool) { const o = await byId(id); Object.assign(o, Object.fromEntries(keys.map(k => [k, f[k]])), { updated_at: new Date() }); return o; }
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(',');
  const { rows } = await pool.query(`UPDATE orders SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`, [id, ...keys.map(k => f[k])]);
  return rows[0];
}
// ---- Inventario: productos agotados (clave = REF + categoría, porque una misma REF se repite entre categorías) ----
async function soldOut() {
  if (!pool) return [...memStock.keys()];
  const { rows } = await pool.query('SELECT product_key FROM stock WHERE agotado'); return rows.map(r => r.product_key);
}
async function setSoldOut(key, ref, category, agotado) {
  if (!pool) { agotado ? memStock.set(key, true) : memStock.delete(key); return; }
  await pool.query(`INSERT INTO stock (product_key, ref, category, agotado) VALUES ($1,$2,$3,$4)
    ON CONFLICT (product_key) DO UPDATE SET agotado = EXCLUDED.agotado, updated_at = now()`, [key, ref, category, agotado]);
}
// Borrar pedido definitivamente (los productos del pedido están en la misma fila, columna items)
async function remove(id) {
  id = Number(id); if (!Number.isSafeInteger(id) || id < 1) return null;
  if (!pool) { const i = mem.findIndex(o => o.id === id); return i < 0 ? null : mem.splice(i, 1)[0]; }
  const { rows } = await pool.query('DELETE FROM orders WHERE id=$1 RETURNING id, reference', [id]); return rows[0] || null;
}
module.exports = { remove, soldOut, setSoldOut, init, enabled, create, byRef, byId, list, update, STATUSES, _pool: () => pool };
