// Correos con Resend. Opcional: si falta RESEND_API_KEY o EMAIL_FROM no se envía nada.
const fmt = n => '$' + Number(n || 0).toLocaleString('es-CO');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const enabled = () => !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

function template(o, { title, intro }) {
  const rows = o.items.map(i => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(i.name)}<br><small style="color:#888">${esc(i.ref)}</small></td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.price * i.qty)}</td></tr>`).join('');
  const ship = o.shipping_cost == null ? 'Se confirma por WhatsApp según transportadora y ciudad' : fmt(o.shipping_cost);
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#222">
<div style="max-width:600px;margin:0 auto;background:#fff">
<div style="background:#000;color:#e8cf8a;text-align:center;padding:24px"><div style="font-family:Georgia,serif;font-size:24px;letter-spacing:3px">A&amp;M LAMINADO</div><div style="font-size:10px;letter-spacing:4px;color:#c9a34a">FINE JEWELRY 18K</div></div>
<div style="padding:28px"><h2 style="font-family:Georgia,serif;font-weight:normal">${esc(title)}</h2><p>${intro}</p>
<p><b>Pedido:</b> ${esc(o.reference)}<br><b>Estado:</b> ${esc(o.status)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f6f4ef"><th style="padding:8px;text-align:left">Producto</th><th>Cant.</th><th style="text-align:right;padding:8px">Valor</th></tr>${rows}</table>
<p style="text-align:right">Subtotal: <b>${fmt(o.subtotal)}</b><br>Envío: ${esc(ship)}<br><span style="font-size:18px">Total: <b>${fmt(o.total)}</b></span></p>
<p><b>Envío a:</b> ${esc(o.customer_name)} · ${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.city)}, ${esc(o.department)}</p>
<p style="color:#666;font-size:13px">¿Dudas? Escríbenos por WhatsApp: <a href="https://wa.me/${process.env.WHATSAPP_NUMBER || '573008918966'}">+57 300 891 8966</a></p></div>
<div style="background:#000;color:#999;text-align:center;font-size:11px;padding:14px">© A&amp;M laminado 18k · Joyería en oro laminado 18k · Colombia</div></div></body></html>`;
}
async function send(to, subject, html) {
  if (!enabled() || !to) return { skipped: true };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, html }) });
    if (!r.ok) console.error('[email]', r.status, await r.text());
    return { ok: r.ok };
  } catch (e) { console.error('[email]', e.message); return { ok: false }; }
}
async function orderEmails(o, kind = 'nuevo') {
  const paid = kind === 'pagado';
  const c = send(o.email, paid ? `Pago confirmado – Pedido ${o.reference}` : `Recibimos tu pedido ${o.reference}`,
    template(o, { title: paid ? '¡Pago confirmado! 💛' : '¡Gracias por tu pedido!', intro: paid ? 'Recibimos tu pago. Te avisaremos cuando tu pedido sea enviado.' : `Hola ${esc(o.customer_name)}, recibimos tu pedido. Te contactaremos por WhatsApp para confirmar el envío y el pago.` }));
  const w = send(process.env.OWNER_EMAIL, `${paid ? 'Pago recibido' : 'Nuevo pedido'} ${o.reference} – ${fmt(o.total)}`, template(o, { title: paid ? 'Pago recibido' : 'Nuevo pedido en la web', intro: `Cliente: ${esc(o.customer_name)} · ${esc(o.email)}` }));
  return Promise.all([c, w]);
}
module.exports = { enabled, send, orderEmails, template };
