/* Contador de visitas propio: una vista por carga y un evento al abrir un producto. Sin cookies; falla en silencio. */
(() => {
  const url = (window.AM_API_BASE || "") + "/api/visita";
  let r = "", u = "";
  try {
    const q = new URLSearchParams(location.search); u = (q.get("utm_source") || "").slice(0, 40);
    let ext = ""; try { if (document.referrer && new URL(document.referrer).host !== location.host) ext = document.referrer; } catch {}
    // Guardar de dónde llegó al entrar, para no contar como "Directo" la navegación interna
    if (ext || u) sessionStorage.setItem("am_src", JSON.stringify({ r: ext.slice(0, 200), u }));
    else { const s = JSON.parse(sessionStorage.getItem("am_src") || "null"); if (s) { r = s.r || ""; u = s.u || ""; } }
    if (ext) r = ext.slice(0, 200);
  } catch {}
  const send = d => { try { fetch(url, { method: "POST", keepalive: true, mode: "cors", credentials: "omit", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ ...d, p: location.pathname, r, u }) }).catch(() => {}); } catch {} };
  const start = () => {
    send({ t: "pagina" });
    let last = null;
    const check = () => { const m = location.hash.match(/^#producto-(\d+)$/), pd = document.getElementById("pd");
      if (m && pd && pd.classList.contains("show")) { if (last !== m[1]) { last = m[1]; send({ t: "producto", id: +m[1] }); } } else last = null; };
    const pd = document.getElementById("pd");
    if (pd) new MutationObserver(check).observe(pd, { attributes: true, attributeFilter: ["class"] });
    addEventListener("hashchange", check); addEventListener("popstate", check); document.addEventListener("click", () => setTimeout(check, 60)); check();
  };
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 3000 }); else setTimeout(start, 500);
})();
