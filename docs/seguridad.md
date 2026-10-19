# Seguridad – A&M Laminado 18k

## Qué está protegido

**Tienda (sitio estático)**
- Todo el código JavaScript está en archivos propios (`app.js`, `productos.js`, `config.js`), sin scripts ni `onclick` dentro del HTML. Por eso se puede usar una política de seguridad (CSP) estricta que bloquea scripts inyectados.
- Los datos de productos y del cliente se escapan antes de mostrarse. El carrito guardado en el navegador se revisa al cargar (solo productos que existen, con cantidades de 1 a 99).
- Campo trampa invisible (honeypot) contra bots de spam en el formulario.
- En `public/` no hay claves, contraseñas ni código del servidor.

**Servidor (cuando se publique con el Blueprint)**
- Cabeceras de seguridad con helmet: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. No envía `X-Powered-By`.
- Login del panel: contraseña comparada en tiempo constante. Tras 5 intentos fallidos desde la misma IP se bloquea 1 minuto, luego 2, 4, 8… (máximo 1 hora), aunque después se escriba la clave correcta.
- Cookie de sesión firmada, `HttpOnly`, `Secure` (en producción), `SameSite=Strict`, válida 12 horas y solo para `/admin`.
- Protección CSRF en todos los formularios del panel (token por sesión y comprobación del origen).
- Límites: 10 pedidos cada 15 minutos por IP, 120 peticiones por minuto a la API, peticiones de máximo 20 KB.
- Validación estricta de pedidos: tipos, longitudes máximas, formato de correo y teléfono, máximo 50 productos. Los precios siempre se recalculan en el servidor.
- Todo dato del cliente se escapa en el panel y en los correos (evita XSS). El CSV exportado neutraliza fórmulas de Excel.
- Consultas SQL con parámetros (sin concatenar datos del usuario).
- CORS: solo las direcciones de `ALLOWED_ORIGINS` (y el propio servidor) pueden enviar pedidos.
- Los errores no muestran detalles técnicos al visitante.
- Dependabot revisa las dependencias cada semana; `npm audit`: 0 vulnerabilidades.

## Cabeceras para el sitio estático (paso a paso en Render)

Render no lee archivos de cabeceras (como `_headers`) en los sitios estáticos: se configuran en el panel.

1. Entra a https://dashboard.render.com y abre el sitio estático **am-laminado18k**.
2. En el menú izquierdo pulsa **Headers** (o **Settings → Headers**).
3. Pulsa **Add Header** por cada fila. En **Path** escribe siempre `/*`.
4. Pulsa **Save Changes**. Se aplica en 1–2 minutos, sin volver a publicar.

| Path | Name | Value |
|---|---|---|
| `/*` | `Content-Security-Policy` | `default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests` |
| `/*` | `X-Frame-Options` | `DENY` |
| `/*` | `X-Content-Type-Options` | `nosniff` |
| `/*` | `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `/*` | `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `/*` | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

**Importante cuando conectes el servidor:** después de poner la dirección del servidor en `public/config.js`, cambia en la CSP `connect-src 'self'` por
`connect-src 'self' https://am-laminado-api.onrender.com` (con la dirección exacta de tu servidor). Si no, la tienda no podrá enviar pedidos al servidor (seguirán llegando por WhatsApp).

Para comprobar: abre https://securityheaders.com y escribe `https://am-laminado18k.onrender.com`.

## Recomendaciones
- Usa una contraseña del panel larga (mínimo 16 caracteres). La que genera Render sirve.
- No compartas las llaves de Resend; si se filtran, bórralas en Resend y crea otras.
- Revisa y acepta las actualizaciones que proponga Dependabot en GitHub (pestaña Pull requests).
