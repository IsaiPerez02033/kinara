-- ============================================================
-- 11_iva_monedero_resenas_cotizaciones.sql
-- Correr después de 10.
--
-- 1. IVA: los precios ya lo incluyen. Cada pedido guarda la tasa
--    y cuánto IVA lleva su total, para desglosarlo en la tienda,
--    en Mi cuenta y en los correos. Se apaga con
--    UPDATE ajustes_tienda SET iva_desglosar = FALSE;
-- 2. Monedero Kinara: cada pedido pagado deja un % de lo pagado en
--    piezas (3% por omisión) como saldo. Se usa con sesión en la
--    siguiente compra, hasta la mitad de las piezas. Vence si pasan
--    12 meses sin compras. El saldo se calcula de los movimientos:
--    un pedido cancelado o reembolsado deja de contar solo.
-- 3. Reseñas: solo quien recibió la pieza (pedido enviado o
--    entregado) puede reseñarla. Se publican al instante; el admin
--    puede ocultarlas.
-- 4. Cotizaciones a medida: el cliente con cuenta sube archivos y
--    detalles; el admin pone precio, envío y tiempo; el cliente la
--    paga con Mercado Pago como un pedido más.
-- ============================================================

BEGIN;

-- -------------------------------------------------------
-- AJUSTES
-- -------------------------------------------------------
ALTER TABLE ajustes_tienda
  ADD COLUMN IF NOT EXISTS iva_tasa                NUMERIC(5, 4) NOT NULL DEFAULT 0.16 CHECK (iva_tasa >= 0 AND iva_tasa < 1),
  ADD COLUMN IF NOT EXISTS iva_desglosar           BOOLEAN       NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS monedero_pct            NUMERIC(5, 2) NOT NULL DEFAULT 3  CHECK (monedero_pct BETWEEN 0 AND 30),
  ADD COLUMN IF NOT EXISTS monedero_uso_max_pct    NUMERIC(5, 2) NOT NULL DEFAULT 50 CHECK (monedero_uso_max_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS monedero_vigencia_meses INTEGER       NOT NULL DEFAULT 12 CHECK (monedero_vigencia_meses BETWEEN 1 AND 60);

GRANT UPDATE (iva_tasa, iva_desglosar, monedero_pct, monedero_uso_max_pct, monedero_vigencia_meses)
  ON TABLE ajustes_tienda TO authenticated;

-- IVA contenido en un precio que ya lo incluye
CREATE OR REPLACE FUNCTION iva_incluido(p_monto NUMERIC, p_tasa NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN COALESCE(p_tasa, 0) <= 0 THEN 0
              ELSE round(p_monto - p_monto / (1 + p_tasa), 2) END;
$$;

-- -------------------------------------------------------
-- COTIZACIONES (antes que pedidos, por la referencia)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS cotizaciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL DEFAULT 'a_medida' CHECK (tipo IN ('a_medida', 'figura', 'volumen', 'otro')),
  titulo           TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 120),
  descripcion      TEXT NOT NULL CHECK (char_length(descripcion) BETWEEN 10 AND 3000),
  medidas          TEXT CHECK (char_length(medidas) <= 120),
  material         TEXT CHECK (char_length(material) <= 60),
  color            TEXT CHECK (char_length(color) <= 60),
  cantidad         INTEGER NOT NULL DEFAULT 1 CHECK (cantidad BETWEEN 1 AND 1000),
  archivos         TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(archivos) <= 6),
  estado           TEXT NOT NULL DEFAULT 'nueva'
    CHECK (estado IN ('nueva', 'cotizada', 'pagada', 'rechazada', 'cancelada')),
  precio_unitario  NUMERIC(10, 2) CHECK (precio_unitario > 0),
  costo_envio      NUMERIC(10, 2) CHECK (costo_envio >= 0),
  dias_produccion  INTEGER CHECK (dias_produccion BETWEEN 1 AND 120),
  respuesta        TEXT CHECK (char_length(respuesta) <= 2000),
  cotizada_at      TIMESTAMPTZ,
  vence_at         TIMESTAMPTZ,
  aviso_admin_at   TIMESTAMPTZ,
  aviso_cliente_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una cotización con precio siempre trae envío y tiempo
  CONSTRAINT cotizacion_completa CHECK (
    estado NOT IN ('cotizada', 'pagada')
    OR (precio_unitario IS NOT NULL AND costo_envio IS NOT NULL AND dias_produccion IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS cotizaciones_user_idx ON cotizaciones (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cotizaciones_estado_idx ON cotizaciones (estado, created_at DESC);

DROP TRIGGER IF EXISTS trigger_cotizaciones_updated_at ON cotizaciones;
CREATE TRIGGER trigger_cotizaciones_updated_at
  BEFORE UPDATE ON cotizaciones
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

-- Máximo 5 solicitudes abiertas por cuenta, para evitar spam
CREATE OR REPLACE FUNCTION limitar_cotizaciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM cotizaciones WHERE user_id = NEW.user_id AND estado = 'nueva') >= 5 THEN
    RAISE EXCEPTION 'Tienes 5 cotizaciones en revisión. Espera nuestra respuesta para pedir otra.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cotizaciones_limite ON cotizaciones;
CREATE TRIGGER cotizaciones_limite
  BEFORE INSERT ON cotizaciones
  FOR EACH ROW EXECUTE FUNCTION limitar_cotizaciones();

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cotizaciones_propias_leer"    ON cotizaciones;
DROP POLICY IF EXISTS "cotizaciones_propias_crear"   ON cotizaciones;
DROP POLICY IF EXISTS "cotizaciones_es_admin"        ON cotizaciones;

CREATE POLICY "cotizaciones_propias_leer" ON cotizaciones FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- Solo se crea en estado nueva, sin precio, y con archivos de su carpeta
CREATE POLICY "cotizaciones_propias_crear" ON cotizaciones FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND estado = 'nueva'
    AND precio_unitario IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM unnest(archivos) AS a
      WHERE a NOT LIKE auth.uid()::TEXT || '/%' OR a LIKE '%..%'
    )
  );

CREATE POLICY "cotizaciones_es_admin" ON cotizaciones FOR ALL
  TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());

REVOKE ALL ON TABLE cotizaciones FROM anon, authenticated;
GRANT SELECT ON TABLE cotizaciones TO authenticated;
GRANT INSERT (tipo, titulo, descripcion, medidas, material, color, cantidad, archivos) ON TABLE cotizaciones TO authenticated;
-- Los clientes no tienen política de UPDATE: estas columnas solo las cambia el admin
GRANT UPDATE (estado, cantidad, precio_unitario, costo_envio, dias_produccion, respuesta, cotizada_at, vence_at, aviso_cliente_at)
  ON TABLE cotizaciones TO authenticated;
GRANT ALL ON TABLE cotizaciones TO service_role;

-- El cliente puede cancelar su solicitud mientras no la haya pagado
CREATE OR REPLACE FUNCTION cancelar_mi_cotizacion(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    UPDATE cotizaciones SET estado = 'cancelada'
    WHERE id = p_id AND user_id = auth.uid() AND estado IN ('nueva', 'cotizada')
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM c);
$$;

REVOKE ALL ON FUNCTION cancelar_mi_cotizacion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_mi_cotizacion(UUID) TO authenticated;

-- Archivos de cotización: privados, cada cuenta en su carpeta
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cotizaciones', 'cotizaciones', FALSE, 26214400, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = NULL;

DROP POLICY IF EXISTS "cotizaciones_archivos_subir"  ON storage.objects;
DROP POLICY IF EXISTS "cotizaciones_archivos_leer"   ON storage.objects;
DROP POLICY IF EXISTS "cotizaciones_archivos_borrar" ON storage.objects;

CREATE POLICY "cotizaciones_archivos_subir" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cotizaciones'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
    AND lower(storage.extension(name)) IN ('stl', 'obj', '3mf', 'step', 'stp', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf')
  );
CREATE POLICY "cotizaciones_archivos_leer" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cotizaciones' AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.es_admin()));
CREATE POLICY "cotizaciones_archivos_borrar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cotizaciones' AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.es_admin()));

-- -------------------------------------------------------
-- PEDIDOS: monedero, IVA y piezas de cotización
-- -------------------------------------------------------
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS descuento_monedero NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (descuento_monedero >= 0),
  ADD COLUMN IF NOT EXISTS iva_tasa           NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS iva_incluido       NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS cotizacion_id      UUID REFERENCES cotizaciones(id) ON DELETE SET NULL;

-- Una pieza de cotización no es un producto del catálogo
ALTER TABLE pedido_items ALTER COLUMN producto_id DROP NOT NULL;
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS concepto TEXT CHECK (char_length(concepto) <= 200);
ALTER TABLE pedido_items DROP CONSTRAINT IF EXISTS pedido_items_producto_o_concepto;
ALTER TABLE pedido_items ADD CONSTRAINT pedido_items_producto_o_concepto
  CHECK (producto_id IS NOT NULL OR concepto IS NOT NULL);

-- Pedidos viejos: su IVA con la tasa actual
UPDATE pedidos p
SET iva_tasa = a.iva_tasa, iva_incluido = iva_incluido(p.total, a.iva_tasa)
FROM ajustes_tienda a
WHERE p.iva_tasa IS NULL;

-- -------------------------------------------------------
-- MONEDERO
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS monedero_movimientos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pedido_id  UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('ganado', 'usado', 'ajuste')),
  monto      NUMERIC(10, 2) NOT NULL CHECK (monto <> 0),
  nota       TEXT CHECK (char_length(nota) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pedido_id, tipo)
);

CREATE INDEX IF NOT EXISTS monedero_cliente_idx ON monedero_movimientos (cliente_id, created_at DESC);

ALTER TABLE monedero_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monedero_es_admin" ON monedero_movimientos;
CREATE POLICY "monedero_es_admin" ON monedero_movimientos FOR ALL
  TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
REVOKE ALL ON TABLE monedero_movimientos FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE monedero_movimientos TO authenticated;
GRANT ALL ON TABLE monedero_movimientos TO service_role;

-- Movimientos que cuentan: ajustes, pedidos cobrados, y lo apartado
-- por un pedido que todavía se puede pagar (48 h, como la preferencia).
CREATE OR REPLACE FUNCTION monedero_movimientos_validos(p_cliente_id UUID)
RETURNS TABLE (id UUID, pedido_id UUID, tipo TEXT, monto NUMERIC, nota TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.id, m.pedido_id, m.tipo, m.monto, m.nota, m.created_at
  FROM monedero_movimientos m
  LEFT JOIN pedidos p ON p.id = m.pedido_id
  WHERE m.cliente_id = p_cliente_id
    AND (
      m.pedido_id IS NULL
      OR p.estado IN ('pagado', 'en_produccion', 'enviado', 'entregado')
      OR (m.tipo = 'usado' AND p.estado = 'pendiente' AND p.created_at > NOW() - INTERVAL '48 hours')
    );
$$;

-- Saldo disponible. Vence completo si pasan N meses sin movimientos.
CREATE OR REPLACE FUNCTION monedero_saldo(p_cliente_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN max(v.created_at) IS NULL THEN 0
    WHEN max(v.created_at) < NOW() - make_interval(months => (SELECT monedero_vigencia_meses FROM ajustes_tienda LIMIT 1)) THEN 0
    ELSE GREATEST(0, sum(v.monto))
  END
  FROM monedero_movimientos_validos(p_cliente_id) v;
$$;

REVOKE ALL ON FUNCTION monedero_movimientos_validos(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION monedero_saldo(UUID)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION monedero_movimientos_validos(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION monedero_saldo(UUID)               TO service_role;

-- Lo que ve el cliente en Mi cuenta y en el checkout
CREATE OR REPLACE FUNCTION mi_monedero()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente UUID;
  v_ajustes ajustes_tienda%ROWTYPE;
  v_ultimo  TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_ajustes FROM ajustes_tienda LIMIT 1;
  SELECT id INTO v_cliente FROM clientes WHERE user_id = auth.uid();

  IF v_cliente IS NULL THEN
    RETURN jsonb_build_object('saldo', 0, 'vence', NULL, 'movimientos', '[]'::JSONB,
      'pct', v_ajustes.monedero_pct, 'uso_max_pct', v_ajustes.monedero_uso_max_pct,
      'vigencia_meses', v_ajustes.monedero_vigencia_meses);
  END IF;

  SELECT max(created_at) INTO v_ultimo FROM monedero_movimientos_validos(v_cliente);

  RETURN jsonb_build_object(
    'saldo', monedero_saldo(v_cliente),
    'vence', v_ultimo + make_interval(months => v_ajustes.monedero_vigencia_meses),
    'pct', v_ajustes.monedero_pct,
    'uso_max_pct', v_ajustes.monedero_uso_max_pct,
    'vigencia_meses', v_ajustes.monedero_vigencia_meses,
    'movimientos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', v.tipo, 'monto', v.monto, 'nota', v.nota, 'fecha', v.created_at,
        'pedido', upper(left(v.pedido_id::TEXT, 8))
      ) ORDER BY v.created_at DESC)
      FROM (SELECT * FROM monedero_movimientos_validos(v_cliente) ORDER BY created_at DESC LIMIT 30) v
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION mi_monedero() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mi_monedero() TO authenticated;

-- -------------------------------------------------------
-- Cierra el cobro de un pedido recién creado: aplica el monedero,
-- guarda total, envío e IVA, y regresa el resumen para la preferencia.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION cerrar_cobro_pedido(
  p_pedido_id     UUID,
  p_cliente_id    UUID,
  p_subtotal      NUMERIC,
  p_envio         NUMERIC,
  p_usar_monedero BOOLEAN,
  p_user_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ajustes   ajustes_tienda%ROWTYPE;
  v_descuento NUMERIC(10, 2) := 0;
  v_total     NUMERIC(10, 2);
BEGIN
  SELECT * INTO v_ajustes FROM ajustes_tienda LIMIT 1;

  -- El saldo solo lo usa el dueño de la cuenta. El checkout ya bloqueó
  -- la fila del cliente, así que dos pagos a la vez no gastan lo mismo.
  IF p_usar_monedero AND p_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente_id AND user_id = p_user_id) THEN
    v_descuento := LEAST(
      monedero_saldo(p_cliente_id),
      round(p_subtotal * v_ajustes.monedero_uso_max_pct / 100, 2)
    );
    IF v_descuento > 0 THEN
      INSERT INTO monedero_movimientos (cliente_id, pedido_id, tipo, monto, nota)
      VALUES (p_cliente_id, p_pedido_id, 'usado', -v_descuento, 'Usado en el pedido');
    ELSE
      v_descuento := 0;
    END IF;
  END IF;

  v_total := p_subtotal + p_envio - v_descuento;

  UPDATE pedidos
  SET total              = v_total,
      costo_envio        = p_envio,
      descuento_monedero = v_descuento,
      iva_tasa           = v_ajustes.iva_tasa,
      iva_incluido       = iva_incluido(v_total, v_ajustes.iva_tasa)
  WHERE id = p_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', p_pedido_id,
    'subtotal',  p_subtotal,
    'envio',     p_envio,
    'descuento', v_descuento,
    'total',     v_total,
    'iva',       iva_incluido(v_total, v_ajustes.iva_tasa)
  );
END;
$$;

REVOKE ALL ON FUNCTION cerrar_cobro_pedido(UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cerrar_cobro_pedido(UUID, UUID, NUMERIC, NUMERIC, BOOLEAN, UUID) TO service_role;

-- -------------------------------------------------------
-- CHECKOUT DEL CATÁLOGO (igual que en 09, más monedero e IVA)
-- Los parámetros nuevos tienen valor por omisión: la Edge Function
-- vieja sigue funcionando mientras se actualiza.
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION crear_pedido_checkout(
  p_nombre        TEXT,
  p_email         TEXT,
  p_telefono      TEXT,
  p_direccion     TEXT,
  p_items         JSONB,
  p_usar_monedero BOOLEAN DEFAULT FALSE,
  p_user_id       UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
  v_pedido_id  UUID;
  v_subtotal   NUMERIC(10, 2) := 0;
  v_envio      NUMERIC(10, 2) := 0;
  v_ajustes    ajustes_tienda%ROWTYPE;
  v_items      JSONB := '[]'::JSONB;
  v_cobro      JSONB;
  item         RECORD;
BEGIN
  SELECT * INTO v_ajustes FROM ajustes_tienda LIMIT 1;

  -- El DO UPDATE bloquea la fila del cliente hasta terminar
  INSERT INTO clientes (nombre, email, telefono, direccion)
  VALUES (p_nombre, lower(p_email), p_telefono, p_direccion)
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
  RETURNING id INTO v_cliente_id;

  INSERT INTO pedidos (cliente_id, estado, total, direccion_envio, contacto_nombre, contacto_telefono)
  VALUES (v_cliente_id, 'pendiente', 0, p_direccion, p_nombre, p_telefono)
  RETURNING id INTO v_pedido_id;

  -- Agrupo por producto por si el mismo ID llega repetido
  FOR item IN
    SELECT
      s.id,
      s.cantidad,
      pr.nombre,
      pr.precio,
      col.nombre AS coleccion,
      col.activa,
      pr.activo,
      COALESCE(inv.stock_actual, 0) AS stock_actual
    FROM (
      SELECT (e->>'id')::UUID AS id, SUM((e->>'cantidad')::INTEGER)::INTEGER AS cantidad
      FROM jsonb_array_elements(p_items) AS e
      GROUP BY 1
    ) s
    LEFT JOIN productos pr    ON pr.id = s.id
    LEFT JOIN colecciones col ON col.id = pr.coleccion_id
    LEFT JOIN inventario inv  ON inv.producto_id = s.id
    ORDER BY s.id
  LOOP
    IF item.nombre IS NULL OR NOT item.activa OR NOT item.activo THEN
      RAISE EXCEPTION 'CHECKOUT: Una de las piezas ya no está disponible';
    END IF;
    IF item.cantidad < 1 OR item.cantidad > item.stock_actual THEN
      RAISE EXCEPTION 'CHECKOUT: Solo hay % piezas disponibles de %', item.stock_actual, item.nombre;
    END IF;

    INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    VALUES (v_pedido_id, item.id, item.cantidad, item.precio);

    v_subtotal := v_subtotal + item.precio * item.cantidad;
    v_items := v_items || jsonb_build_object(
      'id',       item.id,
      'titulo',   item.coleccion || ' — ' || item.nombre,
      'precio',   item.precio,
      'cantidad', item.cantidad
    );
  END LOOP;

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'CHECKOUT: El carrito está vacío';
  END IF;

  -- El error deshace todo: no queda pedido ni cliente a medias
  IF v_ajustes.pedido_minimo IS NOT NULL AND v_subtotal < v_ajustes.pedido_minimo THEN
    RAISE EXCEPTION 'CHECKOUT: El pedido mínimo es de $% en piezas',
      to_char(v_ajustes.pedido_minimo, 'FM999,999');
  END IF;

  IF v_ajustes.envio_costo IS NOT NULL AND v_subtotal < v_ajustes.envio_gratis_desde THEN
    v_envio := v_ajustes.envio_costo;
  END IF;

  v_cobro := cerrar_cobro_pedido(v_pedido_id, v_cliente_id, v_subtotal, v_envio, p_usar_monedero, p_user_id);
  RETURN v_cobro || jsonb_build_object('items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, UUID) TO service_role;

-- -------------------------------------------------------
-- PAGAR UNA COTIZACIÓN
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_pedido_cotizacion(
  p_cotizacion_id UUID,
  p_user_id       UUID,
  p_email         TEXT,
  p_nombre        TEXT,
  p_telefono      TEXT,
  p_direccion     TEXT,
  p_usar_monedero BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c            cotizaciones%ROWTYPE;
  v_cliente_id UUID;
  v_pedido_id  UUID;
  v_subtotal   NUMERIC(10, 2);
  v_titulo     TEXT;
  v_cobro      JSONB;
BEGIN
  SELECT * INTO c FROM cotizaciones WHERE id = p_cotizacion_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHECKOUT: No encontramos esa cotización';
  END IF;
  IF c.estado <> 'cotizada' THEN
    RAISE EXCEPTION 'CHECKOUT: Esta cotización ya no se puede pagar';
  END IF;
  IF c.vence_at IS NOT NULL AND c.vence_at < NOW() THEN
    RAISE EXCEPTION 'CHECKOUT: Esta cotización venció. Escríbenos y la actualizamos.';
  END IF;

  -- p_email es el correo confirmado de la sesión (lo valida la Edge Function)
  INSERT INTO clientes (nombre, email, telefono, direccion, user_id)
  VALUES (p_nombre, lower(p_email), p_telefono, p_direccion, p_user_id)
  ON CONFLICT (email) DO UPDATE SET user_id = COALESCE(clientes.user_id, EXCLUDED.user_id)
  RETURNING id INTO v_cliente_id;

  INSERT INTO pedidos (cliente_id, estado, total, direccion_envio, contacto_nombre, contacto_telefono, cotizacion_id)
  VALUES (v_cliente_id, 'pendiente', 0, p_direccion, p_nombre, p_telefono, c.id)
  RETURNING id INTO v_pedido_id;

  v_titulo := 'Pieza a medida: ' || c.titulo;
  INSERT INTO pedido_items (pedido_id, producto_id, concepto, cantidad, precio_unitario)
  VALUES (v_pedido_id, NULL, left(v_titulo, 200), c.cantidad, c.precio_unitario);

  v_subtotal := c.precio_unitario * c.cantidad;
  v_cobro := cerrar_cobro_pedido(v_pedido_id, v_cliente_id, v_subtotal, c.costo_envio, p_usar_monedero, p_user_id);

  RETURN v_cobro || jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
    'id', c.id, 'titulo', left(v_titulo, 200), 'precio', c.precio_unitario, 'cantidad', c.cantidad
  )));
END;
$$;

REVOKE ALL ON FUNCTION crear_pedido_cotizacion(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_pedido_cotizacion(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

-- -------------------------------------------------------
-- PAGO CONFIRMADO (igual que en 04, más monedero y cotización)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION procesar_pago_confirmado(
  p_pedido_id     UUID,
  p_mp_payment_id TEXT,
  p_monto         NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pedido pedidos%ROWTYPE;
  v_notas  TEXT := NULL;
  v_stock  INTEGER;
  v_ganado NUMERIC(10, 2);
  item     RECORD;
BEGIN
  -- Bloqueo el pedido para que dos avisos simultáneos no descuenten dos veces
  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'no_encontrado';
  END IF;

  IF v_pedido.estado NOT IN ('pendiente', 'cancelado') THEN
    IF v_pedido.mp_payment_id IS DISTINCT FROM p_mp_payment_id THEN
      UPDATE pedidos
      SET notas = concat_ws(E'\n', notas, format('REVISAR: segundo pago %s recibido (posible doble cobro)', p_mp_payment_id))
      WHERE id = p_pedido_id;
    END IF;
    RETURN 'duplicado';
  END IF;

  IF p_monto IS NULL OR p_monto < v_pedido.total THEN
    UPDATE pedidos
    SET notas = concat_ws(E'\n', notas, format('REVISAR: pago %s por %s, menor al total %s', p_mp_payment_id, p_monto, v_pedido.total))
    WHERE id = p_pedido_id;
    RETURN 'monto_distinto';
  END IF;

  IF v_pedido.estado = 'cancelado' THEN
    v_notas := format('REVISAR: pago %s aprobado sobre un pedido cancelado', p_mp_payment_id);
  END IF;

  -- Solo las piezas del catálogo tienen stock
  FOR item IN
    SELECT producto_id, cantidad
    FROM pedido_items
    WHERE pedido_id = p_pedido_id AND producto_id IS NOT NULL
    ORDER BY producto_id
  LOOP
    SELECT stock_actual INTO v_stock
    FROM inventario
    WHERE producto_id = item.producto_id
    FOR UPDATE;

    IF COALESCE(v_stock, 0) < item.cantidad THEN
      v_notas := concat_ws(E'\n', v_notas, format('REVISAR: sobreventa del producto %s', item.producto_id));
    END IF;

    UPDATE inventario
    SET stock_actual = GREATEST(0, stock_actual - item.cantidad)
    WHERE producto_id = item.producto_id;
  END LOOP;

  UPDATE pedidos
  SET estado = 'pagado',
      mp_payment_id = p_mp_payment_id,
      notas = concat_ws(E'\n', notas, v_notas)
  WHERE id = p_pedido_id;

  -- Monedero: un % de lo pagado en piezas (sin envío)
  IF v_pedido.cliente_id IS NOT NULL THEN
    SELECT round((v_pedido.total - v_pedido.costo_envio) * monedero_pct / 100, 2)
    INTO v_ganado FROM ajustes_tienda LIMIT 1;
    IF v_ganado > 0 THEN
      INSERT INTO monedero_movimientos (cliente_id, pedido_id, tipo, monto, nota)
      VALUES (v_pedido.cliente_id, p_pedido_id, 'ganado', v_ganado, 'Por tu compra')
      ON CONFLICT (pedido_id, tipo) DO NOTHING;
    END IF;
  END IF;

  IF v_pedido.cotizacion_id IS NOT NULL THEN
    UPDATE cotizaciones SET estado = 'pagada' WHERE id = v_pedido.cotizacion_id;
  END IF;

  RETURN 'procesado';
END;
$$;

-- Si se reembolsa el pago de una cotización, vuelve a quedar por pagar
CREATE OR REPLACE FUNCTION revertir_pago_confirmado(
  p_pedido_id     UUID,
  p_mp_payment_id TEXT,
  p_estado_mp     TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pedido pedidos%ROWTYPE;
BEGIN
  SELECT * INTO v_pedido FROM pedidos WHERE id = p_pedido_id FOR UPDATE;

  IF NOT FOUND OR v_pedido.mp_payment_id IS DISTINCT FROM p_mp_payment_id THEN
    RETURN 'ignorado';
  END IF;

  IF v_pedido.estado = 'pagado' THEN
    UPDATE inventario i
    SET stock_actual = i.stock_actual + pi.cantidad
    FROM pedido_items pi
    WHERE pi.pedido_id = p_pedido_id AND i.producto_id = pi.producto_id;

    -- Cancelado, el monedero ganado y el usado dejan de contar solos
    UPDATE pedidos
    SET estado = 'cancelado',
        notas = concat_ws(E'\n', notas, format('Pago %s revertido en Mercado Pago: %s', p_mp_payment_id, p_estado_mp))
    WHERE id = p_pedido_id;

    IF v_pedido.cotizacion_id IS NOT NULL THEN
      UPDATE cotizaciones SET estado = 'cotizada'
      WHERE id = v_pedido.cotizacion_id AND estado = 'pagada';
    END IF;
    RETURN 'revertido';
  END IF;

  IF v_pedido.estado IN ('en_produccion', 'enviado', 'entregado') THEN
    UPDATE pedidos
    SET notas = concat_ws(E'\n', notas, format('REVISAR: pago %s revertido en Mercado Pago: %s', p_mp_payment_id, p_estado_mp))
    WHERE id = p_pedido_id;
    RETURN 'revisar';
  END IF;

  RETURN 'ignorado';
END;
$$;

REVOKE ALL ON FUNCTION procesar_pago_confirmado(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION revertir_pago_confirmado(UUID, TEXT, TEXT)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION procesar_pago_confirmado(UUID, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION revertir_pago_confirmado(UUID, TEXT, TEXT)    TO service_role;

-- -------------------------------------------------------
-- RESUMEN PÚBLICO (confirmación): ahora con envío, monedero e IVA
-- -------------------------------------------------------
DROP FUNCTION IF EXISTS obtener_resumen_pedido(UUID);

CREATE OR REPLACE FUNCTION obtener_resumen_pedido(p_pedido_id UUID)
RETURNS TABLE (
  pedido_id      UUID,
  estado         TEXT,
  total          NUMERIC,
  envio          NUMERIC,
  descuento      NUMERIC,
  iva            NUMERIC,
  iva_tasa       NUMERIC,
  created_at     TIMESTAMPTZ,
  cliente_nombre TEXT,
  items          JSON
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.estado,
    p.total,
    p.costo_envio,
    p.descuento_monedero,
    CASE WHEN a.iva_desglosar THEN p.iva_incluido END,
    CASE WHEN a.iva_desglosar THEN p.iva_tasa END,
    p.created_at,
    split_part(COALESCE(p.contacto_nombre, ''), ' ', 1),
    (
      SELECT json_agg(json_build_object(
        'nombre',          COALESCE(pr.nombre, pi.concepto),
        'coleccion',       COALESCE(col.nombre, 'A la medida'),
        'cantidad',        pi.cantidad,
        'precio_unitario', pi.precio_unitario,
        'subtotal',        pi.cantidad * pi.precio_unitario
      ))
      FROM pedido_items pi
      LEFT JOIN productos pr    ON pr.id = pi.producto_id
      LEFT JOIN colecciones col ON col.id = pr.coleccion_id
      WHERE pi.pedido_id = p.id
    )
  FROM pedidos p
  CROSS JOIN (SELECT iva_desglosar FROM ajustes_tienda LIMIT 1) a
  WHERE p.id = p_pedido_id;
$$;

REVOKE ALL ON FUNCTION obtener_resumen_pedido(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION obtener_resumen_pedido(UUID) TO anon, authenticated, service_role;

-- -------------------------------------------------------
-- MIS PEDIDOS (igual que en 10, más monedero, IVA y cotizaciones)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION mis_pedidos()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(x.pedido ORDER BY x.created_at DESC), '[]'::JSONB)
  FROM (
    SELECT
      p.created_at,
      jsonb_build_object(
        'id',          p.id,
        'estado',      p.estado,
        'total',       p.total,
        'envio',       p.costo_envio,
        'descuento',   p.descuento_monedero,
        'iva',         CASE WHEN a.iva_desglosar THEN p.iva_incluido END,
        'iva_tasa',    CASE WHEN a.iva_desglosar THEN p.iva_tasa END,
        'creado',      p.created_at,
        'actualizado', p.updated_at,
        'direccion',   p.direccion_envio,
        'paqueteria',  p.paqueteria,
        'numero_guia', p.numero_guia,
        'url_rastreo', p.url_rastreo,
        'cotizacion',  p.cotizacion_id,
        'items', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'producto_id', pi.producto_id,
            'nombre',      COALESCE(pr.nombre, pi.concepto),
            'imagen_url',  pr.imagen_url,
            'cantidad',    pi.cantidad,
            'precio',      pi.precio_unitario
          ) ORDER BY COALESCE(pr.nombre, pi.concepto)), '[]'::JSONB)
          FROM pedido_items pi
          LEFT JOIN productos pr ON pr.id = pi.producto_id
          WHERE pi.pedido_id = p.id
        )
      ) AS pedido
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id
    CROSS JOIN (SELECT iva_desglosar FROM ajustes_tienda LIMIT 1) a
    WHERE c.user_id = auth.uid()
      AND (p.estado <> 'pendiente' OR p.created_at > NOW() - INTERVAL '48 hours')
  ) x;
$$;

REVOKE ALL ON FUNCTION mis_pedidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mis_pedidos() TO authenticated;

-- -------------------------------------------------------
-- RESEÑAS
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS resenas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id  UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pedido_id    UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  autor        TEXT NOT NULL CHECK (char_length(autor) BETWEEN 1 AND 60),
  calificacion SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  titulo       TEXT CHECK (char_length(titulo) <= 80),
  texto        TEXT NOT NULL CHECK (char_length(texto) BETWEEN 10 AND 1500),
  visible      BOOLEAN NOT NULL DEFAULT TRUE,
  respuesta    TEXT CHECK (char_length(respuesta) <= 1000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (producto_id, user_id)
);

CREATE INDEX IF NOT EXISTS resenas_producto_idx ON resenas (producto_id, created_at DESC) WHERE visible;

DROP TRIGGER IF EXISTS trigger_resenas_updated_at ON resenas;
CREATE TRIGGER trigger_resenas_updated_at
  BEFORE UPDATE ON resenas
  FOR EACH ROW EXECUTE FUNCTION actualizar_updated_at();

ALTER TABLE resenas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resenas_es_admin" ON resenas;
CREATE POLICY "resenas_es_admin" ON resenas FOR ALL
  TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());
-- Lectura pública solo por funciones: así no se expone el user_id
REVOKE ALL ON TABLE resenas FROM anon, authenticated;
GRANT SELECT, DELETE ON TABLE resenas TO authenticated;
GRANT UPDATE (visible, respuesta) ON TABLE resenas TO authenticated;
GRANT ALL ON TABLE resenas TO service_role;

-- Promedio y número de reseñas visibles de cada producto
CREATE OR REPLACE FUNCTION resumen_resenas()
RETURNS TABLE (producto_id UUID, promedio NUMERIC, total INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.producto_id, round(avg(r.calificacion), 1), count(*)::INTEGER
  FROM resenas r
  WHERE r.visible
  GROUP BY r.producto_id;
$$;

CREATE OR REPLACE FUNCTION resenas_de_producto(p_producto_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'autor', r.autor, 'calificacion', r.calificacion, 'titulo', r.titulo,
    'texto', r.texto, 'respuesta', r.respuesta, 'fecha', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::JSONB)
  FROM (
    SELECT * FROM resenas
    WHERE producto_id = p_producto_id AND visible
    ORDER BY created_at DESC
    LIMIT 50
  ) r;
$$;

-- Productos que el cliente ya recibió y sus reseñas
CREATE OR REPLACE FUNCTION mis_resenas()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'producto_id', r.producto_id, 'calificacion', r.calificacion, 'titulo', r.titulo,
    'texto', r.texto, 'visible', r.visible, 'respuesta', r.respuesta
  )), '[]'::JSONB)
  FROM resenas r
  WHERE r.user_id = auth.uid();
$$;

-- Crea o edita la reseña del cliente. Editar no vuelve visible una
-- reseña que el admin ocultó.
CREATE OR REPLACE FUNCTION guardar_mi_resena(
  p_producto_id  UUID,
  p_calificacion INTEGER,
  p_titulo       TEXT,
  p_texto        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_pedido UUID;
  v_nombre TEXT;
  v_autor  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para dejar tu reseña';
  END IF;

  SELECT p.id, c.nombre INTO v_pedido, v_nombre
  FROM pedidos p
  JOIN clientes c      ON c.id = p.cliente_id
  JOIN pedido_items pi ON pi.pedido_id = p.id
  WHERE c.user_id = v_uid
    AND pi.producto_id = p_producto_id
    AND p.estado IN ('enviado', 'entregado')
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pedido IS NULL THEN
    RAISE EXCEPTION 'Solo puedes reseñar piezas que ya te enviamos';
  END IF;

  -- "Ana García López" → "Ana G."
  v_nombre := trim(COALESCE(v_nombre, ''));
  v_autor := split_part(v_nombre, ' ', 1);
  IF split_part(v_nombre, ' ', 2) <> '' THEN
    v_autor := v_autor || ' ' || upper(left(split_part(v_nombre, ' ', 2), 1)) || '.';
  END IF;
  IF v_autor = '' THEN v_autor := 'Cliente Kinara'; END IF;

  INSERT INTO resenas (producto_id, user_id, pedido_id, autor, calificacion, titulo, texto)
  VALUES (p_producto_id, v_uid, v_pedido, left(v_autor, 60), p_calificacion,
          NULLIF(trim(p_titulo), ''), trim(p_texto))
  ON CONFLICT (producto_id, user_id) DO UPDATE
    SET calificacion = EXCLUDED.calificacion,
        titulo       = EXCLUDED.titulo,
        texto        = EXCLUDED.texto,
        autor        = EXCLUDED.autor;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION resumen_resenas()                                  FROM PUBLIC;
REVOKE ALL ON FUNCTION resenas_de_producto(UUID)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION mis_resenas()                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION guardar_mi_resena(UUID, INTEGER, TEXT, TEXT)       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_resenas()                               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resenas_de_producto(UUID)                       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mis_resenas()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION guardar_mi_resena(UUID, INTEGER, TEXT, TEXT)    TO authenticated;

COMMIT;
