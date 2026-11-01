# ✦ KINARA — Proyecto completo
## Empresa de impresión 3D · Sitio web + Tienda en línea

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
│   ├── sections.css             ← Hero, categorías, proceso, materiales, catálogo, contacto
│   └── carrito.css              ← Drawer del carrito, checkout, estados de pago
│
├── js/
│   ├── lib/
│   │   └── supabase.js          ← Cliente Supabase + todas las funciones de BD
│   ├── main.js                  ← Header, menú móvil, sección activa, animaciones
│   ├── hero3d.js                ← Impresora 3D del hero (Three.js por CDN), ligada al scroll
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
│   ├── 04_seguridad_checkout.sql ← Checkout en servidor, pagos idempotentes, admins y permisos
│   ├── 05_catalogo_impresion_3d.sql ← Categorías y catálogo de impresión 3D (precios provisionales)
│   ├── crear-preferencia-mp.ts  ← Edge Function: crea pedido y preferencia de pago en MP
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
5. Nueva query → pega `sql/04_seguridad_checkout.sql` → **Run**
6. Nueva query → pega `sql/05_catalogo_impresion_3d.sql` → **Run**

> Si la base ya existía, basta con ejecutar `04_seguridad_checkout.sql` y `05_catalogo_impresion_3d.sql`. Se pueden repetir sin problema.

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
- Desactiva **Verify JWT** en esta función (solo en esta). Mercado Pago no manda JWT: la autenticación es la firma HMAC.

### 7 — Supabase: agregar los Secrets

Ve a **Settings** → **Secrets** y agrega estos valores (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los provee Supabase):

| Nombre | Valor |
|--------|-------|
| `MERCADOPAGO_ACCESS_TOKEN` | Tu Access Token de MP (empieza con `TEST-`) |
| `MERCADOPAGO_WEBHOOK_SECRET` | El Secret del webhook en el panel de MP (obligatorio: sin él se rechazan los avisos) |
| `SITE_URL` | La URL donde publicarás el sitio (ej: `https://kinaramx.com`) |

### 8 — Mercado Pago: registrar el webhook

En el panel de desarrollador de MP → **Webhooks** → **Agregar**:
- URL: `https://TU-PROYECTO.supabase.co/functions/v1/webhook-mp`
- Evento: `payment`

### 9 — Crear la cuenta de administrador

1. En Supabase → **Authentication** → **Users** → **Add user**: crea tu usuario con correo y una contraseña fuerte.
2. En **Authentication** → **Sign In / Providers**, desactiva **Allow new users to sign up**.
3. En **SQL Editor**, autoriza esa cuenta:

```sql
INSERT INTO admins (user_id)
SELECT id FROM auth.users WHERE email = 'tu-correo@ejemplo.com';
```

---

## Panel de administración

Abre `pages/admin.html` desde el sitio publicado o un servidor local e inicia sesión con tu cuenta de administrador.

**Funcionalidades:**
- **Dashboard**: estadísticas de stock, alertas de piezas críticas, mensajes recientes
- **Inventario**: controles +/− para actualizar stock en tiempo real (se refleja en el sitio instantáneamente vía websocket)
- **Productos**: editar nombre, precio, descripción, destacado, nuevo
- **Pedidos**: ver y cambiar estado (pendiente → pagado → en_produccion → enviado → entregado)
- **Mensajes**: leer consultas del formulario, marcarlas como respondidas

> **Seguridad**: los datos los protege RLS; solo las cuentas de la tabla `admins` pueden leerlos o cambiarlos. Ocultar la página no es necesario.

---

## Reglas de inventario (badges del catálogo)

| Stock | Badge visible | Color |
|-------|--------------|-------|
| Mayor al mínimo (3) | Disponible | Verde pulsante |
| Entre 1 y 3 | Últimas N piezas | Ámbar |
| 0 | Agotado | Rojo sin animación |

El umbral de alerta (`stock_minimo`) es 3 por defecto y se puede cambiar por producto en la tabla `inventario` de Supabase.

---

## Seguridad de precios

Los precios **nunca se pueden manipular desde el navegador**. El flujo es:

1. El carrito guarda los precios en `localStorage` solo para mostrarlos visualmente
2. Al pagar, el frontend manda al servidor **solo IDs, cantidades y datos de envío**
3. La Edge Function `crear-preferencia-mp` crea el pedido con precios y stock de la base de datos
4. El pedido, el monto y las URLs de retorno se deciden en el servidor
5. El webhook comprueba con la API de MP que el monto pagado cubra el total antes de marcar el pedido como pagado

---

## Flujo completo de una compra

```
Cliente agrega producto al carrito
  → Se verifica stock real en Supabase (tiempo real)
  → Si hay stock: se agrega; si no: se muestra mensaje de error

Cliente abre checkout
  → Llena nombre, email, teléfono, dirección

Cliente hace clic en "Ir a pagar"
  → La Edge Function valida datos, precios y stock
  → Crea cliente, pedido "pendiente" e items en una transacción
  → Crea la preferencia en Mercado Pago y guarda su ID
  → Redirección al checkout de Mercado Pago

Cliente paga en Mercado Pago
  → MP redirige al cliente a confirmacion.html
  → La página consulta el estado real del pedido
  → Muestra "pendiente" hasta que llegue el webhook

En paralelo (webhook)
  → Verifica la firma y consulta el pago en la API de MP
  → approved: valida el monto, pasa a "pagado" y reduce el stock
  → Avisos repetidos: se ignoran sin descontar dos veces
  → rejected: no cambia nada (el cliente puede reintentar)
  → cancelled: cancela el pedido pendiente
  → refunded / charged_back: cancela y repone stock, o deja aviso si ya está en producción
  → Casos raros (monto menor, sobreventa, doble cobro): nota "REVISAR" visible en el panel de pedidos
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

Las tarjetas de prueba vigentes están en la documentación de Mercado Pago (Checkout Pro → Tarjetas de prueba).

Para OXXO: selecciona "Efectivo" en el checkout de MP y usa el código generado.

---

## Pasar a producción

1. Cambia `MERCADOPAGO_ACCESS_TOKEN` en Supabase Secrets por el token productivo (`APP_USR-...`)
2. Actualiza `SITE_URL` con tu dominio real
3. `crear-preferencia-mp` usa `init_point` automáticamente si el token no empieza con `TEST-`
4. Actualiza la URL del webhook en el panel de MP con la URL de producción

---

## Base de datos — tablas

| Tabla | Contenido |
|-------|-----------|
| `colecciones` | Categorías del catálogo (las inactivas no se muestran ni se venden) |
| `productos` | Catálogo de productos impresos en 3D |
| `inventario` | Stock en tiempo real (1:1 con productos) |
| `clientes` | Compradores registrados |
| `pedidos` | Órdenes de compra con estado y datos de MP |
| `pedido_items` | Productos dentro de cada pedido |
| `contactos` | Mensajes del formulario del sitio |

Vista `productos_con_stock`: une las 3 primeras tablas y calcula el `estado_stock` automáticamente.

---

**Kinara — Impresión 3D · México · hola@kinaramx.com**

---

## Cambios de seguridad aplicados (v2)

### 1 — Autenticación del panel admin (`pages/admin.html`)

El panel usa Supabase Auth y la tabla `admins` (ver paso 9). El antiguo PIN se eliminó.

---

### 2 — Verificación de firma HMAC en el webhook (`sql/webhook-mp.ts`)

El webhook verifica la firma HMAC-SHA256 del header `x-signature`.
Si `MERCADOPAGO_WEBHOOK_SECRET` no está configurado, rechaza todos los avisos.

---

### 3 — Sanitización XSS (`js/lib/supabase.js`, `js/productos.js`, `js/carrito.js`)

Se agregó la función `escHTML()` en `supabase.js` que escapa caracteres
HTML especiales. Los campos de texto que se insertan en `innerHTML`,
incluido el panel admin, pasan por esta función.

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

- [ ] Ejecutar `sql/04_seguridad_checkout.sql` y `sql/05_catalogo_impresion_3d.sql`, y redesplegar las dos Edge Functions
- [ ] Confirmar precios, medidas, materiales, stock y fotos de los productos de `05_catalogo_impresion_3d.sql`
- [ ] Desactivar Verify JWT en `webhook-mp`
- [ ] Crear la cuenta admin y desactivar el registro público (paso 9)
- [ ] Configurar `SITE_URL` en Supabase Secrets
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

