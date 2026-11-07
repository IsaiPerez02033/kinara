-- ============================================================
-- 01_schema.sql — Esquema completo de la base de datos Kinara
-- Ejecuto este script en el SQL Editor de Supabase para crear
-- todas las tablas, relaciones, políticas de seguridad (RLS)
-- e índices del proyecto.
--
-- INSTRUCCIONES:
-- 1. Abre tu proyecto en supabase.com
-- 2. Ve a "SQL Editor" en el menú lateral
-- 3. Pega este archivo completo y ejecuta con "Run"
-- ============================================================

-- -------------------------------------------------------
-- EXTENSIONES necesarias para el proyecto
-- -------------------------------------------------------

-- Activo la extensión uuid para generar IDs únicos automáticamente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------
-- TABLA: colecciones
-- Almacena las 5 colecciones de la marca Kinara.
-- Cada producto pertenece a una colección.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS colecciones (
  -- ID único generado automáticamente
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Nombre de la colección (ej: "Kinara Zen")
  nombre      TEXT NOT NULL,

  -- Filosofía o subtítulo de la colección (ej: "Minimalismo japonés")
  filosofia   TEXT NOT NULL,

  -- Descripción larga de la colección
  descripcion TEXT,

  -- URL de la imagen representativa de la colección
  imagen_url  TEXT,

  -- Si la colección está visible en el sitio
  activa      BOOLEAN DEFAULT TRUE,

  -- Marca de tiempo de creación (automática)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Comentario descriptivo de la tabla
COMMENT ON TABLE colecciones IS 'Las 5 colecciones de la marca Kinara: Zen, Min, Nova, Aura, Raíz';

-- -------------------------------------------------------
-- TABLA: productos
-- Almacena cada luminaria individual del catálogo.
-- Se relaciona con colecciones e inventario.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  -- ID único del producto
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Referencia a la colección a la que pertenece
  coleccion_id  UUID NOT NULL REFERENCES colecciones(id) ON DELETE RESTRICT,

  -- Nombre de la luminaria (ej: "Wabi")
  nombre        TEXT NOT NULL,

  -- Descripción completa del producto
  descripcion   TEXT,

  -- Precio en pesos mexicanos (MXN)
  -- Uso NUMERIC para evitar errores de punto flotante en dinero
  precio        NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),

  -- URL de la imagen principal del producto
  imagen_url    TEXT,

  -- Array de materiales (ej: {"PLA Matte","Bambú"})
  materiales    TEXT[] DEFAULT '{}',

  -- Dimensiones en formato texto (ej: "35cm × 35cm × 120cm")
  dimensiones   TEXT,

  -- Acabado superficial (ej: "Blanco hueso mate")
  acabado       TEXT,

  -- Si el producto aparece destacado al inicio del catálogo
  destacado     BOOLEAN DEFAULT FALSE,

  -- Si el producto es un lanzamiento reciente
  nuevo         BOOLEAN DEFAULT FALSE,

  -- Tags para búsqueda y filtrado futuro
  tags          TEXT[] DEFAULT '{}',

  -- Marca de tiempo de creación
  created_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Marca de tiempo de última actualización
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE productos IS 'Catálogo de luminarias de Kinara. Cada fila es una pieza única.';
COMMENT ON COLUMN productos.precio IS 'Precio en MXN. Uso NUMERIC para precisión monetaria.';
COMMENT ON COLUMN productos.materiales IS 'Array de strings con los materiales de fabricación.';

-- -------------------------------------------------------
-- TABLA: inventario
-- Controla el stock de cada producto en tiempo real.
-- Es la tabla que alimenta los badges del sitio web.
-- Relación 1:1 con productos (cada producto tiene un registro).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario (
  -- ID único del registro de inventario
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Referencia al producto (relación 1:1, un registro por producto)
  producto_id     UUID NOT NULL UNIQUE REFERENCES productos(id) ON DELETE CASCADE,

  -- Cantidad de piezas disponibles actualmente
  -- La restricción CHECK evita valores negativos
  stock_actual    INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),

  -- Umbral para la alerta de "pocas piezas" (por defecto: 3)
  -- Cuando stock_actual <= stock_minimo, se activa el badge dorado
  stock_minimo    INTEGER NOT NULL DEFAULT 3 CHECK (stock_minimo >= 0),

  -- Capacidad máxima del almacén para este producto
  stock_maximo    INTEGER DEFAULT 100 CHECK (stock_maximo >= 0),

  -- Marca de tiempo de la última actualización del stock
  actualizado_en  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE inventario IS 'Stock en tiempo real. stock_minimo determina la alerta de pocas piezas.';
COMMENT ON COLUMN inventario.stock_minimo IS 'Si stock_actual <= stock_minimo, el badge muestra "Últimas N piezas".';

-- -------------------------------------------------------
-- TABLA: clientes
-- Almacena los datos de quienes realizan pedidos.
-- También incluye arquitectos e interioristas.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  -- ID único del cliente
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Nombre completo del cliente
  nombre     TEXT NOT NULL,

  -- Email único del cliente (para identificación)
  email      TEXT NOT NULL UNIQUE,

  -- Teléfono opcional
  telefono   TEXT,

  -- Tipo de cliente: 'particular', 'arquitecto', 'interiorista', 'empresa'
  tipo       TEXT DEFAULT 'particular' CHECK (tipo IN ('particular', 'arquitecto', 'interiorista', 'empresa')),

  -- Dirección de envío frecuente (opcional)
  direccion  TEXT,

  -- Marca de tiempo de registro
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE clientes IS 'Clientes registrados: particulares, arquitectos e interioristas.';

-- -------------------------------------------------------
-- TABLA: pedidos
-- Cada fila es una orden de compra completa.
-- Se relaciona con clientes y con pedido_items.
-- En fase 3 se conecta con Mercado Pago.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  -- ID único del pedido
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Cliente que realizó el pedido (NULL si es compra como invitado)
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,

  -- Estado del pedido en el flujo de trabajo
  -- pendiente → pagado → en_produccion → enviado → entregado → cancelado
  estado            TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'pagado', 'en_produccion', 'enviado', 'entregado', 'cancelado')),

  -- Monto total del pedido en MXN
  total             NUMERIC(10, 2) NOT NULL CHECK (total >= 0),

  -- Dirección de envío específica para este pedido
  direccion_envio   TEXT,

  -- ID de preferencia de Mercado Pago (se asigna al crear el pago)
  -- Se usa para redirigir al usuario al checkout de MP
  mp_preference_id  TEXT,

  -- ID del pago confirmado por Mercado Pago (se asigna al completar el pago)
  mp_payment_id     TEXT,

  -- Notas internas del pedido (uso del admin)
  notas             TEXT,

  -- Marca de tiempo de creación del pedido
  created_at        TIMESTAMPTZ DEFAULT NOW(),

  -- Marca de tiempo de la última actualización del estado
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE pedidos IS 'Órdenes de compra. El estado fluye: pendiente → pagado → en_produccion → enviado → entregado.';
COMMENT ON COLUMN pedidos.mp_preference_id IS 'ID de la preferencia de Mercado Pago para el checkout.';
COMMENT ON COLUMN pedidos.mp_payment_id IS 'ID del pago confirmado por Mercado Pago (webhook).';

-- -------------------------------------------------------
-- TABLA: pedido_items
-- Los productos individuales dentro de cada pedido.
-- Un pedido puede tener múltiples items (productos).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_items (
  -- ID único del item
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Pedido al que pertenece este item
  pedido_id        UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,

  -- Producto que se pidió
  producto_id      UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,

  -- Cantidad de unidades pedidas
  cantidad         INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),

  -- Precio unitario al momento de la compra (lo guardo por separado
  -- para que cambios futuros de precio no afecten pedidos históricos)
  precio_unitario  NUMERIC(10, 2) NOT NULL CHECK (precio_unitario >= 0)
);

COMMENT ON TABLE pedido_items IS 'Items individuales de cada pedido. precio_unitario es el precio al momento de la compra.';

-- -------------------------------------------------------
-- TABLA: contactos
-- Mensajes recibidos desde el formulario del sitio web.
-- El admin puede verlos y marcarlos como respondidos.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS contactos (
  -- ID único del mensaje
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Nombre de quien escribe
  nombre         TEXT NOT NULL,

  -- Email de contacto
  email          TEXT NOT NULL,

  -- Tipo de consulta seleccionado en el formulario
  tipo_consulta  TEXT DEFAULT 'otro'
    CHECK (tipo_consulta IN ('producto', 'personalizado', 'arquitecto', 'otro')),

  -- Mensaje completo
  mensaje        TEXT,

  -- Si el mensaje ya fue respondido (lo marco desde el panel admin)
  respondido     BOOLEAN DEFAULT FALSE,

  -- Notas internas del admin sobre este contacto
  notas_admin    TEXT,

  -- Marca de tiempo de recepción
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE contactos IS 'Mensajes del formulario de contacto del sitio web.';

-- -------------------------------------------------------
-- ÍNDICES — Mejoran la velocidad de las consultas más frecuentes
-- -------------------------------------------------------

-- Busco productos por colección frecuentemente en el catálogo
CREATE INDEX IF NOT EXISTS idx_productos_coleccion
  ON productos(coleccion_id);

-- Busco productos destacados para mostrarlos primero
CREATE INDEX IF NOT EXISTS idx_productos_destacado
  ON productos(destacado) WHERE destacado = TRUE;

-- Busco pedidos por estado desde el panel admin
CREATE INDEX IF NOT EXISTS idx_pedidos_estado
  ON pedidos(estado);

-- Busco pedidos por cliente para ver historial
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente
  ON pedidos(cliente_id);

-- Busco contactos no respondidos para la cola del admin
CREATE INDEX IF NOT EXISTS idx_contactos_respondido
  ON contactos(respondido) WHERE respondido = FALSE;

-- -------------------------------------------------------
-- FUNCIÓN: actualizar updated_at automáticamente
-- Esta función se ejecuta antes de cada UPDATE para
-- mantener actualizado el campo updated_at.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Asigno la marca de tiempo actual al campo updated_at
  NEW.updated_at = NOW();
  -- Retorno el registro modificado
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplico el trigger a productos (se actualiza al editar precio, stock, etc.)
CREATE TRIGGER trigger_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_updated_at();

-- Aplico el trigger a pedidos (se actualiza al cambiar el estado)
CREATE TRIGGER trigger_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_updated_at();

-- -------------------------------------------------------
-- FUNCIÓN: actualizar inventario.actualizado_en
-- Similar al anterior, para la tabla de inventario.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_inventario_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventario_updated
  BEFORE UPDATE ON inventario
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_inventario_timestamp();

-- -------------------------------------------------------
-- VISTA: productos_con_stock
-- Una vista que combina productos + inventario + colecciones.
-- El sitio web consulta esta vista en lugar de hacer JOINs manuales.
-- -------------------------------------------------------
CREATE OR REPLACE VIEW productos_con_stock AS
  SELECT
    -- Campos del producto
    p.id,
    p.nombre,
    p.descripcion,
    p.precio,
    p.imagen_url,
    p.materiales,
    p.dimensiones,
    p.acabado,
    p.destacado,
    p.nuevo,
    p.tags,
    p.created_at,

    -- Campos de la colección
    c.id          AS coleccion_id,
    c.nombre      AS coleccion_nombre,
    c.filosofia   AS coleccion_filosofia,

    -- Campos del inventario
    i.stock_actual,
    i.stock_minimo,
    i.actualizado_en AS stock_actualizado_en,

    -- Campo calculado: estado del stock para el badge
    -- Lo calculo aquí para no repetir la lógica en JavaScript
    CASE
      WHEN i.stock_actual = 0              THEN 'agotado'
      WHEN i.stock_actual <= i.stock_minimo THEN 'pocas'
      ELSE                                      'disponible'
    END AS estado_stock

  FROM productos p
  -- JOIN con inventario (relación 1:1)
  LEFT JOIN inventario i ON i.producto_id = p.id
  -- JOIN con colecciones para obtener el nombre
  INNER JOIN colecciones c ON c.id = p.coleccion_id
  -- Solo muestro colecciones activas
  WHERE c.activa = TRUE
  -- Ordeno: destacados primero, luego por nombre
  ORDER BY p.destacado DESC, p.nombre ASC;

COMMENT ON VIEW productos_con_stock IS
  'Vista principal del catálogo. Combina productos + inventario + colección con el estado_stock calculado.';

-- -------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Políticas de seguridad a nivel de fila.
-- Controlo quién puede leer y escribir cada tabla.
-- -------------------------------------------------------

-- Activo RLS en todas las tablas
ALTER TABLE colecciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contactos    ENABLE ROW LEVEL SECURITY;

-- COLECCIONES: cualquier visitante puede leer (es información pública)
CREATE POLICY "colecciones_lectura_publica"
  ON colecciones FOR SELECT
  USING (activa = TRUE);

-- Solo el admin (service_role) puede modificar colecciones
CREATE POLICY "colecciones_admin_todo"
  ON colecciones FOR ALL
  USING (auth.role() = 'service_role');

-- PRODUCTOS: lectura pública para el catálogo
CREATE POLICY "productos_lectura_publica"
  ON productos FOR SELECT
  USING (TRUE);

-- Solo el admin puede modificar productos
CREATE POLICY "productos_admin_todo"
  ON productos FOR ALL
  USING (auth.role() = 'service_role');

-- INVENTARIO: lectura pública (necesario para los badges de stock)
CREATE POLICY "inventario_lectura_publica"
  ON inventario FOR SELECT
  USING (TRUE);

-- Solo el admin puede actualizar el stock
CREATE POLICY "inventario_admin_todo"
  ON inventario FOR ALL
  USING (auth.role() = 'service_role');

-- CLIENTES: cada cliente solo ve sus propios datos
-- (En fase 3 usaré auth.uid() para identificar al usuario)
CREATE POLICY "clientes_admin_todo"
  ON clientes FOR ALL
  USING (auth.role() = 'service_role');

-- PEDIDOS: solo el admin los ve todos
CREATE POLICY "pedidos_admin_todo"
  ON pedidos FOR ALL
  USING (auth.role() = 'service_role');

-- PEDIDO_ITEMS: solo el admin
CREATE POLICY "pedido_items_admin_todo"
  ON pedido_items FOR ALL
  USING (auth.role() = 'service_role');

-- CONTACTOS: cualquier visitante puede INSERTAR (enviar formulario)
-- pero solo el admin puede leer y modificar
CREATE POLICY "contactos_insertar_publico"
  ON contactos FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "contactos_admin_todo"
  ON contactos FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- FIN DEL ESQUEMA
-- Después de ejecutar este archivo, ejecuta 02_seed.sql
-- para insertar los datos iniciales de las colecciones
-- y los 12 productos del catálogo.
-- ============================================================
