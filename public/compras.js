/* Aviso de compras recientes: solo pedidos reales desde /api/compras-recientes. Si no hay datos o falla, no se muestra nada. */
(() => {
  const KEY = "am_rc_off", MAXN = 5, FIRST = 8000, EVERY = 25000, SHOW = 7000;
  try { if (sessionStorage.getItem(KEY)) return; } catch {}
  const base = window.AM_API_BASE || "";
  const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hace = iso => {
    const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 60) return `hace ${m} ${m === 1 ? "minuto" : "minutos"}`;
    const h = Math.round(m / 60); if (h < 24) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
    const d = Math.round(h / 24); return `hace ${d} ${d === 1 ? "día" : "días"}`;
  };
  // Búsqueda pendiente al llegar al inicio desde otra página
  const applySearch = q => { const i = document.getElementById("q"); if (!i) return false; i.value = q; i.dispatchEvent(new Event("input", { bubbles: true })); document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth" }); return true; };
  try { const p = sessionStorage.getItem("am_rc_q"); if (p) { sessionStorage.removeItem("am_rc_q"); setTimeout(() => applySearch(p), 300); } } catch {}
  let list = [], idx = 0, shown = 0, el, hideT, nextT;
  function build() {
    el = document.createElement("div"); el.className = "rc"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    el.innerHTML = `<button type="button" class="rc-body"></button><button type="button" class="rc-x" aria-label="Cerrar aviso">×</button>`;
    document.body.appendChild(el);
    el.querySelector(".rc-x").addEventListener("click", () => { el.classList.remove("show"); clearTimeout(nextT); clearTimeout(hideT); try { sessionStorage.setItem(KEY, "1"); } catch {} });
    el.querySelector(".rc-body").addEventListener("click", () => {
      const q = el.dataset.q || ""; if (!q) return; el.classList.remove("show");
      if (!applySearch(q)) { try { sessionStorage.setItem("am_rc_q", q); } catch {} location.href = "index.html#catalogo"; }
    });
  }
  function show() {
    if (shown >= MAXN || !list.length) return;
    const x = list[idx++ % list.length]; shown++;
    el.dataset.q = x.producto;
    el.querySelector(".rc-body").innerHTML = `<span class="rc-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg></span><span class="rc-t"><b>${e(x.nombre)}${x.ciudad ? ` de ${e(x.ciudad)}` : ""}</b> compró <span>${e(x.producto)}</span><small>${e(hace(x.hace))}</small></span>`;
    el.classList.add("show");
    hideT = setTimeout(() => el.classList.remove("show"), SHOW);
    if (shown < MAXN) nextT = setTimeout(show, EVERY);
  }
  (async () => {
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(base + "/api/compras-recientes", { signal: ctl.signal });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return;
      const j = await r.json();
      list = (Array.isArray(j) ? j : []).filter(x => x && typeof x.nombre === "string" && typeof x.producto === "string" && !isNaN(Date.parse(x.hace)));
      if (!list.length) return;
      build(); nextT = setTimeout(show, FIRST);
    } catch { /* sin servidor: no se muestra nada */ }
  })();
})();
