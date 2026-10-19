/* ===================== CONFIGURACIÓN ===================== */
const WHATSAPP_NUMBER = "573008918966";
// Redes sociales: deja vacío "" para ocultar el ícono.
const SOCIAL = { facebook: "", instagram: "", tiktok: "" };
const MARQUEE = ["Asesoría personalizada por WhatsApp", "Envíos a toda Colombia", "Joyería en oro laminado 18k", "Precios al detal"];
const API_BASE = window.AM_API_BASE || ""; // opcional: URL del servidor si la tienda está en otro dominio
const API_ORDERS = API_BASE + "/api/orders"; // si no existe, el pedido sigue por WhatsApp
const API_STOCK = API_BASE + "/api/stock";   // si no existe, todo se muestra disponible
let SOLD = new Set();
const isSoldOut = p => SOLD.has(`${p.ref}|${p.cat}`);
/* ========================================================= */

const PRODUCTS = (window.CATALOGO || []).map(p => ({ ...p, id: Number(p.id) }));
const BYID = new Map(PRODUCTS.map(p => [p.id, p]));
const PAGE = 24;
const DEPTOS = ["Amazonas","Antioquia","Arauca","Atlántico","Bogotá D.C.","Bolívar","Boyacá","Caldas","Caquetá","Casanare","Cauca","Cesar","Chocó","Córdoba","Cundinamarca","Guainía","Guaviare","Huila","La Guajira","Magdalena","Meta","Nariño","Norte de Santander","Putumayo","Quindío","Risaralda","San Andrés, Providencia y Santa Catalina","Santander","Sucre","Tolima","Valle del Cauca","Vaupés","Vichada"];
const PAYS = ["Transferencia", "Nequi", "Daviplata", "Contraentrega"];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => "$" + Number(n).toLocaleString("es-CO");
const waURL = msg => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
const openWA = msg => window.open(waURL(msg), "_blank", "noopener");

/* ---------- Redes, franja, año ---------- */
const ICON = {
  facebook: '<path d="M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/>',
  instagram: '<path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>',
  tiktok: '<path d="M16 2c.3 2.4 1.8 4 4 4.2v3.3a7.6 7.6 0 0 1-4-1.2v6.9A6.2 6.2 0 1 1 9.8 9v3.4a2.9 2.9 0 1 0 2.9 2.8V2z"/>'
};
const soc = Object.entries(SOCIAL).filter(([, u]) => u).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" aria-label="${k}"><svg viewBox="0 0 24 24">${ICON[k]}</svg></a>`).join("");
$("#social").innerHTML = soc; $("#social2").innerHTML = soc;
$("#track").innerHTML = [...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map(t => `<span>${esc(t)}</span>`).join("");
$("#yr").textContent = new Date().getFullYear();
document.addEventListener("click", e => { const a = e.target.closest("[data-wa]"); if (a) { e.preventDefault(); openWA(a.dataset.wa); } });

/* ---------- Catálogo ---------- */
let filter = "Todos", shown = PAGE;
const cats = ["Todos", ...new Set(PRODUCTS.map(p => p.cat))];
const catCount = c => c === "Todos" ? PRODUCTS.length : PRODUCTS.filter(p => p.cat === c).length;
function renderFilters() {
  $("#filters").innerHTML = cats.map(c => `<button role="tab" class="${c === filter ? "active" : ""}" data-c="${esc(c)}">${esc(c)}<span>${catCount(c)}</span></button>`).join("");
}
$("#filters").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; filter = b.dataset.c; shown = PAGE; renderFilters(); renderGrid(); });
function filtered() {
  const q = $("#q").value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return PRODUCTS.filter(p => (filter === "Todos" || p.cat === filter) && (!q || (p.name + " " + p.ref + " " + p.cat).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(q)));
}
function card(p, i) {
  const price = p.price ? `<div class="price">${fmt(p.price)}</div>` : `<div class="price ask">Consultar precio</div>`;
  const so = isSoldOut(p);
  const btn = so ? `<button class="add" disabled>Agotado</button>` : p.price ? `<button class="add" data-add="${p.id}">Agregar al carrito</button>` : `<button class="add" data-ask="${p.id}">Consultar por WhatsApp</button>`;
  return `<article class="card${so ? " soldout" : ""}" data-id="${p.id}" style="animation-delay:${(i % PAGE) * 30}ms"><div class="ph"><img loading="lazy" src="${esc(p.img)}" alt="${esc(p.name)}">${so ? `<span class="so-badge">Agotado</span>` : ""}</div>
  <div class="body"><span class="ref">${esc(p.ref)} · ${esc(p.cat)}</span><h3>${esc(p.name)}</h3>${price}${btn}</div></article>`;
}
function renderGrid() {
  const list = filtered();
  $("#grid").innerHTML = list.slice(0, shown).map(card).join("") || `<p class="empty" style="grid-column:1/-1">No encontramos productos con esa búsqueda.</p>`;
  $("#resCount").textContent = list.length ? `${list.length} ${list.length === 1 ? "producto" : "productos"}` : "";
  $("#more").style.display = list.length > shown ? "inline-flex" : "none";
}
$("#more").onclick = () => { shown += PAGE; renderGrid(); };
let qT; $("#q").addEventListener("input", () => { clearTimeout(qT); qT = setTimeout(() => { shown = PAGE; renderGrid(); }, 180); });
$("#grid").addEventListener("click", e => {
  const a = e.target.closest("[data-add]"), k = e.target.closest("[data-ask]");
  if (a) { add(+a.dataset.add); a.classList.add("done"); a.textContent = "Agregado ✓"; setTimeout(() => { a.classList.remove("done"); a.textContent = "Agregar al carrito"; }, 1400); }
  if (k) { const p = BYID.get(+k.dataset.ask); openWA(`Hola, quiero conocer el precio y la disponibilidad de: ${p.name} (${p.ref}).`); }
});
function goSearch() { closeMenu(); location.hash = "catalogo"; setTimeout(() => $("#q").focus(), 350); }

/* ---------- Carrito ---------- */
const CART_KEY = "am_cart_v3";
let cart = {}; try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "{}"); } catch { cart = {}; }
// Sanear el carrito guardado: solo productos existentes y cantidades enteras 1–99
cart = Object.fromEntries(Object.entries(cart && typeof cart === "object" ? cart : {}).map(([id, q]) => [id, Math.floor(Number(q))]).filter(([id, q]) => BYID.has(+id) && q >= 1 && q <= 99));
function lines() { return Object.entries(cart).map(([id, q]) => ({ p: BYID.get(+id), q })).filter(l => l.p && l.p.price && l.q > 0 && !isSoldOut(l.p)); }
const subtotal = () => lines().reduce((s, l) => s + l.p.price * l.q, 0);
function save() { localStorage.setItem(CART_KEY, JSON.stringify(cart)); renderCart(); }
function add(id) { cart[id] = (cart[id] || 0) + 1; save(); toast("Producto agregado al carrito"); const b = $("#count"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
function setQty(id, d) { cart[id] = (cart[id] || 0) + d; if (cart[id] <= 0) delete cart[id]; save(); }
function itemHTML(l, editable = true) {
  return `<div class="item"><img src="${esc(l.p.img)}" alt=""><div><div class="rf">${esc(l.p.ref)}</div><div class="nm">${esc(l.p.name)}</div><div class="pr">${fmt(l.p.price)}</div>
  ${editable ? `<button class="rm" data-rm="${l.p.id}">Quitar</button>` : ""}</div>
  ${editable ? `<div class="qty"><button data-q="${l.p.id}" data-d="-1" aria-label="Menos">−</button><span>${l.q}</span><button data-q="${l.p.id}" data-d="1" aria-label="Más">+</button></div>` : `<div>×${l.q}</div>`}</div>`;
}
function renderCart() {
  const L = lines(), n = L.reduce((s, l) => s + l.q, 0);
  const c = $("#count"); c.textContent = n; c.classList.toggle("on", n > 0);
  $("#items").innerHTML = L.length ? L.map(l => itemHTML(l)).join("") : `<div class="empty"><p>Tu carrito está vacío.</p><br><a href="#catalogo" class="btn ghost" data-act="closeAll()">Ver catálogo</a></div>`;
  $("#dfoot").style.display = L.length ? "block" : "none";
  $("#sub").textContent = fmt(subtotal());
}
document.addEventListener("click", e => {
  const q = e.target.closest("[data-q]"), r = e.target.closest("[data-rm]");
  if (q) setQty(+q.dataset.q, +q.dataset.d);
  if (r) { delete cart[r.dataset.rm]; save(); }
  if (q || r) { if ($("#co").classList.contains("show")) renderStep(); }
});
function openCart() { closeMenu(); $("#drawer").classList.add("open"); $("#overlay").classList.add("show"); }
function closeAll() { $("#drawer").classList.remove("open"); $("#overlay").classList.remove("show"); closeMenu(); }
function toggleMenu() { const m = $("#menu"), o = m.classList.toggle("open"); $("#overlay").classList.toggle("show", o); document.body.classList.toggle("menu-open", o); }
function closeMenu() { $("#menu").classList.remove("open"); document.body.classList.remove("menu-open"); if (!$("#drawer").classList.contains("open")) $("#overlay").classList.remove("show"); }
$("#menu").addEventListener("click", e => { if (e.target.closest("a")) closeAll(); });
let tT; function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(() => t.classList.remove("show"), 1800); }

/* ---------- Modales ---------- */
function openModal(id) { document.getElementById(id).classList.add("show"); }
function closeModal() { document.querySelectorAll(".modal").forEach(m => m.classList.remove("show")); }
document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) closeModal(); }));
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (document.querySelector(".modal.show")) closeModal(); else if ($("#co").classList.contains("show")) closeCheckout(); else if ($("#pd").classList.contains("show")) closePD(); else closeAll(); } });

/* ---------- Checkout (Carrito → Datos → Confirmar) ---------- */
let step = 1, lastOrder = null;
const FORM_KEY = "am_form_v1";
let form = { nombre: "", cedula: "", celular: "", correo: "", depto: "", ciudad: "", direccion: "", barrio: "", indicaciones: "", pago: "", acepta: false };
try { Object.assign(form, JSON.parse(localStorage.getItem(FORM_KEY) || "{}"), { acepta: false }); } catch {}
if (!PAYS.includes(form.pago)) form.pago = PAYS[0]; // seleccionado por defecto
function startCheckout() { if (!lines().length) return; closeAll(); step = 1; $("#co").classList.add("show"); document.body.style.overflow = "hidden"; renderStep(); }
function closeCheckout() { $("#co").classList.remove("show"); document.body.style.overflow = ""; if (step === 4) { step = 1; } }
function setSteps() {
  $("#steps").style.display = step === 4 ? "none" : "flex";
  document.querySelectorAll("#steps li").forEach(li => { const s = +li.dataset.s; li.className = s === step ? "on" : s < step ? "done" : ""; li.querySelector("i").textContent = s < step ? "✓" : s; });
}
function summaryHTML() {
  const L = lines();
  return `<aside class="summary"><h3>Resumen del pedido</h3>${L.map(l => `<div class="sitem"><img src="${esc(l.p.img)}" alt=""><div><div>${esc(l.p.name)}</div><div class="q">${esc(l.p.ref)} · ${l.q} × ${fmt(l.p.price)}</div></div><div class="v">${fmt(l.p.price * l.q)}</div></div>`).join("")}
  <div style="margin-top:14px"><div class="row"><span>Subtotal</span><b>${fmt(subtotal())}</b></div><div class="row"><span>Envío</span><span class="note">A convenir según transportadora</span></div>
  <div class="row tot"><span>Total productos</span><span>${fmt(subtotal())}</span></div></div></aside>`;
}
const field = (id, label, opts = {}) => `<div class="f ${opts.full ? "full" : ""}" id="f-${id}"><label for="i-${id}">${label}${opts.opt ? " <em>(opcional)</em>" : ""}</label>${opts.html || `<input class="in" id="i-${id}" name="${id}" value="${esc(form[id])}" ${opts.attrs || ""}>`}<div class="msg"></div></div>`;
function renderStep() {
  setSteps(); const v = $("#coView"); $("#co").scrollTop = 0;
  if (!lines().length && step < 4) { v.innerHTML = `<div class="thanks"><h2>Tu carrito está vacío</h2><p>Agrega productos para hacer tu pedido.</p><button class="btn" data-act="closeCheckout()">Ver catálogo</button></div>`; return; }
  if (step === 1) {
    v.innerHTML = `<div class="co-body"><div><h2>Revisa tu carrito</h2><p class="sub">Ajusta las cantidades antes de continuar.</p><div class="citems">${lines().map(l => itemHTML(l)).join("")}</div>
    <div class="co-actions"><button class="btn ghost" data-act="closeCheckout()">Seguir comprando</button><button class="btn" data-act="go(2)">Continuar a mis datos</button></div></div>${summaryHTML()}</div>`;
  } else if (step === 2) {
    v.innerHTML = `<div class="co-body"><form id="dataForm" novalidate><h2>Tus datos de envío</h2><div class="hp" aria-hidden="true"><label>No llenar este campo<input id="i-website" name="website" tabindex="-1" autocomplete="off"></label></div><p class="sub">Los campos marcados como opcionales no son obligatorios.</p><div class="fg">
    ${field("nombre", "Nombre completo", { full: true, attrs: 'autocomplete="name"' })}
    ${field("cedula", "Cédula", { opt: true, attrs: 'inputmode="numeric" autocomplete="off"' })}
    ${field("celular", "Celular", { attrs: 'inputmode="tel" autocomplete="tel-national" placeholder="300 123 4567"' })}
    ${field("correo", "Correo electrónico", { full: true, attrs: 'type="email" inputmode="email" autocomplete="email"' })}
    ${field("depto", "Departamento", { html: `<select class="in" id="i-depto" name="depto"><option value="">Selecciona…</option>${DEPTOS.map(d => `<option ${d === form.depto ? "selected" : ""}>${d}</option>`).join("")}</select>` })}
    ${field("ciudad", "Ciudad o municipio", { attrs: 'autocomplete="address-level2"' })}
    ${field("direccion", "Dirección", { full: true, attrs: 'autocomplete="street-address" placeholder="Calle, carrera, número, apto o casa"' })}
    ${field("barrio", "Barrio")}
    ${field("indicaciones", "Indicaciones de entrega", { opt: true, attrs: 'placeholder="Ej.: portería, horario, punto de referencia"' })}
    ${field("pago", "Método de pago preferido", { full: true, html: `<div class="pays">${PAYS.map(p => `<label><input type="radio" name="pago" value="${p}" ${form.pago === p ? "checked" : ""}> ${p}</label>`).join("")}</div>` })}
    <div class="f full" id="f-acepta"><label class="check" style="text-transform:none;letter-spacing:0;font-weight:400;font-size:.86rem;color:#4a463f"><input type="checkbox" id="i-acepta" ${form.acepta ? "checked" : ""}><span>Acepto los <button type="button" data-act="openModal(&#39;m-terminos&#39;)">términos y condiciones</button> y autorizo el <button type="button" data-act="openModal(&#39;m-datos&#39;)">tratamiento de mis datos personales</button>.</span></label><div class="msg"></div></div>
    </div><div class="co-actions"><button type="button" class="btn ghost" data-act="go(1)">Volver</button><button class="btn">Revisar pedido</button></div></form>${summaryHTML()}</div>`;
    const f = $("#dataForm");
    f.addEventListener("input", e => { readForm(); const id = e.target.name || e.target.id.replace("i-", ""); if ($("#f-" + id)?.classList.contains("bad")) validate(id); });
    f.addEventListener("change", e => { readForm(); validate(e.target.name || e.target.id.replace("i-", "")); });
    f.addEventListener("focusout", e => { const id = e.target.name; if (id && e.target.value) validate(id); });
    f.addEventListener("submit", e => { e.preventDefault(); readForm(); const bad = RULES_KEYS.filter(k => !validate(k)); if (bad.length) { document.getElementById("f-" + bad[0]).scrollIntoView({ behavior: "smooth", block: "center" }); return; } go(3); });
  } else if (step === 3) {
    const d = form;
    v.innerHTML = `<div class="co-body"><div><h2>Confirma tu pedido</h2><p class="sub">Revisa que todo esté correcto. Al confirmar se abrirá WhatsApp con el resumen para terminar la compra.</p>
    <div class="review"><h4>Datos de contacto <button data-act="go(2)">Editar</button></h4><p>${esc(d.nombre)}${d.cedula ? ` · C.C. ${esc(d.cedula)}` : ""}<br>${esc(fmtCel(d.celular))} · ${esc(d.correo)}</p></div>
    <div class="review"><h4>Dirección de envío <button data-act="go(2)">Editar</button></h4><p>${esc(d.direccion)}, barrio ${esc(d.barrio)}<br>${esc(d.ciudad)}, ${esc(d.depto)}${d.indicaciones ? `<br><span class="small">${esc(d.indicaciones)}</span>` : ""}</p></div>
    <div class="review"><h4>Pago y envío <button data-act="go(2)">Editar</button></h4><p>Método de pago: ${esc(d.pago)}<br><span class="small">El costo del envío se confirma por WhatsApp según la transportadora y tu ciudad.</span></p></div>
    <div class="review"><h4>Productos <button data-act="go(1)">Editar</button></h4><div class="citems">${lines().map(l => itemHTML(l, false)).join("")}</div></div>
    <div class="co-actions"><button class="btn ghost" data-act="go(2)">Volver</button><button class="btn wa" id="confirmBtn" data-act="submitOrder()">Confirmar pedido por WhatsApp</button></div></div>${summaryHTML()}</div>`;
  } else {
    const o = lastOrder;
    v.innerHTML = `<div class="thanks"><div class="ok"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div><span class="eyebrow">Pedido registrado</span><h2>¡Gracias por tu compra, ${esc(o.nombre.split(" ")[0])}!</h2>
    <div class="num">${esc(o.ref)}</div><p>Abrimos WhatsApp con el resumen de tu pedido. <b>Envía el mensaje</b> para que confirmemos disponibilidad, costo de envío y datos de pago.</p>
    <p class="small">Total productos: ${fmt(o.total)} · Envío a convenir según transportadora.</p><br>
    <div class="co-actions" style="justify-content:center"><a class="btn wa" href="${waURL(o.msg)}" target="_blank" rel="noopener">Abrir WhatsApp de nuevo</a><button class="btn ghost" data-act="closeCheckout()">Volver a la tienda</button></div></div>`;
  }
}
function go(s) { step = s; renderStep(); }
function readForm() {
  const f = $("#dataForm"); if (!f) return;
  ["nombre", "cedula", "celular", "correo", "depto", "ciudad", "direccion", "barrio", "indicaciones"].forEach(k => { const el = $("#i-" + k); if (el) form[k] = el.value; });
  form.pago = (f.querySelector('input[name="pago"]:checked') || {}).value || "";
  form.acepta = $("#i-acepta").checked;
  const { acepta, ...keep } = form; localStorage.setItem(FORM_KEY, JSON.stringify(keep));
}
const digits = s => String(s || "").replace(/\D/g, "");
const fmtCel = s => { const d = digits(s).slice(-10); return d.replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3"); };
const RULES = {
  nombre: v => v.trim().split(/\s+/).filter(w => w.length > 1).length >= 2 || "Escribe tu nombre y apellido.",
  cedula: v => !v.trim() || /^\d{5,10}$/.test(digits(v)) && digits(v).length === v.replace(/[.\s]/g, "").length || "La cédula debe tener entre 5 y 10 dígitos, sin letras.",
  celular: v => { const d = digits(v).replace(/^57(?=\d{10}$)/, ""); return /^3\d{9}$/.test(d) || "Escribe un celular colombiano de 10 dígitos que empiece por 3."; },
  correo: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Escribe un correo válido, por ejemplo nombre@correo.com.",
  depto: v => !!v || "Selecciona tu departamento.",
  ciudad: v => v.trim().length >= 3 || "Escribe tu ciudad o municipio.",
  direccion: v => v.trim().length >= 6 && /\d/.test(v) || "Escribe la dirección completa con número.",
  barrio: v => v.trim().length >= 3 || "Escribe tu barrio.",
  pago: v => !!v || "Elige un método de pago.",
  acepta: v => v === true || "Debes aceptar los términos y el tratamiento de datos para continuar."
};
const RULES_KEYS = Object.keys(RULES);
function validate(k) {
  if (!RULES[k]) return true;
  const r = RULES[k](form[k]); const box = document.getElementById("f-" + k); if (!box) return r === true;
  box.classList.toggle("bad", r !== true); box.classList.toggle("good", r === true && k !== "acepta" && k !== "pago");
  box.querySelector(".msg").textContent = r === true ? "" : r; return r === true;
}
function orderRef() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = ""; const rnd = crypto.getRandomValues(new Uint8Array(4)); rnd.forEach(b => r += A[b % A.length]);
  return `AM-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${r}`;
}
function orderMessage(ref, L, d) {
  const t = L.reduce((s, l) => s + l.p.price * l.q, 0);
  return [`*NUEVO PEDIDO ${ref}*`, `A&M Laminado 18k`, ``, `*Productos*`,
    ...L.map(l => `• ${l.q} × ${l.p.name}\n   ${l.p.ref} · ${fmt(l.p.price)} c/u = ${fmt(l.p.price * l.q)}`), ``,
    `Subtotal: ${fmt(t)}`, `Envío: a convenir según transportadora`, `*Total productos: ${fmt(t)}*`, ``,
    `*Datos del cliente*`, `Nombre: ${d.nombre.trim()}`, ...(d.cedula.trim() ? [`Cédula: ${d.cedula.trim()}`] : []), `Celular: ${fmtCel(d.celular)}`, `Correo: ${d.correo.trim()}`, ``,
    `*Envío*`, `Departamento: ${d.depto}`, `Ciudad: ${d.ciudad.trim()}`, `Dirección: ${d.direccion.trim()}`, `Barrio: ${d.barrio.trim()}`, ...(d.indicaciones.trim() ? [`Indicaciones: ${d.indicaciones.trim()}`] : []), ``,
    `*Método de pago:* ${d.pago}`].join("\n");
}
let hpVal = ""; // trampa anti-bots (honeypot): las personas no ven este campo
document.addEventListener("input", e => { if (e.target.id === "i-website") hpVal = e.target.value; });
async function submitOrder() {
  const L = lines(); if (!L.length) return;
  const btn = $("#confirmBtn"); btn.disabled = true; btn.textContent = "Procesando…";
  const d = { ...form }, ref = orderRef(), msg = orderMessage(ref, L, d);
  const win = window.open("", "_blank"); // abrir antes del await para evitar bloqueo de ventanas emergentes
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
    await fetch(API_ORDERS, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      client_reference: ref, items: L.map(l => ({ id: l.p.id, qty: l.q })), name: d.nombre, phone: digits(d.celular), email: d.correo,
      city: d.ciudad, department: d.depto, address: `${d.direccion}, barrio ${d.barrio}`, payment: "whatsapp", payment_method: d.pago, website: hpVal,
      notes: [`Ref. web: ${ref}`, d.cedula && `Cédula: ${d.cedula}`, `Pago preferido: ${d.pago}`, d.indicaciones && `Indicaciones: ${d.indicaciones}`].filter(Boolean).join(" | ") }) });
  } catch (e) { /* sitio estático: sin backend, seguimos por WhatsApp */ }
  if (win) win.location.href = waURL(msg); else location.href = waURL(msg);
  lastOrder = { ref, msg, nombre: d.nombre, total: L.reduce((s, l) => s + l.p.price * l.q, 0) };
  cart = {}; save(); step = 4; renderStep();
}

/* ---------- Slider ---------- */
const slides = [...document.querySelectorAll("#slider .slide")]; let si = 0, sT;
$("#dots").innerHTML = slides.map((_, i) => `<button aria-label="Ir a la diapositiva ${i + 1}" data-i="${i}"></button>`).join("");
function slideTo(i) { si = (i + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle("on", k === si));
  document.querySelectorAll("#dots button").forEach((d, k) => { d.classList.remove("on"); if (k === si) { void d.offsetWidth; d.classList.add("on"); } });
  const img = slides[si].querySelector("img"); if (img.loading === "lazy") img.loading = "eager";
  clearTimeout(sT); sT = setTimeout(() => slideTo(si + 1), 6000); }
function slideGo(d) { slideTo(si + d); }
$("#dots").addEventListener("click", e => { const b = e.target.closest("button"); if (b) slideTo(+b.dataset.i); });
let tx0 = null; $("#slider").addEventListener("touchstart", e => tx0 = e.touches[0].clientX, { passive: true });
$("#slider").addEventListener("touchend", e => { if (tx0 == null) return; const dx = e.changedTouches[0].clientX - tx0; if (Math.abs(dx) > 45) slideGo(dx < 0 ? 1 : -1); tx0 = null; });
slideTo(0);

/* ---------- Categorías y destacados ---------- */
const TILE_IMG = { "Anillos": "fotos/p32_1.jpg", "Candongas": "fotos/p620_1.jpg" };
const TILE_CATS = ["Anillos", "Aretes y topos", "Candongas", "Cadenas", "Dijes", "Pulseras"].filter(c => PRODUCTS.some(p => p.cat === c));
const firstImg = c => (PRODUCTS.find(p => p.cat === c && p.price) || PRODUCTS.find(p => p.cat === c)).img;
$("#tiles").innerHTML = TILE_CATS.map(c => `<button class="tile" data-cat="${esc(c)}"><img loading="lazy" class="${TILE_IMG[c] ? "" : "studio"}" src="${esc(TILE_IMG[c] || firstImg(c))}" alt=""><span><b>${esc(c)}</b><small>${catCount(c)} piezas</small></span></button>`).join("");
const RAILS = [["Anillos", "Selección", "Anillos destacados"], ["Candongas", "Para todos los días", "Candongas"], ["Cadenas", "Esenciales", "Cadenas"], ["Pulseras", "Para tu muñeca", "Pulseras"]];
function pick(c, n = 12) { const L = PRODUCTS.filter(p => p.cat === c && p.price); const step = Math.max(1, Math.floor(L.length / n)); return L.filter((_, i) => i % step === 0).slice(0, n); }
$("#rails").innerHTML = RAILS.filter(([c]) => catCount(c)).map(([c, e, t], k) => `<div class="rail rv"><div class="rail-head"><div><span class="eyebrow">${esc(e)}</span><h3>${esc(t)}</h3></div>
  <div class="rail-nav"><a data-cat="${esc(c)}">Ver todo</a><button aria-label="Anterior" data-rail="${k}" data-d="-1"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button aria-label="Siguiente" data-rail="${k}" data-d="1"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div></div>
  <div class="track-r" id="rail${k}">${pick(c).map(card).join("")}</div></div>`).join("");
document.querySelectorAll("#rails .rv").forEach(el => io2(el));
function io2(el) { new IntersectionObserver((es, o) => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add("in"); o.disconnect(); } }), { threshold: .1 }).observe(el); }
document.addEventListener("click", e => {
  const r = e.target.closest("[data-rail]"); if (r) { const t = $("#rail" + r.dataset.rail); t.scrollBy({ left: t.clientWidth * .9 * +r.dataset.d }); return; }
  const c = e.target.closest("[data-cat]"); if (c) { e.preventDefault(); filter = c.dataset.cat; shown = PAGE; $("#q").value = ""; renderFilters(); renderGrid(); closePD(); $("#catalogo").scrollIntoView({ behavior: "smooth" }); return; }
  const o = e.target.closest(".card .ph, .card h3"); if (o) { const id = o.closest(".card").dataset.id; if (id) openPD(+id); }
  const add2 = e.target.closest("#rails [data-add], #pdView [data-add]"); if (add2) { add(+add2.dataset.add); add2.classList.add("done"); add2.textContent = "Agregado ✓"; setTimeout(() => { add2.classList.remove("done"); add2.textContent = "Agregar al carrito"; }, 1400); }
  const ask2 = e.target.closest("#rails [data-ask], #pdView [data-ask]"); if (ask2) { const p = BYID.get(+ask2.dataset.ask); openWA(`Hola, quiero conocer el precio y la disponibilidad de: ${p.name} (${p.ref}).`); }
});

/* ---------- Detalle de producto (#producto-ID) ---------- */
let pdQty = 1, pdCur = null;
function openPD(id) { if (location.hash !== "#producto-" + id) history.pushState(null, "", "#producto-" + id); renderPD(id); }
function closePD() { if (!$("#pd").classList.contains("show")) return; $("#pd").classList.remove("show"); document.body.style.overflow = ""; if (location.hash.startsWith("#producto-")) history.pushState(null, "", location.pathname + location.search); }
function renderPD(id) {
  const p = BYID.get(id); if (!p) return; pdCur = p; pdQty = 1;
  const imgs = [p.img, ...(p.gallery || [])];
  const desc = `${p.name}. Pieza en oro laminado 18k de la categoría ${p.cat.toLowerCase()}, referencia ${p.ref.replace("REF ", "")}.`;
  const rel = PRODUCTS.filter(x => x.cat === p.cat && x.id !== p.id && x.price).slice(0, 8);
  $("#pdView").innerHTML = `<div class="pd-body">
   <div class="gal"><div class="thumbs">${imgs.length > 1 ? imgs.map((u, i) => `<button class="${i ? "" : "on"}" data-img="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join("") : ""}</div>
   <div class="main" id="pdMain"><img src="${esc(p.img)}" alt="${esc(p.name)}"></div></div>
   <div class="pinfo"><div class="crumbs"><a data-act="closePD()">Inicio</a> / <a data-cat="${esc(p.cat)}">${esc(p.cat)}</a></div>
    <span class="ref">${esc(p.ref)}</span><h2>${esc(p.name)}</h2>
    ${isSoldOut(p) ? `<div class="pp">${p.price ? fmt(p.price) : ""}</div><div class="tax"><span class="so-badge" style="position:static;display:inline-block">Agotado</span> Escríbenos y te avisamos cuando vuelva a estar disponible.</div>` : p.price ? `<div class="pp">${fmt(p.price)}</div><div class="tax">Precio al detal · Envío a convenir según transportadora</div>
    <div class="buy"><div class="qty"><button data-act="pdQ(-1)" aria-label="Menos">−</button><span id="pdQ">1</span><button data-act="pdQ(1)" aria-label="Más">+</button></div><button class="btn" data-act="pdAdd()">Agregar al carrito</button></div>
    <button class="btn ghost block" data-act="pdAdd(true)">Comprar ahora</button>` : `<div class="pp ask">Consultar precio</div><div class="tax">Te confirmamos precio y disponibilidad por WhatsApp.</div>`}
    <a href="#" class="btn wa block" style="margin-top:10px" data-wa="Hola, quiero información sobre: ${esc(p.name)} (${esc(p.ref)}).">Preguntar por WhatsApp</a>
    <div class="perks"><div><svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/></svg>Garantía por defectos de fabricación</div><div><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/></svg>Envíos a toda Colombia</div></div>
    <div class="acc"><details open><summary>Descripción</summary><div><p>${esc(desc)}</p></div></details>
    <details><summary>Garantía</summary><div><p>Tu joya cuenta con garantía por defectos de fabricación. <a href="#" data-act="openModal(&#39;m-garantia&#39;);return false">Ver política de garantía</a>.</p></div></details>
    <details><summary>Cuidados</summary><div><ul><li>Evita perfumes, cremas, cloro y productos de limpieza.</li><li>Quítatela para bañarte, nadar o hacer ejercicio.</li><li>Límpiala con un paño suave y seco.</li><li>Guárdala en una bolsa o estuche individual.</li></ul></div></details>
    <details><summary>Envíos y pagos</summary><div><p>Enviamos a toda Colombia. El costo del envío se confirma por WhatsApp según la transportadora y tu ciudad. Pagos por transferencia, Nequi, Daviplata o contraentrega.</p></div></details></div>
   </div></div>
   ${rel.length ? `<div class="related"><div class="rail-head"><div><span class="eyebrow">${esc(p.cat)}</span><h3>También te puede gustar</h3></div></div><div class="track-r">${rel.map(card).join("")}</div></div>` : ""}`;
  $("#pd").classList.add("show"); $("#pd").scrollTop = 0; document.body.style.overflow = "hidden";
}
function pdQ(d) { pdQty = Math.max(1, Math.min(99, pdQty + d)); $("#pdQ").textContent = pdQty; }
function pdAdd(buyNow) { cart[pdCur.id] = (cart[pdCur.id] || 0) + pdQty; save(); toast(`${pdQty} ${pdQty > 1 ? "unidades agregadas" : "unidad agregada"} al carrito`); if (buyNow) { closePD(); startCheckout(); } }
$("#pdView").addEventListener("click", e => {
  const t = e.target.closest("[data-img]"); if (t) { $("#pdMain img").src = t.dataset.img; document.querySelectorAll("#pdView .thumbs button").forEach(b => b.classList.toggle("on", b === t)); }
  const m = e.target.closest("#pdMain"); if (m) m.classList.toggle("zoom");
});
function route() { const m = location.hash.match(/^#producto-(\d+)$/); if (m) renderPD(+m[1]); else if ($("#pd").classList.contains("show")) { $("#pd").classList.remove("show"); document.body.style.overflow = ""; } }
addEventListener("popstate", route); addEventListener("hashchange", route);

/* ---------- Efectos ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
document.querySelectorAll(".rv").forEach(el => io.observe(el));
addEventListener("scroll", () => $("#hdr").classList.toggle("scrolled", scrollY > 10), { passive: true });
setTimeout(() => $("#watip").classList.add("show"), 2500); setTimeout(() => $("#watip").classList.remove("show"), 11000);

renderFilters(); renderGrid(); renderCart(); route();
(async () => {
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(API_STOCK, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return;
    const j = await r.json(); SOLD = new Set(Array.isArray(j.agotados) ? j.agotados : []);
    if (!SOLD.size) return;
    renderGrid(); renderCart();
    document.querySelectorAll(".track-r").forEach(t => t.querySelectorAll(".card").forEach(c => { const p = BYID.get(+c.dataset.id); if (p && isSoldOut(p)) c.outerHTML = card(p, 0); }));
    if ($("#pd").classList.contains("show") && pdCur) renderPD(pdCur.id);
  } catch (e) { /* sin servidor: todo disponible */ }
})();

/* Acciones declarativas (data-act) en vez de onclick: permite una CSP sin 'unsafe-inline' para scripts */
(() => {
  const ACTS = { go, closeModal, closeCheckout, closeAll, openModal, closePD, toggleMenu, submitOrder, startCheckout, slideGo, pdQ, pdAdd, openCart, goSearch };
  const arg = a => { a = a.trim(); if (a === "") return undefined; if (a === "true") return true; if (a === "false") return false; if (/^-?\d+(\.\d+)?$/.test(a)) return +a; const m = a.match(/^'([^']*)'$/); return m ? m[1] : undefined; };
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    for (const st of el.dataset.act.split(";").map(x => x.trim()).filter(Boolean)) {
      if (st === "return false") { e.preventDefault(); continue; }
      const m = st.match(/^(\w+)\((.*)\)$/); const fn = m && ACTS[m[1]];
      if (fn) fn(...(m[2] ? m[2].split(",").map(arg) : []));
    }
  });
})();
