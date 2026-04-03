# ✦ KINARA — Proyecto completo
## Diseño de Luminarias Innovadoras · Sitio web + Tienda en línea

---

## Estructura del proyecto

```
kinara/
│
├── index.html                   ← Sitio público principal
│
├── css/
│   ├── variables.css            ← Paleta, tipografía y tokens de diseño de la marca
│   ├── base.css                 ← Reset CSS, estilos globales, scrollbar, selección
│   ├── components.css           ← Header, botones, tarjetas, badges de stock, footer
│   ├── sections.css             ← Hero, filosofía, colecciones, catálogo
│   └── carrito.css              ← Drawer del carrito, checkout, estados de pago
│
├── js/
│   ├── lib/
│   │   └── supabase.js          ← Cliente Supabase + todas las funciones de BD
│   ├── main.js                  ← Cursor, partículas, header scroll, animaciones
│   ├── productos.js             ← Catálogo con Supabase, filtros, drawer de detalle
│   └── carrito.js               ← Carrito persistente + checkout + Mercado Pago
│
├── pages/
│   ├── admin.html               ← Panel de administración completo
│   └── confirmacion.html        ← Página de retorno post-pago de Mercado Pago
│
├── sql/
│   ├── 01_schema.sql            ← Tablas, índices, triggers, RLS, vista productos_con_stock
│   ├── 02_seed.sql              ← 5 colecciones + 12 productos + inventario inicial
│   ├── 03_webhook_mp.sql        ← Función procesar_pago_confirmado + obtener_resumen_pedido
│   ├── crear-preferencia-mp.ts  ← Edge Function: crea preferencia de pago en MP (SEGURA)
│   └── webhook-mp.ts            ← Edge Function: recibe notificaciones de pago de MP
│
└── assets/
    └── images/                  ← Imágenes de productos y colecciones (agregar aquí)
```

---

## Configuración inicial (orden obligatorio)

### 1 — Supabase: crear el proyecto

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto
   - Nombre: `kinara`
   - Región: `South America (São Paulo)` — la más cercana a México
2. Espera 2-3 minutos a que se inicialice

### 2 — Supabase: crear las tablas

1. Ve a **SQL Editor** → **New query**
2. Pega el contenido de `sql/01_schema.sql` → **Run**
3. Nueva query → pega `sql/02_seed.sql` → **Run**
4. Nueva query → pega `sql/03_webhook_mp.sql` → **Run**

### 3 — Supabase: obtener las credenciales

Ve a **Settings** → **API** y copia:
- **Project URL**: `https://xxxxxxxx.supabase.co`
- **anon public key**: `eyJhbGci...`
- **service_role key**: (la necesitas solo para las Edge Functions)

### 4 — Configurar el sitio

Abre `js/lib/supabase.js` y reemplaza las dos líneas al inicio del archivo:

```javascript
const SUPABASE_URL  = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON = 'eyJhbGci...TU-ANON-KEY';
```

### 5 — Mercado Pago: crear la cuenta de desarrollador

1. Ve a [developers.mercadopago.com](https://developers.mercadopago.com)
2. Crea una aplicación llamada `Kinara`
3. Copia el **Access Token de pruebas** (empieza con `TEST-`)

### 6 — Supabase: crear las Edge Functions

Necesitas crear **dos** Edge Functions en Supabase (Edge Functions → New Function):

**Función 1:** nombre `crear-preferencia-mp`
- Pega el contenido de `sql/crear-preferencia-mp.ts`

**Función 2:** nombre `webhook-mp`
- Pega el contenido de `sql/webhook-mp.ts`

### 7 — Supabase: agregar los Secrets

Ve a **Settings** → **Secrets** y agrega estos 3 valores:

| Nombre | Valor |
|--------|-------|
| `MERCADOPAGO_ACCESS_TOKEN` | Tu Access Token de MP (empieza con `TEST-`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Tu service_role key de Supabase |
| `SITE_URL` | La URL donde publicarás el sitio (ej: `https://kinara.mx`) |

### 8 — Mercado Pago: registrar el webhook

En el panel de desarrollador de MP → **Webhooks** → **Agregar**:
- URL: `https://TU-PROYECTO.supabase.co/functions/v1/webhook-mp`
- Evento: `payment`

---

## Panel de administración

Abre `pages/admin.html` directamente en el navegador.

**Funcionalidades:**
- **Dashboard**: estadísticas de stock, alertas de piezas críticas, mensajes recientes
- **Inventario**: controles +/− para actualizar stock en tiempo real (se refleja en el sitio instantáneamente vía websocket)
- **Productos**: editar nombre, precio, descripción, destacado, nuevo
- **Pedidos**: ver y cambiar estado (pendiente → pagado → en_produccion → enviado → entregado)
- **Mensajes**: leer consultas del formulario, marcarlas como respondidas

> **Seguridad**: protege `pages/admin.html` con contraseña antes de publicar. La opción más simple es usar Netlify con basic auth, o implementar autenticación de Supabase Auth.

---

## Reglas de inventario (badges del catálogo)

| Stock | Badge visible | Color |
|-------|--------------|-------|
| Mayor al mínimo (3) | Disponible | Verde pulsante |
| Entre 1 y 3 | Últimas N piezas | Dorado urgente |
| 0 | Agotado | Rojo sin animación |

El umbral de alerta (`stock_minimo`) es 3 por defecto y se puede cambiar por producto en la tabla `inventario` de Supabase.

---

## Seguridad de precios

Los precios **nunca se pueden manipular desde el navegador**. El flujo es:

1. El carrito guarda los precios en `localStorage` solo para mostrarlos visualmente
2. Al pagar, el frontend manda al servidor **solo los IDs y cantidades** (sin precios)
3. La Edge Function `crear-preferencia-mp` consulta los precios directamente en Supabase
4. Si detecta que alguien intentó enviar un precio diferente, lo registra en los logs
5. Mercado Pago cobra el precio real de la base de datos, no el del navegador

---

## Flujo completo de una compra

```
Cliente agrega producto al carrito
  → Se verifica stock real en Supabase (tiempo real)
  → Si hay stock: se agrega; si no: se muestra mensaje de error

Cliente abre checkout
  → Llena nombre, email, teléfono, dirección

Cliente hace clic en "Ir a pagar"
  → Se crea/actualiza el cliente en Supabase
  → Se crea el pedido en estado "pendiente"
  → La Edge Function consulta precios reales en Supabase
  → Se crea la preferencia de pago en Mercado Pago
  → Se guarda el mp_preference_id en el pedido
  → Redirección al checkout de Mercado Pago

Cliente paga en Mercado Pago
  → MP redirige al cliente a confirmacion.html?status=success
  → La página muestra el resumen del pedido desde Supabase
  → El carrito se limpia en localStorage

En paralelo (webhook)
  → MP llama al webhook con el resultado del pago
  → La Edge Function verifica el pago con la API de MP
  → Si está aprobado: llama a procesar_pago_confirmado()
  → El pedido pasa a "pagado" y el stock se reduce automáticamente
```

---

## Agregar imágenes a los productos

1. Coloca las imágenes en `assets/images/` (JPG o WebP, mínimo 800×800px)
2. Opción A — Subir a Supabase Storage:
   - Storage → Crear bucket `productos` (público)
   - Subir imagen → copiar URL pública
   - En SQL Editor: `UPDATE productos SET imagen_url = 'URL' WHERE nombre = 'Wabi';`
3. Opción B — Ruta local: pon la ruta relativa en `imagen_url` directamente en la BD

---

## Agregar o editar productos

Desde el **panel admin** (`pages/admin.html` → Productos → Editar).

O directamente en Supabase (Table Editor → tabla `productos`). Al agregar un producto nuevo, también agrega su registro de inventario en la tabla `inventario`.

---

## Probar el pago sin dinero real

Mercado Pago tiene tarjetas de prueba para el entorno sandbox:

| Tipo | Número | CVV | Vencimiento |
|------|--------|-----|-------------|
| Mastercard aprobada | 5031 7557 3453 0604 | 123 | 11/25 |
| Visa aprobada | 4009 1753 3280 6176 | 123 | 11/25 |
| Mastercard rechazada | 5031 7557 3453 0613 | 123 | 11/25 |

Para OXXO: selecciona "Efectivo" en el checkout de MP y usa el código generado.

---

## Pasar a producción

1. Cambia `MERCADOPAGO_ACCESS_TOKEN` en Supabase Secrets por el token productivo (`APP_USR-...`)
2. Actualiza `SITE_URL` con tu dominio real
3. En `js/carrito.js` la función `crearPreferencia` ya usa `init_point` en producción automáticamente (el sandbox solo aparece en modo TEST)
4. Actualiza la URL del webhook en el panel de MP con la URL de producción

---

## Base de datos — tablas

| Tabla | Contenido |
|-------|-----------|
| `colecciones` | Las 5 líneas de diseño de Kinara |
| `productos` | Catálogo de 12 luminarias |
| `inventario` | Stock en tiempo real (1:1 con productos) |
| `clientes` | Compradores registrados |
| `pedidos` | Órdenes de compra con estado y datos de MP |
| `pedido_items` | Productos dentro de cada pedido |
| `contactos` | Mensajes del formulario del sitio |

Vista `productos_con_stock`: une las 3 primeras tablas y calcula el `estado_stock` automáticamente.

---

**Kinara — Diseño de Luminarias Innovadoras · México · hola@kinara.mx**

---

## Cambios de seguridad aplicados (v2)

### 1 — Autenticación del panel admin (`pages/admin.html`)

El panel ahora muestra una pantalla de PIN antes de cargar cualquier contenido.

**Configuración obligatoria antes de publicar:**
1. Abre `pages/admin.html`
2. Busca la línea: `const ADMIN_PIN = '1234';`
3. Cámbiala por un PIN de 4–6 dígitos que solo tú conozcas
4. La sesión dura 8 horas y se bloquea 15 minutos tras 5 intentos fallidos

> Para mayor seguridad en producción, reemplaza el PIN por autenticación
> real con Supabase Auth (email + contraseña).

---

### 2 — Verificación de firma HMAC en el webhook (`sql/webhook-mp.ts`)

El webhook ya no acepta cualquier POST. Verifica la firma HMAC-SHA256
que Mercado Pago incluye en el header `x-signature`.

**Configuración:**
1. En el panel de MP → Developers → Webhooks → tu webhook → copia el campo **Secret**
2. En Supabase → Settings → Secrets → agrega:
   - Nombre: `MERCADOPAGO_WEBHOOK_SECRET`
   - Valor: el Secret copiado de MP
3. Redespliega la Edge Function `webhook-mp`

> Si `MERCADOPAGO_WEBHOOK_SECRET` no está configurado, el webhook
> logea una advertencia pero no bloquea (para sandbox). En producción
> DEBE estar configurado.

---

### 3 — Sanitización XSS (`js/lib/supabase.js`, `js/productos.js`, `js/carrito.js`)

Se agregó la función `escHTML()` en `supabase.js` que escapa caracteres
HTML especiales. Todos los campos de texto de la base de datos que se
insertan en `innerHTML` ahora pasan por esta función.

---

### 4 — Bug fix: `carrito.js` duplicado (`index.html`)

Se eliminó la segunda etiqueta `<script src="js/carrito.js">` que
causaba que el módulo del carrito se inicializara dos veces.

---

### 5 — SEO y metadatos (`index.html`)

Se agregaron:
- `og:image` y `twitter:image` → crea el archivo `assets/images/og-cover.jpg`
  (1200×630 px) con una foto del producto más icónico de Kinara
- `twitter:card` para previsualizaciones en X/Twitter
- `<link rel="canonical">` apuntando a tu dominio real
- `<link rel="apple-touch-icon">` → crea `assets/images/apple-touch-icon.png`
  (180×180 px) con el logo de Kinara sobre fondo oscuro

---

### 6 — `robots.txt`

Se creó `robots.txt` en la raíz del proyecto. Bloquea el indexado de
`/pages/admin.html` y declara la ubicación del sitemap.

**Recuerda actualizar** la línea `Sitemap:` con tu dominio real.

---

## Lista de pendientes antes de publicar

- [ ] Cambiar `ADMIN_PIN` en `pages/admin.html` (actualmente `1234`)
- [ ] Configurar `MERCADOPAGO_WEBHOOK_SECRET` en Supabase Secrets
- [ ] Crear `assets/images/og-cover.jpg` (1200×630 px)
- [ ] Crear `assets/images/apple-touch-icon.png` (180×180 px)
- [ ] Actualizar URL del `Sitemap:` en `robots.txt`
- [ ] Actualizar `og:url` y `canonical` con el dominio real en `index.html`
- [ ] Configurar `SUPABASE_URL` y `SUPABASE_ANON` en `js/lib/supabase.js`
- [ ] Configurar `MERCADOPAGO_ACCESS_TOKEN` en Supabase Secrets
- [ ] Subir imágenes de productos a `assets/images/` o Supabase Storage
- [ ] Probar flujo completo de pago en sandbox de MP
- [ ] Cambiar Access Token de MP a modo producción

