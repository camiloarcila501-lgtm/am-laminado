# A&M Laminado 18k – Tienda en línea y automatizaciones

La tienda (`public/`) funciona sola como sitio estático: catálogo, carrito y pedido por WhatsApp.
El **servidor** (`server.js`) agrega las automatizaciones:

| Automatización | Qué hace | Necesita |
|---|---|---|
| Pedidos guardados | Cada pedido del formulario se guarda en la base de datos y además se abre WhatsApp | `DATABASE_URL` |
| Panel de administración | `/admin`: lista de pedidos, filtros por estado, detalle, cambio de estado (nuevo, confirmado, enviado, entregado, cancelado), costo de envío, guía, notas, exportar a Excel (CSV) | `ADMIN_PASSWORD` |
| Inventario | `/admin/inventario`: marcar productos como **agotado** o **disponible**. La tienda muestra "Agotado" y no deja agregarlos al carrito | `DATABASE_URL` + `ADMIN_PASSWORD` |
| Correos | Confirmación al cliente, aviso de pedido nuevo a la dueña y (opcional) correo al cliente cuando cambia el estado | `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL` |
| Respuestas de WhatsApp | Textos listos para WhatsApp Business | ver `docs/whatsapp-respuestas.md` |

**Si falta cualquier variable, nada se cae**: los correos se omiten (queda un aviso en el registro), y si la tienda no puede hablar con el servidor, el pedido sigue por WhatsApp y todos los productos se muestran disponibles.

Medios de pago en el formulario: Transferencia, Nequi, Daviplata, Contraentrega. Wompi está desactivado (solo se activa con `WOMPI_ENABLED=true` y sus llaves).

---

## Paso a paso para publicar el servidor en Render (sin programar)

La forma recomendada **mantiene la dirección actual de la tienda** `https://am-laminado18k.onrender.com`: la tienda sigue siendo el sitio estático que ya tienes, y se crea aparte un servidor para pedidos, panel e inventario.

### 1. Crear el servidor y la base de datos (Blueprint)
1. Entra a https://dashboard.render.com con tu cuenta.
2. Arriba a la derecha: **New → Blueprint**.
3. Elige el repositorio **am-laminado** y la rama **main** (cuando estos cambios ya estén en main).
4. Render muestra lo que va a crear: un servicio web **am-laminado-api** y una base de datos **am-laminado-db**. Pulsa **Apply**.
5. Te pedirá llenar algunas variables. Puedes dejarlas vacías por ahora y llenarlas después:
   - `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL` (correos, ver paso 4)
   - `PUBLIC_URL`: la dirección del servidor, por ejemplo `https://am-laminado-api.onrender.com`
6. Espera a que diga **Live** (unos minutos).

### 2. Ver la contraseña del panel
1. En Render abre el servicio **am-laminado-api → Environment**.
2. Busca `ADMIN_PASSWORD` (Render la generó sola) y pulsa el ojo para verla. Puedes cambiarla por una tuya.
3. Entra a `https://am-laminado-api.onrender.com/admin` (usa la dirección exacta que muestra Render arriba en el servicio).

### 3. Conectar la tienda con el servidor
1. En GitHub abre el archivo `public/config.js`.
2. Cambia `window.AM_API_BASE = "";` por la dirección de tu servidor, por ejemplo:
   `window.AM_API_BASE = "https://am-laminado-api.onrender.com";`
3. Guarda (Commit). El sitio estático se actualiza solo en 1–2 minutos.
4. La variable `ALLOWED_ORIGINS` del servidor debe tener la dirección **de la tienda** (`https://am-laminado18k.onrender.com`); ya viene puesta.

### 4. Activar los correos (Resend)
1. Crea una cuenta gratis en https://resend.com.
2. **API Keys → Create API Key** → cópiala en `RESEND_API_KEY` (Render → am-laminado-api → Environment).
3. Para enviar correos a tus clientes necesitas **un dominio propio verificado** en Resend (Domains → Add Domain, y copiar los registros DNS donde compraste el dominio). Sin dominio, Resend solo deja enviar al correo de tu propia cuenta.
4. `EMAIL_FROM`: por ejemplo `A&M Laminado 18k <pedidos@tudominio.com>` (con el dominio verificado).
5. `OWNER_EMAIL`: el correo donde quieres recibir los avisos de pedidos nuevos.
6. Guarda los cambios: Render reinicia el servidor solo.

### 5. Probar
1. Haz un pedido de prueba en la tienda.
2. Revisa que aparezca en `/admin`, cambia su estado a *confirmado*.
3. En `/admin/inventario` marca un producto como agotado y revisa la tienda.

### Notas importantes del plan gratis de Render
- El servidor gratis "se duerme" tras 15 minutos sin uso; la tienda lo despierta al abrirse, pero si alguien compra justo en ese momento el pedido igual llega por WhatsApp (quizás sin guardarse en el panel).
- La base de datos gratis de Render **vence a los 30 días**. Antes de eso pasa a un plan pago (aprox. 7 USD/mes) o usa una base de datos gratis de Supabase poniendo su dirección en `DATABASE_URL`.

### Alternativa: un solo servicio
También se puede reemplazar el sitio estático por el servidor (que también muestra la tienda). En ese caso la dirección **cambia** a la del servidor (por ejemplo `am-laminado-api.onrender.com`), salvo que uses un dominio propio.

---

## Variables de entorno
Ver `.env.example`. Todas son opcionales.

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Base de datos (Render la pone sola) |
| `ADMIN_PASSWORD` | Clave del panel (Render la genera) |
| `SESSION_SECRET` | Seguridad de la sesión (Render la genera) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL` | Correos |
| `STATUS_EMAILS` | `true`/`false`: correo al cliente al cambiar el estado |
| `ALLOWED_ORIGINS` | Dirección de la tienda que puede enviar pedidos al servidor |
| `PUBLIC_URL` | Dirección pública del servidor |
| `WHATSAPP_NUMBER` | `573008918966` |
| `SHIPPING_MODE` | `convenir` (el envío se confirma por WhatsApp) |

## Para desarrolladores
```bash
npm install
cp .env.example .env
npm start                      # http://localhost:3000
TEST_DATABASE_URL=postgresql://usuario:clave@localhost/am_test npm test
```
Catálogo: `public/productos.js`. Inventario: tabla `stock` (clave = REF + categoría, porque una misma REF se repite entre categorías).
