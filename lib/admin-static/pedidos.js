// Panel A&M: actualización automática de la lista de pedidos (archivo externo, compatible con la CSP).
(() => {
  const INTERVAL = 15000;
  const live = document.getElementById('live'), tbody = document.getElementById('rows');
  if (!live || !tbody) return;
  const fresh = new Set();
  let maxId = Number(live.dataset.max) || 0, lastOk = Date.now(), unseen = 0, timer = null, busy = false;
  const baseTitle = document.title, ago = document.getElementById('ago'), btn = document.getElementById('notif');
  const filters = new URLSearchParams(location.search); filters.delete('borrado');
  const $ = id => document.getElementById(id);

  // Botón "Activar avisos": pide permiso de notificaciones y desbloquea el sonido
  let audio = null;
  const canNotify = 'Notification' in window;
  const paintBtn = () => {
    if (!btn) return;
    if (!canNotify) { btn.textContent = 'Avisos no disponibles'; btn.disabled = true; return; }
    btn.textContent = Notification.permission === 'granted' ? 'Avisos activados ✓' : Notification.permission === 'denied' ? 'Avisos bloqueados en el navegador' : 'Activar avisos';
    btn.disabled = Notification.permission !== 'default' && !!audio;
  };
  btn && btn.addEventListener('click', async () => {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); } catch {}
    if (canNotify && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
    paintBtn(); beep();
  });
  paintBtn();
  function beep() {
    if (!audio || audio.state !== 'running') return;
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + i * 0.18); g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
      o.connect(g).connect(audio.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.2); });
  }

  const setTitle = () => { document.title = unseen ? `(${unseen}) ${baseTitle}` : baseTitle; };
  const tick = () => { const s = Math.round((Date.now() - lastOk) / 1000); ago.textContent = document.hidden ? 'Actualización en pausa (pestaña oculta)' : s < 5 ? 'Actualizado ahora' : `Actualizado hace ${s} s`; };
  setInterval(tick, 1000);

  // No refrescar si la persona está escribiendo en los filtros
  const editing = () => { const a = document.activeElement; return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };

  async function poll() {
    if (busy || document.hidden) return;
    if (editing()) return;
    busy = true;
    try {
      const q = new URLSearchParams(filters); q.set('since', maxId);
      const r = await fetch('/admin/api/pedidos?' + q, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.redirected || r.status === 401 || r.status === 302) { ago.textContent = 'Sesión vencida: vuelve a ingresar'; stop(); return; }
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      const y = window.scrollY;
      tbody.innerHTML = j.html; // HTML generado y escapado por el servidor
      $('k-total').textContent = j.total; $('k-nuevo').textContent = j.nuevo; $('k-ventas').textContent = j.ventas;
      window.scrollTo(0, y);
      if (j.nuevos.length) {
        unseen += j.nuevos.length; setTitle(); beep();
        j.nuevos.forEach(n => fresh.add(n.id));
        if (canNotify && Notification.permission === 'granted') {
          const n = j.nuevos[0];
          const note = new Notification(j.nuevos.length > 1 ? `${j.nuevos.length} pedidos nuevos` : `Nuevo pedido ${n.reference}`, { body: j.nuevos.length > 1 ? 'Revisa el panel de A&M' : `${n.customer_name} · $${Number(n.total).toLocaleString('es-CO')}`, tag: 'am-pedidos' });
          note.onclick = () => { window.focus(); note.close(); };
        }
      }
      // resaltar los pedidos nuevos hasta que la persona vuelva a la pestaña
      fresh.forEach(id => { const tr = tbody.querySelector(`tr[data-id="${id}"]`); tr && tr.classList.add('new'); });
      maxId = Math.max(maxId, j.maxId); lastOk = Date.now(); tick();
    } catch (e) { ago.textContent = 'Sin conexión, reintentando…'; }
    finally { busy = false; }
  }
  const markSeen = () => { if (!document.hidden && unseen) setTimeout(() => { unseen = 0; setTitle(); fresh.clear(); }, 8000); };
  window.addEventListener('focus', markSeen);
  const start = () => { if (!timer) timer = setInterval(poll, INTERVAL); };
  const stop = () => { clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); tick(); } else { poll(); start(); markSeen(); } });
  start();
})();
