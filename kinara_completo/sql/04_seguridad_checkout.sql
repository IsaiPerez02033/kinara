-- ============================================================
-- 04_seguridad_checkout.sql — Checkout, pagos y admin seguros
-- Ejecuto este archivo DESPUÉS de 03_webhook_mp.sql.
--
-- 1. El checkout se crea en el servidor (crear_pedido_checkout).
-- 2. El webhook confirma, tolera duplicados y revierte pagos.
-- 3. El resumen público ya no expone correo ni dirección.
-- 4. El panel admin usa Supabase Auth + tabla admins.
-- ============================================================

BEGIN;

-- Datos de contacto propios del pedido. El checkout es público,
-- así que un pedido nuevo nunca sobrescribe los datos de un cliente.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS contacto_nombre   TEXT,
  ADD COLUMN IF NOT EXISTS contacto_telefono TEXT;

DROP FUNCTION IF EXISTS procesar_pago_confirmado(UUID, TEXT);
DROP FUNCTION IF EXISTS obtener_resumen_pedido(UUID);

-- -------------------------------------------------------
-- FUNCIÓN: crear_pedido_checkout
-- Crea cliente, pedido e items en una sola transacción.
-- Precios y disponibilidad salen siempre de la base de datos.
-- p_items: [{ "id": "<uuid>", "cantidad": 1 }, ...]
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_pedido_checkout(
  p_nombre    TEXT,
  p_email     TEXT,
  p_telefono  TEXT,
  p_direccion TEXT,
  p_items     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cliente_id UUID;
  v_pedido_id  UUID;
  v_total      NUMERIC(10, 2) := 0;
  v_items      JSONB := '[]'::JSONB;
  item         RECORD;
BEGIN
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
    IF item.nombre IS NULL OR NOT item.activa THEN
      RAISE EXCEPTION 'CHECKOUT: Una de las piezas ya no está disponible';
    END IF;
    IF item.cantidad < 1 OR item.cantidad > item.stock_actual THEN
      RAISE EXCEPTION 'CHECKOUT: Solo hay % piezas disponibles de %', item.stock_actual, item.nombre;
    END IF;

    INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
    VALUES (v_pedido_id, item.id, item.cantidad, item.precio);

    v_total := v_total + item.precio * item.cantidad;
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

  UPDATE pedidos SET total = v_total WHERE id = v_pedido_id;

  RETURN jsonb_build_object('pedido_id', v_pedido_id, 'total', v_total, 'items', v_items);
END;
$$;

-- -------------------------------------------------------
-- FUNCIÓN: procesar_pago_confirmado
-- Retorna: procesado | duplicado | monto_distinto | no_encontrado
-- Un aviso repetido no es un error: así Mercado Pago no reintenta
-- sin fin. Un pedido cancelado sí puede pasar a pagado porque el
-- cliente pudo reintentar y el dinero ya entró.
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

  FOR item IN
    SELECT producto_id, cantidad
    FROM pedido_items
    WHERE pedido_id = p_pedido_id
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

  RETURN 'procesado';
END;
$$;

-- -------------------------------------------------------
-- FUNCIÓN: revertir_pago_confirmado
-- Reembolso o contracargo: si aún no se produce, cancelo y
-- devuelvo el stock. Si ya avanzó, dejo aviso para el admin.
-- -------------------------------------------------------
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

    UPDATE pedidos
    SET estado = 'cancelado',
        notas = concat_ws(E'\n', notas, format('Pago %s revertido en Mercado Pago: %s', p_mp_payment_id, p_estado_mp))
    WHERE id = p_pedido_id;
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

-- -------------------------------------------------------
-- FUNCIÓN: obtener_resumen_pedido
-- Pública para la página de confirmación: quien tiene el enlace
-- ve estado, artículos y nombre de pila, nunca correo ni dirección.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_resumen_pedido(p_pedido_id UUID)
RETURNS TABLE (
  pedido_id      UUID,
  estado         TEXT,
  total          NUMERIC,
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
    p.created_at,
    split_part(COALESCE(p.contacto_nombre, ''), ' ', 1),
    (
      SELECT json_agg(json_build_object(
        'nombre',          pr.nombre,
        'coleccion',       col.nombre,
        'cantidad',        pi.cantidad,
        'precio_unitario', pi.precio_unitario,
        'subtotal',        pi.cantidad * pi.precio_unitario
      ))
      FROM pedido_items pi
      JOIN productos pr    ON pr.id = pi.producto_id
      JOIN colecciones col ON col.id = pr.coleccion_id
      WHERE pi.pedido_id = p.id
    )
  FROM pedidos p
  WHERE p.id = p_pedido_id;
$$;

-- -------------------------------------------------------
-- ADMINISTRADORES
-- Una cuenta de Supabase Auth solo es admin si está en esta tabla.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

DROP POLICY IF EXISTS "colecciones_es_admin"  ON colecciones;
DROP POLICY IF EXISTS "productos_es_admin"    ON productos;
DROP POLICY IF EXISTS "inventario_es_admin"   ON inventario;
DROP POLICY IF EXISTS "clientes_es_admin"     ON clientes;
DROP POLICY IF EXISTS "pedidos_es_admin"      ON pedidos;
DROP POLICY IF EXISTS "pedido_items_es_admin" ON pedido_items;
DROP POLICY IF EXISTS "contactos_es_admin"    ON contactos;

CREATE POLICY "colecciones_es_admin"  ON colecciones  FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "productos_es_admin"    ON productos    FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "inventario_es_admin"   ON inventario   FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "clientes_es_admin"     ON clientes     FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "pedidos_es_admin"      ON pedidos      FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "pedido_items_es_admin" ON pedido_items FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());
CREATE POLICY "contactos_es_admin"    ON contactos    FOR ALL TO authenticated USING (es_admin()) WITH CHECK (es_admin());

-- -------------------------------------------------------
-- PERMISOS
-- Supabase da EXECUTE a anon por defecto: revoco explícitamente.
-- -------------------------------------------------------
REVOKE ALL ON FUNCTION crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION procesar_pago_confirmado(UUID, TEXT, NUMERIC)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION revertir_pago_confirmado(UUID, TEXT, TEXT)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION es_admin()                                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION obtener_resumen_pedido(UUID)                          FROM PUBLIC;
REVOKE ALL ON TABLE admins                                                   FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION procesar_pago_confirmado(UUID, TEXT, NUMERIC)        TO service_role;
GRANT EXECUTE ON FUNCTION revertir_pago_confirmado(UUID, TEXT, TEXT)           TO service_role;
GRANT EXECUTE ON FUNCTION es_admin()                                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION obtener_resumen_pedido(UUID)                         TO anon, authenticated, service_role;
GRANT ALL ON TABLE admins                                                      TO service_role;

-- -------------------------------------------------------
-- TIEMPO REAL: publico los cambios de inventario
-- -------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'inventario'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventario;
  END IF;
END;
$$;

COMMIT;
