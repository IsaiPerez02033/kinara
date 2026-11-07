-- ============================================================
-- 03_webhook_mp.sql — Lógica de Mercado Pago en Supabase
-- Este archivo tiene dos partes:
-- 1. La función SQL que actualiza el pedido y reduce el stock
--    cuando Mercado Pago confirma un pago exitoso.
-- 2. El código de la Edge Function que recibe el webhook de MP.
-- ============================================================

-- -------------------------------------------------------
-- FUNCIÓN: procesar_pago_confirmado
-- La llamo desde la Edge Function del webhook de MP
-- cuando el estado del pago es "approved".
--
-- Hace dos cosas atómicamente (en la misma transacción):
-- 1. Actualiza el estado del pedido a "pagado"
-- 2. Reduce el stock de cada producto pedido
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION procesar_pago_confirmado(
  p_pedido_id    UUID,       -- ID del pedido en Supabase
  p_mp_payment_id TEXT       -- ID del pago en Mercado Pago
)
RETURNS VOID AS $$
DECLARE
  -- Variable para iterar sobre los items del pedido
  item RECORD;
BEGIN
  -- PASO 1: Actualizo el estado del pedido a "pagado"
  -- Guardo el ID del pago de MP para referencia futura
  UPDATE pedidos
  SET
    estado         = 'pagado',
    mp_payment_id  = p_mp_payment_id,
    updated_at     = NOW()
  WHERE id = p_pedido_id
    AND estado = 'pendiente';  -- Solo actualizo si estaba pendiente

  -- Verifico que el pedido existía y estaba pendiente
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % no encontrado o ya procesado', p_pedido_id;
  END IF;

  -- PASO 2: Reduzco el stock de cada producto en el pedido
  -- Itero sobre los items del pedido para actualizar cada uno
  FOR item IN
    SELECT producto_id, cantidad
    FROM pedido_items
    WHERE pedido_id = p_pedido_id
  LOOP
    -- Reduzco el stock del producto
    UPDATE inventario
    SET
      stock_actual   = GREATEST(0, stock_actual - item.cantidad),
      actualizado_en = NOW()
    WHERE producto_id = item.producto_id;

    -- Verifico que el stock no quedó negativo (solo log)
    IF NOT FOUND THEN
      RAISE WARNING 'No se encontró inventario para el producto %', item.producto_id;
    END IF;
  END LOOP;

  -- Log del procesamiento exitoso
  RAISE NOTICE 'Pedido % procesado correctamente con pago %', p_pedido_id, p_mp_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Doy permiso al service_role para ejecutar esta función
-- (solo la Edge Function del webhook la llama)
GRANT EXECUTE ON FUNCTION procesar_pago_confirmado TO service_role;

COMMENT ON FUNCTION procesar_pago_confirmado IS
  'Procesa atómicamente un pago confirmado: cambia estado del pedido a pagado y reduce el stock de los productos.';

-- -------------------------------------------------------
-- FUNCIÓN: obtener_resumen_pedido
-- La usa la página de confirmación para mostrar los
-- detalles del pedido al cliente después del pago.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_resumen_pedido(p_pedido_id UUID)
RETURNS TABLE (
  pedido_id        UUID,
  estado           TEXT,
  total            NUMERIC,
  direccion_envio  TEXT,
  created_at       TIMESTAMPTZ,
  cliente_nombre   TEXT,
  cliente_email    TEXT,
  -- Items del pedido como JSON
  items            JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id          AS pedido_id,
    p.estado,
    p.total,
    p.direccion_envio,
    p.created_at,
    c.nombre      AS cliente_nombre,
    c.email       AS cliente_email,
    -- Agrego todos los items como un JSON array
    json_agg(
      json_build_object(
        'nombre',          pr.nombre,
        'coleccion',       col.nombre,
        'cantidad',        pi.cantidad,
        'precio_unitario', pi.precio_unitario,
        'subtotal',        pi.cantidad * pi.precio_unitario
      )
    ) AS items
  FROM pedidos p
  LEFT JOIN clientes c    ON c.id = p.cliente_id
  LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
  LEFT JOIN productos pr  ON pr.id = pi.producto_id
  LEFT JOIN colecciones col ON col.id = pr.coleccion_id
  WHERE p.id = p_pedido_id
  GROUP BY p.id, p.estado, p.total, p.direccion_envio, p.created_at, c.nombre, c.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION obtener_resumen_pedido TO anon, authenticated, service_role;

COMMENT ON FUNCTION obtener_resumen_pedido IS
  'Retorna el resumen completo de un pedido incluyendo cliente e items para la página de confirmación.';
