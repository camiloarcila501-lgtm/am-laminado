# A&M laminado 18k – Tienda en línea

Tienda de joyería en oro laminado 18k: catálogo (`public/`), carrito, pedidos guardados en Postgres, panel privado `/admin`, correos con Resend y pagos con Wompi. Todas las integraciones son **opcionales**: sin ninguna variable configurada la página funciona y los pedidos se envían por WhatsApp.

## Qué hace

| Función | Requiere | Si falta |
|---|---|---|
| Catálogo, carrito, pedido por WhatsApp | nada | — |
| Guardar pedidos | `DATABASE_URL` | se guardan en memoria (se pierden al reiniciar) |
| Panel `/admin` (pedidos, filtros, estados, costo de envío, CSV) | `ADMIN_PASSWORD` | el panel queda deshabilitado |
| Correos al cliente y al dueño | `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL` | no se envían correos |
| Pago en línea (tarjeta, PSE, Nequi…) | `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | el botón "Pagar en línea" no aparece |

### Envíos
Por defecto `SHIPPING_MODE=convenir`: el carrito muestra *"Envío: se confirma por WhatsApp según transportadora y ciudad"*, el total del pedido **no incluye el envío** y el dueño registra el costo de envío de cada pedido en `/admin` (el total se actualiza). Con Wompi, el cliente paga en línea solo los productos; el envío se cobra aparte (contraentrega o transferencia).

Opcional (deshabilitado por defecto):
- `SHIPPING_MODE=tabla`: tarifas por ciudad/departamento desde `SHIPPING_RATES` (JSON) o `shipping.json` (copiar `shipping.example.json`; **las tarifas las define el dueño**). `FREE_SHIPPING_MIN` = envío gratis desde ese valor.
- `SHIPPING_MODE=carrier`: adaptador para API de transportadora (`lib/shipping.js`, `carrierAdapter`), para cuando exista contrato con Coordinadora, Servientrega, etc. (`CARRIER_API_KEY`).

### Seguridad
- El servidor **recalcula los precios** desde `public/productos.js`; ignora precios enviados por el navegador. Productos sin precio ("Consultar precio") no se pueden pagar en línea.
- Pagos: firma de integridad `SHA256(referencia + montoEnCentavos + COP + secretoIntegridad)`; el webhook verifica `SHA256(valores de signature.properties + timestamp + secretoEventos)` y que el monto coincida antes de marcar *pagado*.
- Nunca subas el archivo `.env` (está en `.gitignore`).

## Variables de entorno
Ver `.env.example`.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión Postgres (Render la pone automáticamente; en Supabase: Project Settings → Database → Connection string) |
| `ADMIN_PASSWORD` | Clave del panel `/admin` |
| `SESSION_SECRET` | Firma de la cookie de sesión (Render la genera) |
| `PUBLIC_URL` | URL pública, ej. `https://am-laminado.onrender.com` (para el regreso desde Wompi) |
| `WHATSAPP_NUMBER` | `573008918966` |
| `RESEND_API_KEY` / `EMAIL_FROM` / `OWNER_EMAIL` | Correos (Resend) |
| `WOMPI_ENV` | `sandbox` o `production` |
| `WOMPI_PUBLIC_KEY` / `WOMPI_INTEGRITY_SECRET` / `WOMPI_EVENTS_SECRET` | Llaves de Wompi (Dashboard → Desarrolladores) |
| `SHIPPING_MODE` | `convenir` (defecto), `tabla` o `carrier` |
| `SHIPPING_RATES`, `FREE_SHIPPING_MIN`, `CARRIER_API_KEY` | Opcionales de envíos |

## Publicar en Render (Blueprint)
1. Entra a https://dashboard.render.com con tu cuenta (puedes entrar con GitHub).
2. **New → Blueprint** y elige el repositorio `am-laminado`. Render lee `render.yaml` y crea el servicio web y la base de datos Postgres gratis.
3. Llena las variables que pide (`ADMIN_PASSWORD`, `PUBLIC_URL`, y si ya las tienes las de Wompi y Resend; puedes dejarlas vacías) y pulsa **Apply**.
4. Al terminar abre `https://<tu-servicio>.onrender.com`. Pon esa URL en `PUBLIC_URL` (Environment) si no la pusiste.
5. Wompi: en el dashboard de Wompi → Desarrolladores → **URL de eventos**: `https://<tu-servicio>.onrender.com/api/wompi/webhook`.
6. Panel: `https://<tu-servicio>.onrender.com/admin`.

Notas del plan gratis de Render: el servicio "se duerme" tras 15 min sin visitas (la primera visita tarda ~1 min) y la base de datos gratis vence a los 30 días (pasar a plan pago o usar Supabase en `DATABASE_URL`).

## Desarrollo local
```bash
npm install
cp .env.example .env   # y edita
npm start              # http://localhost:3000
TEST_DATABASE_URL=postgresql://usuario:clave@localhost/am_test npm test
```

## Actualizar el catálogo
Edita `public/productos.js` (id, ref, name, cat, price en COP o `null` para "Consultar precio", img) y las fotos en `public/fotos/`.
