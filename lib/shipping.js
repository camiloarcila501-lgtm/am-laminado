// Módulo de envíos enchufable.
// Modo por defecto: SHIPPING_MODE=convenir -> el envío NO se cobra en la web; se confirma por WhatsApp
// según transportadora y ciudad, y el dueño lo registra por pedido en /admin.
// Opcional (deshabilitado por defecto): SHIPPING_MODE=tabla usa SHIPPING_RATES (JSON) o shipping.json.
// Opcional: SHIPPING_MODE=carrier usa un adaptador de transportadora (stub, ver adapters abajo).
const fs = require('fs'), path = require('path');
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function loadRates() {
  if (process.env.SHIPPING_RATES) return JSON.parse(process.env.SHIPPING_RATES);
  const f = path.join(__dirname, '..', 'shipping.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

const tableAdapter = {
  name: 'tabla',
  async quote({ city, department, subtotal }) {
    const r = loadRates(); if (!r) return null;
    const free = Number(process.env.FREE_SHIPPING_MIN || r.free_shipping_min || 0);
    if (free && subtotal >= free) return { cost: 0, label: 'Envío gratis' };
    for (const z of r.zones || []) {
      const hit = (z.cities || []).some(c => norm(c) === norm(city)) || (z.departments || []).some(d => norm(d) === norm(department));
      if (hit) return { cost: z.cost, label: z.name };
    }
    return r.default != null ? { cost: r.default, label: 'Resto del país' } : null;
  }
};

// Stub para integrar una API de transportadora (Coordinadora, Servientrega, Interrapidísimo...)
// cuando el negocio tenga contrato. Implementar quote() con CARRIER_API_KEY.
const carrierAdapter = {
  name: 'carrier',
  async quote(/* { city, department, subtotal, items } */) {
    if (!process.env.CARRIER_API_KEY) return null;
    throw new Error('Adaptador de transportadora no implementado todavía');
  }
};

const mode = () => (process.env.SHIPPING_MODE || 'convenir').toLowerCase();
async function quote(args) {
  const m = mode();
  try {
    const a = m === 'tabla' ? tableAdapter : m === 'carrier' ? carrierAdapter : null;
    const q = a ? await a.quote(args) : null;
    if (q) return { mode: m, ...q };
  } catch (e) { console.error('[shipping]', e.message); }
  return { mode: 'convenir', cost: null, label: 'Envío: se confirma por WhatsApp según transportadora y ciudad' };
}
module.exports = { quote, mode, adapters: { tableAdapter, carrierAdapter } };
