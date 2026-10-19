// Carga public/productos.js (window.CATALOGO) para recalcular precios en el servidor.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'productos.js'), 'utf8'), ctx);
const list = ctx.window.CATALOGO || [];
const byId = new Map(list.map(p => [Number(p.id), p]));
const keyOf = p => `${p.ref}|${p.cat}`;
const byKey = new Map(list.map(p => [keyOf(p), p]));
module.exports = { list, get: id => byId.get(Number(id)), keyOf, byKey: k => byKey.get(k) };
