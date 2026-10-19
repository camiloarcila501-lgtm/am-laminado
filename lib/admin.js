// Panel privado /admin protegido con ADMIN_PASSWORD (cookie de sesión firmada).
const crypto = require('crypto');
const fmt = n => n == null ? '—' : '$' + Number(n).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const secret = () => process.env.SESSION_SECRET || crypto.createHash('sha256').update('am:' + (process.env.ADMIN_PASSWORD || '')).digest('hex');
const sign = v => v + '.' + crypto.createHmac('sha256', secret()).update(v).digest('hex');
const valid = c => { if (typeof c !== 'string' || c.length > 300) return false; const i = c.lastIndexOf('.'); if (i < 1) return false; const v = c.slice(0, i); const exp = Number(v.split(':')[1]);
  const a = Buffer.from(sign(v)), b = Buffer.from(c); return a.length === b.length && crypto.timingSafeEqual(a, b) && exp > Date.now(); };
// CSRF: token ligado a la sesión (HMAC de la cookie), va oculto en cada formulario del panel
const csrfFor = cookie => crypto.createHmac('sha256', secret()).update('csrf:' + cookie).digest('hex');
const csrfField = req => `<input type="hidden" name="_csrf" value="${csrfFor(req.cookies.am_admin || '')}">`;
const sameOrigin = req => { const o = req.get('Origin') || req.get('Referer'); if (!o) return true; try { return new URL(o).host === req.get('Host'); } catch { return false; } };
const COOKIE = req => ({ httpOnly: true, sameSite: 'strict', secure: req.secure || process.env.NODE_ENV === 'production', path: '/admin' });
const COLORS = { nuevo: '#b7791f', confirmado: '#2f855a', enviado: '#2b6cb0', entregado: '#4a5568', cancelado: '#c53030' };
const email = require('./email'), catalog = require('./catalog'), sec = require('./security');

const layout = (title, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Admin A&M</title>
<style>body{margin:0;font-family:Montserrat,Arial,sans-serif;background:#f6f4ef;color:#1d1d1d}header{background:#000;color:#e8cf8a;padding:14px 20px;display:flex;justify-content:space-between;align-items:center}header b{font-family:Georgia,serif;letter-spacing:2px}header a{color:#e8cf8a;font-size:13px;margin-left:14px}
main{max-width:1150px;margin:auto;padding:20px}.card{background:#fff;border:1px solid #eee;padding:18px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:14px;background:#fff}th,td{padding:10px;border-bottom:1px solid #eee;text-align:left}th{background:#111;color:#fff;font-weight:500;font-size:12px;letter-spacing:.05em;text-transform:uppercase}
.st{display:inline-block;padding:2px 10px;border-radius:20px;color:#fff;font-size:12px}input,select,textarea{padding:8px;border:1px solid #ccc;font-family:inherit;font-size:14px}button,.btn{background:#111;color:#fff;border:0;padding:9px 16px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block}.btn.g{background:#c9a34a;color:#111}
form.f{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.kpi{font-size:26px;font-family:Georgia,serif}.muted{color:#777;font-size:13px}@media(max-width:700px){.hide-m{display:none}}</style></head>
<body><header><b>A&amp;M LAMINADO · ADMIN</b><nav><a href="/admin">Pedidos</a><a href="/admin/inventario">Inventario</a><a href="/admin/export.csv">CSV</a><a href="/admin/logout">Salir</a></nav></header><main>${body}</main></body></html>`;

function mount(app, db) {
  const need = (req, res, next) => {
    if (!process.env.ADMIN_PASSWORD) return res.status(503).send(layout('Admin', '<div class="card">El panel está deshabilitado: define la variable <b>ADMIN_PASSWORD</b>.</div>'));
    if (!valid(req.cookies.am_admin)) return res.redirect('/admin/login');
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST') {
      const t = String(req.body?._csrf || ''), good = csrfFor(req.cookies.am_admin);
      if (!sameOrigin(req) || t.length !== good.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(good))) { console.warn('[seguridad] CSRF rechazado', req.ip); return res.status(403).send('Solicitud rechazada (CSRF). Recarga la página e intenta de nuevo.'); }
    }
    next();
  };
  app.get('/admin/login', (req, res) => res.send(layout('Ingresar', `<div class="card" style="max-width:380px;margin:60px auto"><h2 style="font-family:Georgia,serif;font-weight:normal">Ingresar al panel</h2>
    ${req.query.e === 'lock' ? '<p style="color:#c53030">Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.</p>' : req.query.e ? '<p style="color:#c53030">Contraseña incorrecta</p>' : ''}<form method="post" action="/admin/login"><input type="password" name="password" placeholder="Contraseña" maxlength="200" autocomplete="current-password" style="width:100%;box-sizing:border-box" autofocus><br><br><button style="width:100%">Ingresar</button></form></div>`)));
  app.post('/admin/login', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).send('Solicitud rechazada');
    const st = sec.loginStatus(req.ip);
    if (st.locked) { res.set('Retry-After', String(st.retry)); return res.status(429).send(layout('Bloqueado', `<div class="card" style="max-width:380px;margin:60px auto"><p style="color:#c53030">Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(st.retry / 60)} minuto(s).</p><a href="/admin/login">Volver</a></div>`)); }
    const p = String(req.body?.password || '').slice(0, 200), a = String(process.env.ADMIN_PASSWORD || '');
    const ok = a && sec.safeEqual(p, a);
    if (!ok) { sec.loginFail(req.ip); return setTimeout(() => res.redirect(303, '/admin/login?e=1'), 600); }
    sec.loginOk(req.ip);
    res.cookie('am_admin', sign('admin:' + (Date.now() + 12 * 3600e3) + ':' + crypto.randomBytes(8).toString('hex')), { ...COOKIE(req), maxAge: 12 * 3600e3 });
    res.redirect('/admin');
  });
  app.get('/admin/logout', (req, res) => { res.clearCookie('am_admin', COOKIE(req)); res.redirect('/admin/login'); });

  app.get('/admin', need, async (req, res) => {
    const { status = '', q = '', from = '', to = '' } = req.query;
    const rows = await db.list({ status, q, from, to });
    const count = s => rows.filter(o => o.status === s).length;
    const sales = rows.filter(o => ['confirmado', 'enviado', 'entregado'].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const flash = req.query.borrado ? `<div class="card" style="border-color:#2f855a;color:#2f855a">✓ Pedido ${esc(String(req.query.borrado).slice(0, 30))} borrado definitivamente.</div>` : '';
    res.send(layout('Pedidos', `${flash}${db.enabled() ? '' : '<div class="card" style="border-color:#b7791f">⚠️ Sin DATABASE_URL: los pedidos se guardan en memoria y se pierden al reiniciar.</div>'}
    <div class="grid"><div class="card"><div class="muted">Pedidos (filtro actual)</div><div class="kpi">${rows.length}</div></div><div class="card"><div class="muted">Nuevos por atender</div><div class="kpi">${count('nuevo')}</div></div><div class="card"><div class="muted">Ventas confirmadas</div><div class="kpi">${fmt(sales)}</div></div></div>
    <div class="card"><form class="f" method="get"><input name="q" value="${esc(q)}" placeholder="Buscar ref., cliente, correo, ciudad"><select name="status"><option value="">Todos los estados</option>${db.STATUSES.map(s => `<option ${s === status ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <input type="date" name="from" value="${esc(from)}"><input type="date" name="to" value="${esc(to)}"><button>Filtrar</button><a class="btn g" href="/admin/export.csv?${esc(new URLSearchParams(req.query).toString())}">Exportar CSV</a></form></div>
    <table><tr><th>Ref.</th><th class="hide-m">Fecha</th><th>Cliente</th><th class="hide-m">Ciudad</th><th>Total</th><th class="hide-m">Pago</th><th>Estado</th><th></th></tr>
    ${rows.map(o => `<tr><td><a href="/admin/pedido/${Number(o.id)}">${esc(o.reference)}</a></td><td class="hide-m">${new Date(o.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td><td>${esc(o.customer_name)}<br><span class="muted">${esc(o.phone)}</span></td><td class="hide-m">${esc(o.city)}</td><td>${fmt(o.total)}${o.shipping_cost == null ? '<br><span class="muted">+ envío</span>' : ''}</td><td class="hide-m">${esc(o.payment_method || '')}</td><td><span class="st" style="background:${COLORS[o.status] || '#777'}">${esc(o.status)}</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No hay pedidos.</td></tr>'}</table>`));
  });

  app.get('/admin/pedido/:id', need, async (req, res) => {
    const o = await db.byId(req.params.id); if (!o) return res.status(404).send(layout('No encontrado', '<div class="card">Pedido no encontrado</div>'));
    const wa = `https://wa.me/57${String(o.phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hola ${o.customer_name}, te escribimos de A&M laminado 18k sobre tu pedido ${o.reference}.`)}`;
    res.send(layout(o.reference, `<p><a href="/admin">← Volver</a>${req.query.ok ? ' <span style="color:#2f855a;margin-left:12px">✓ Cambios guardados</span>' : ''}</p><div class="grid">
    <div class="card"><h2 style="font-family:Georgia,serif;font-weight:normal;margin-top:0">${esc(o.reference)} <span class="st" style="background:${COLORS[o.status] || '#777'}">${esc(o.status)}</span></h2>
    <p class="muted">${new Date(o.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })} · ${esc(o.payment_method)} ${o.payment_status ? '· ' + esc(o.payment_status) : ''} ${o.payment_id ? '· tx ' + esc(o.payment_id) : ''}</p>
    <p><b>${esc(o.customer_name)}</b><br>📞 ${esc(o.phone)} · ✉️ ${esc(o.email)}<br>📍 ${esc(o.address)}, ${esc(o.city)}, ${esc(o.department)}</p>${o.notes ? `<p><b>Notas:</b> ${esc(o.notes)}</p>` : ''}
    <a class="btn g" target="_blank" href="${esc(wa)}" rel="noopener noreferrer">Escribir por WhatsApp</a> <a class="btn" style="background:#c53030" href="/admin/pedido/${Number(o.id)}/borrar">Borrar pedido</a></div>
    <div class="card"><form method="post" action="/admin/pedido/${Number(o.id)}">${csrfField(req)}<label>Estado<br><select name="status">${db.STATUSES.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><br><br>
    <label>Costo de envío (COP)<br><input type="number" min="0" step="100" name="shipping_cost" value="${o.shipping_cost == null ? '' : Number(o.shipping_cost)}" placeholder="A convenir"></label><br><br>
    <label>Guía / transportadora<br><input name="tracking" value="${esc(o.tracking)}" style="width:100%;box-sizing:border-box"></label><br><br>
    <label>Notas internas<br><textarea name="admin_notes" rows="3" style="width:100%;box-sizing:border-box">${esc(o.admin_notes)}</textarea></label><br><br><button>Guardar cambios</button></form></div></div>
    <table><tr><th>Producto</th><th>Ref.</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.ref)}</td><td>${Number(i.qty)}</td><td>${fmt(i.price)}</td><td>${fmt(i.price * i.qty)}</td><td><a href="/admin/pedido/${Number(o.id)}/borrar" style="color:#c53030;font-size:12px">Borrar</a></td></tr>`).join('')}
    <tr><td colspan="4" style="text-align:right">Subtotal</td><td>${fmt(o.subtotal)}</td></tr><tr><td colspan="4" style="text-align:right">Envío</td><td>${o.shipping_cost == null ? 'A convenir' : fmt(o.shipping_cost)}</td></tr><tr><td colspan="4" style="text-align:right"><b>Total</b></td><td><b>${fmt(o.total)}</b></td></tr></table>`));
  });

  app.post('/admin/pedido/:id', need, async (req, res) => {
    const o = await db.byId(req.params.id); if (!o) return res.sendStatus(404);
    const f = { tracking: String(req.body.tracking || '').slice(0, 200), admin_notes: String(req.body.admin_notes || '').slice(0, 2000) };
    if (db.STATUSES.includes(req.body.status)) f.status = req.body.status;
    const sc = String(req.body.shipping_cost ?? '').trim();
    f.shipping_cost = sc === '' ? null : Math.max(0, Math.round(Number(sc)) || 0);
    f.total = o.subtotal + (f.shipping_cost || 0);
    const up = await db.update(o.id, f);
    if (f.status && f.status !== o.status) email.statusEmail(up).catch(() => {});
    res.redirect('/admin/pedido/' + o.id + '?ok=1');
  });

  // ---- Inventario: marcar agotado / disponible ----
  app.get('/admin/inventario', need, async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase(), cat = String(req.query.cat || ''), only = req.query.solo === 'agotados';
    const sold = new Set(await db.soldOut());
    const cats = [...new Set(catalog.list.map(p => p.cat))];
    let list = catalog.list.filter(p => (!cat || p.cat === cat) && (!q || (p.ref + ' ' + p.name).toLowerCase().includes(q)) && (!only || sold.has(catalog.keyOf(p))));
    const total = list.length; list = list.slice(0, 200);
    res.send(layout('Inventario', `<div class="grid"><div class="card"><div class="muted">Productos en catálogo</div><div class="kpi">${catalog.list.length}</div></div><div class="card"><div class="muted">Agotados</div><div class="kpi">${sold.size}</div></div></div>
    <div class="card"><form class="f" method="get"><input name="q" value="${esc(req.query.q || '')}" placeholder="Buscar por REF o nombre"><select name="cat"><option value="">Todas las categorías</option>${cats.map(c => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <label class="muted"><input type="checkbox" name="solo" value="agotados" ${only ? 'checked' : ''}> Solo agotados</label><button>Buscar</button></form>
    <p class="muted" style="margin:10px 0 0">${total > 200 ? `Mostrando 200 de ${total}. Usa la búsqueda para encontrar una referencia.` : `${total} productos`}</p></div>
    <table><tr><th></th><th>Ref.</th><th>Producto</th><th class="hide-m">Categoría</th><th class="hide-m">Precio</th><th>Estado</th><th></th></tr>
    ${list.map(p => { const k = catalog.keyOf(p), ag = sold.has(k); return `<tr><td><img src="/${esc(p.img)}" alt="" style="width:44px;height:44px;object-fit:cover"></td><td>${esc(p.ref)}</td><td>${esc(p.name)}</td><td class="hide-m">${esc(p.cat)}</td><td class="hide-m">${fmt(p.price)}</td>
      <td><span class="st" style="background:${ag ? '#c53030' : '#2f855a'}">${ag ? 'agotado' : 'disponible'}</span></td>
      <td><form method="post" action="/admin/inventario">${csrfField(req)}<input type="hidden" name="key" value="${esc(k)}"><input type="hidden" name="back" value="${esc(req.originalUrl)}"><input type="hidden" name="agotado" value="${ag ? '0' : '1'}"><button class="${ag ? 'btn g' : ''}">${ag ? 'Marcar disponible' : 'Marcar agotado'}</button></form></td></tr>`; }).join('')}</table>`));
  });
  app.post('/admin/inventario', need, async (req, res) => {
    const p = catalog.byKey(String(req.body.key || '')); if (!p) return res.status(400).send('Producto no encontrado');
    await db.setSoldOut(catalog.keyOf(p), p.ref, p.cat, req.body.agotado === '1');
    const back = String(req.body.back || ''); res.redirect(back.startsWith('/admin/inventario') ? back : '/admin/inventario');
  });

  // ---- Borrar pedido (con página de confirmación, sin JavaScript) ----
  app.get('/admin/pedido/:id/borrar', need, async (req, res) => {
    const o = await db.byId(req.params.id); if (!o) return res.status(404).send(layout('No encontrado', '<div class="card">Pedido no encontrado. <a href="/admin">Volver</a></div>'));
    res.send(layout('Borrar pedido', `<div class="card" style="max-width:560px;margin:40px auto;border-color:#c53030">
      <h2 style="font-family:Georgia,serif;font-weight:normal;margin-top:0">¿Borrar el pedido ${esc(o.reference)}?</h2>
      <p><b>${esc(o.customer_name)}</b> · ${esc(o.city)} · ${fmt(o.total)}</p>
      <p style="color:#c53030"><b>Esta acción no se puede deshacer.</b> El pedido y todos sus productos se eliminarán definitivamente de la base de datos y no se podrán recuperar.</p>
      <form method="post" action="/admin/pedido/${Number(o.id)}/borrar" class="f">${csrfField(req)}<button style="background:#c53030">Sí, borrar definitivamente</button><a class="btn g" href="/admin/pedido/${Number(o.id)}">Cancelar</a></form></div>`));
  });
  app.post('/admin/pedido/:id/borrar', need, async (req, res) => {
    const r = await db.remove(req.params.id); if (!r) return res.status(404).send(layout('No encontrado', '<div class="card">Pedido no encontrado. <a href="/admin">Volver</a></div>'));
    console.log(`[admin] pedido ${r.reference} borrado`);
    res.redirect(303, '/admin?borrado=' + encodeURIComponent(r.reference));
  });

  app.get('/admin/export.csv', need, async (req, res) => {
    const rows = await db.list(req.query);
    const c = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; }; // evita inyección de fórmulas en Excel
    const head = ['referencia', 'fecha', 'estado', 'cliente', 'telefono', 'correo', 'departamento', 'ciudad', 'direccion', 'productos', 'subtotal', 'envio', 'total', 'pago', 'id_pago', 'guia'];
    const lines = rows.map(o => [o.reference, new Date(o.created_at).toISOString(), o.status, o.customer_name, o.phone, o.email, o.department, o.city, o.address,
      o.items.map(i => `${i.qty}x ${i.ref} ${i.name}`).join(' | '), o.subtotal, o.shipping_cost ?? '', o.total, o.payment_method, o.payment_id, o.tracking].map(c).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`).send('\ufeff' + [head.join(','), ...lines].join('\n'));
  });
}

function resultPage(o, tx) {
  const st = tx?.status;
  const msg = !o ? 'No encontramos el pedido.' : o.status === 'confirmado' || st === 'APPROVED' ? '¡Pago aprobado! Gracias por tu compra 💛' : st === 'DECLINED' || st === 'ERROR' || st === 'VOIDED' ? 'El pago no fue aprobado. Puedes intentarlo de nuevo o escribirnos por WhatsApp.' : 'Tu pago está en proceso. Te confirmaremos por correo y WhatsApp.';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resultado del pedido · A&M laminado 18k</title>
<style>body{margin:0;font-family:Arial,sans-serif;background:#f6f4ef;text-align:center}.top{background:#000;color:#e8cf8a;padding:22px;font-family:Georgia,serif;letter-spacing:3px;font-size:22px}.c{max-width:520px;margin:40px auto;background:#fff;padding:30px;border:1px solid #eee}a.b{display:inline-block;background:#111;color:#fff;padding:12px 22px;text-decoration:none;margin:6px}</style></head>
<body><div class="top">A&amp;M LAMINADO</div><div class="c"><h2 style="font-family:Georgia,serif;font-weight:normal">${esc(msg)}</h2>${o ? `<p>Pedido <b>${esc(o.reference)}</b><br>Total: <b>${fmt(o.total)}</b>${o.shipping_cost == null ? '<br><small>El envío se confirma por WhatsApp según transportadora y ciudad.</small>' : ''}</p>` : ''}
<a class="b" href="/">Volver a la tienda</a><a class="b" style="background:#25d366" href="https://wa.me/${process.env.WHATSAPP_NUMBER || '573008918966'}?text=${encodeURIComponent('Hola, mi pedido es ' + (o?.reference || ''))}">WhatsApp</a></div></body></html>`;
}
module.exports = { mount, resultPage };
