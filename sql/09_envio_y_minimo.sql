-- ============================================================
-- 09_envio_y_minimo.sql — Costo de envío, envío gratis y pedido mínimo
--
-- Las reglas viven en una sola fila de ajustes_tienda. La tienda
-- las lee para mostrarlas en el carrito, pero quien decide es
-- crear_pedido_checkout: el navegador no puede cambiar el envío.
--
--   envio_costo         lo que paga el cliente por el envío
--   envio_gratis_desde  subtotal en piezas a partir del cual es gratis
--   pedido_minimo       subtotal en piezas mínimo para poder pagar
--
-- pedidos.total ahora es piezas + envío (lo que cobra Mercado Pago),
-- y pedidos.costo_envio guarda cuánto de ese total fue envío.
--
-- Para cambiar las reglas después:
--   UPDATE ajustes_tienda SET envio_costo = 159, envio_gratis_desde = 1199;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ajustes_tienda (
  id                 BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),  -- una sola fila
  envio_costo        NUMERIC(10, 2) NOT NULL DEFAULT 149 CHECK (envio_costo >= 0),
  envio_gratis_desde NUMERIC(10, 2) NOT NULL DEFAULT 999 CHECK (envio_gratis_desde >= 0),
  pedido_minimo      NUMERIC(10, 2) NOT NULL DEFAULT 200 CHECK (pedido_minimo >= 0),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ajustes_tienda (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE ajustes_tienda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ajustes_lectura_publica" ON ajustes_tienda;
DROP POLICY IF EXISTS "ajustes_cambio_admin"   ON ajustes_tienda;

CREATE POLICY "ajustes_lectura_publica" ON ajustes_tienda FOR SELECT
  TO anon, authenticated USING (TRUE);
CREATE POLICY "ajustes_cambio_admin" ON ajustes_tienda FOR UPDATE
  TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());

REVOKE ALL ON TABLE ajustes_tienda FROM anon, authenticated;
GRANT SELECT ON TABLE ajustes_tienda TO anon, authenticated;
GRANT UPDATE (envio_costo, envio_gratis_desde, pedido_minimo, updated_at) ON TABLE ajustes_tienda TO authenticated;
GRANT ALL ON TABLE ajustes_tienda TO service_role;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS costo_envio NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (costo_envio >= 0);

-- -------------------------------------------------------
-- Igual que en 07, más el pedido mínimo y el envío
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
  v_subtotal   NUMERIC(10, 2) := 0;
  v_envio      NUMERIC(10, 2) := 0;
  v_ajustes    ajustes_tienda%ROWTYPE;
  v_items      JSONB := '[]'::JSONB;
  item         RECORD;
BEGIN
  SELECT * INTO v_ajustes FROM ajustes_tienda LIMIT 1;

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

  UPDATE pedidos
  SET total = v_subtotal + v_envio,
      costo_envio = v_envio
  WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', v_pedido_id,
    'subtotal',  v_subtotal,
    'envio',     v_envio,
    'total',     v_subtotal + v_envio,
    'items',     v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_pedido_checkout(TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;
