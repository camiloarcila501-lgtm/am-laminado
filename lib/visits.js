// Contador de visitas propio y respetuoso de la privacidad: no guarda IP ni navegador, solo un id anónimo que cambia cada día.
const crypto = require('crypto');
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp\/|embedly|curl|wget|python|axios|node-fetch|go-http|java\/|httpclient|monitor|uptime|render/i;
const SOURCES = ['Instagram', 'Facebook', 'TikTok', 'WhatsApp', 'Google', 'Directo', 'Otro'];
const secret = () => process.env.VISITS_SECRET || process.env.SESSION_SECRET || crypto.createHash('sha256').update('visits:' + (process.env.ADMIN_PASSWORD || 'am')).digest('hex');
const today = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // AAAA-MM-DD hora Colombia
const daysAgo = n => today(new Date(Date.now() - n * 864e5));

function bucket(ref, utm) {
  const t = (String(utm || '') + ' ' + (() => { try { return new URL(String(ref || '')).hostname; } catch { return ''; } })()).toLowerCase().trim();
  if (!t) return 'Directo';
  if (/instagram|\big\b/.test(t)) return 'Instagram';
  if (/facebook|\bfb\b|fb\.|messenger/.test(t)) return 'Facebook';
  if (/tiktok/.test(t)) return 'TikTok';
  if (/whatsapp|wa\.me/.test(t)) return 'WhatsApp';
  if (/google/.test(t)) return 'Google';
  return 'Otro';
}
const cleanPath = p => { p = String(p || '/').split(/[?#]/)[0].slice(0, 80); if (!/^\/[a-z0-9\-._/]*$/i.test(p)) return null; return p === '/' || p === '/index' ? '/index.html' : p; };

function handler(db, catalog) {
  return async (req, res) => {
    res.status(204).end(); // responder de inmediato; el registro es en segundo plano
    try {
      const ua = String(req.get('User-Agent') || '');
      if (!ua || BOT.test(ua)) return;
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return; } }
      if (!b || typeof b !== 'object') return;
      const kind = b.t === 'producto' ? 'producto' : 'pagina';
      const path = cleanPath(b.p); if (!path || path.startsWith('/admin')) return;
      let product_id = null, product_name = null;
      if (kind === 'producto') { const p = catalog.get(b.id); if (!p) return; product_id = Number(p.id); product_name = `${p.name} (${p.ref})`.slice(0, 150); }
      const day = today();
      const visitor = crypto.createHmac('sha256', secret()).update(`${req.ip}|${ua}|${day}`).digest('hex').slice(0, 16);
      await db.addVisit({ day, kind, path, product_id, product_name, source: bucket(b.r, b.u), device: /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'Móvil' : 'Computador', visitor });
    } catch (e) { console.error('[visita]', e.message); }
  };
}

async function stats(db) {
  const rows = await db.visitsSince(daysAgo(29)), t = today(), d7 = daysAgo(6);
  const pages = rows.filter(r => r.kind === 'pagina');
  const uniq = L => new Set(L.map(r => r.visitor)).size;
  const range = from => { const L = rows.filter(r => r.day >= from); return { unicos: uniq(L), vistas: L.filter(r => r.kind === 'pagina').length }; };
  const top = (L, key, n) => Object.entries(L.reduce((m, r) => (m[key(r)] = (m[key(r)] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]).slice(0, n);
  const daily = []; for (let i = 29; i >= 0; i--) { const d = daysAgo(i), L = rows.filter(r => r.day === d); daily.push({ day: d, unicos: uniq(L), vistas: L.filter(r => r.kind === 'pagina').length }); }
  const byVisitor = (L, key) => { const m = {}; for (const r of L) (m[key(r)] ||= new Set()).add(r.visitor); return Object.entries(m).map(([k, s]) => [k, s.size]).sort((a, b) => b[1] - a[1]); };
  return { hoy: range(t), semana: range(d7), mes: range(daysAgo(29)), daily,
    paginas: top(pages, r => r.path, 10), productos: top(rows.filter(r => r.kind === 'producto'), r => r.product_name, 10),
    fuentes: byVisitor(pages, r => r.source), dispositivos: byVisitor(pages, r => r.device) };
}
module.exports = { handler, stats, bucket, BOT, SOURCES, today };
