// Seguridad: cabeceras (helmet + CSP), límites de peticiones, bloqueo de fuerza bruta en el login y manejo de errores.
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const crypto = require('crypto');
const PROD = process.env.NODE_ENV === 'production';

const headers = () => helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'", 'https://checkout.wompi.co'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      ...(PROD ? { upgradeInsecureRequests: [] } : {})
    }
  },
  crossOriginEmbedderPolicy: false,
  xFrameOptions: { action: 'deny' },
  strictTransportSecurity: PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});
const permissions = (req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'); next(); };

const msg = m => (req, res) => req.path.startsWith('/api') || req.accepts(['json', 'html']) === 'json'
  ? res.status(429).json({ ok: false, errors: [m] }) : res.status(429).send(m);
// Pedidos: máx. 10 cada 15 min por IP
const ordersLimiter = rateLimit({ windowMs: 15 * 60e3, limit: Number(process.env.ORDERS_RATE_LIMIT || 10), standardHeaders: 'draft-7', legacyHeaders: false, handler: msg('Demasiados pedidos seguidos. Intenta en unos minutos o escríbenos por WhatsApp.') });
// API general: 120 por minuto por IP
const apiLimiter = rateLimit({ windowMs: 60e3, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false, handler: msg('Demasiadas peticiones.') });
// Visitas (contador propio): 60 por minuto por IP
const visitsLimiter = rateLimit({ windowMs: 60e3, limit: Number(process.env.VISITS_RATE_LIMIT || 60), standardHeaders: 'draft-7', legacyHeaders: false, handler: (req, res) => res.status(204).end() });
// Panel admin (ya con sesión): 300 por 5 min
const adminLimiter = rateLimit({ windowMs: 5 * 60e3, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, handler: msg('Demasiadas peticiones.') });

// Login: bloqueo progresivo por IP. 5 fallos → 1 min; cada fallo extra duplica (máx. 1 h). Ventana de olvido: 1 h.
const fails = new Map();
const MAX_FREE = 5;
function loginStatus(ip) {
  const f = fails.get(ip); if (!f) return { locked: false };
  if (Date.now() - f.last > 3600e3) { fails.delete(ip); return { locked: false }; }
  return f.until > Date.now() ? { locked: true, retry: Math.ceil((f.until - Date.now()) / 1000) } : { locked: false };
}
function loginFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0, last: 0 }; f.n++; f.last = Date.now();
  if (f.n >= MAX_FREE) f.until = Date.now() + Math.min(3600e3, 60e3 * 2 ** (f.n - MAX_FREE));
  fails.set(ip, f); if (fails.size > 10000) fails.delete(fails.keys().next().value);
  console.warn(`[seguridad] login fallido desde ${ip} (intento ${f.n})`);
}
const loginOk = ip => fails.delete(ip);
const _resetLogin = () => fails.clear();

// Comparación de contraseña en tiempo constante (sin filtrar la longitud)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest(), hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

// Errores: sin trazas al cliente
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err.stack || err);
  if (res.headersSent) return next(err);
  const text = status === 413 ? 'Petición demasiado grande' : status < 500 ? 'Petición inválida' : 'Error interno';
  if (req.path.startsWith('/api')) return res.status(status).json({ ok: false, errors: [text] });
  res.status(status).type('text').send(text);
}

module.exports = { headers, permissions, ordersLimiter, visitsLimiter, apiLimiter, adminLimiter, loginStatus, loginFail, loginOk, safeEqual, errorHandler, _resetLogin, PROD };
