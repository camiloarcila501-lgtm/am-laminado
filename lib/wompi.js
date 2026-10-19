// Wompi (Colombia). Opcional: activo solo si WOMPI_PUBLIC_KEY y WOMPI_INTEGRITY_SECRET existen.
const crypto = require('crypto');
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const enabled = () => !!(process.env.WOMPI_PUBLIC_KEY && process.env.WOMPI_INTEGRITY_SECRET);

// Firma de integridad: SHA256(reference + amountInCents + currency + integritySecret)
function integritySignature(reference, amountInCents, currency = 'COP', secret = process.env.WOMPI_INTEGRITY_SECRET) {
  return sha256(`${reference}${amountInCents}${currency}${secret}`);
}
// URL del Web Checkout (misma URL para sandbox y producción; el ambiente lo define la llave pub_test_/pub_prod_)
function checkoutUrl({ reference, amountInCents, redirectUrl, email, name, phone }) {
  const p = new URLSearchParams({
    'public-key': process.env.WOMPI_PUBLIC_KEY, currency: 'COP', 'amount-in-cents': String(amountInCents),
    reference, 'signature:integrity': integritySignature(reference, amountInCents), 'redirect-url': redirectUrl
  });
  if (email) p.set('customer-data:email', email);
  if (name) p.set('customer-data:full-name', name);
  if (phone) { p.set('customer-data:phone-number', String(phone).replace(/\D/g, '').slice(-10)); p.set('customer-data:phone-number-prefix', '+57'); }
  return 'https://checkout.wompi.co/p/?' + p.toString();
}
// Verificación de eventos: SHA256( valores de signature.properties (en orden) + timestamp + eventsSecret ) == signature.checksum
function verifyEvent(evt, secret = process.env.WOMPI_EVENTS_SECRET) {
  if (!secret || !evt || !evt.signature) return false;
  const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const concat = (evt.signature.properties || []).map(p => get(evt.data, p)).join('') + evt.timestamp + secret;
  const a = Buffer.from(sha256(concat)), b = Buffer.from(String(evt.signature.checksum || '').toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const apiBase = () => (process.env.WOMPI_ENV === 'production' ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1');
module.exports = { enabled, integritySignature, checkoutUrl, verifyEvent, apiBase, sha256 };
