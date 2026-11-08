-- ============================================================
-- 10_guias_y_correos.sql — Número de guía y correos de pedido
--
-- - pedidos guarda la paquetería, la guía y el enlace de rastreo
--   que el admin captura al marcar el pedido como enviado.
-- - correo_pago_at / correo_envio_at registran cuándo se mandó cada
--   correo, para no mandarlo dos veces y verlo en el panel.
-- - mis_pedidos() ahora también regresa el envío y la guía, para
--   que el cliente vea y rastree su paquete en "Mis pedidos".
-- Correr después de 09.
-- ============================================================

BEGIN;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS paqueteria      TEXT CHECK (char_length(paqueteria) <= 40),
  ADD COLUMN IF NOT EXISTS numero_guia     TEXT CHECK (char_length(numero_guia) <= 60),
  ADD COLUMN IF NOT EXISTS url_rastreo     TEXT CHECK (url_rastreo IS NULL OR (url_rastreo ~ '^https://' AND char_length(url_rastreo) <= 500)),
  ADD COLUMN IF NOT EXISTS enviado_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correo_pago_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correo_envio_at TIMESTAMPTZ;

-- Igual que en 06, más envío y guía
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
        'creado',      p.created_at,
        'actualizado', p.updated_at,
        'direccion',   p.direccion_envio,
        'paqueteria',  p.paqueteria,
        'numero_guia', p.numero_guia,
        'url_rastreo', p.url_rastreo,
        'items', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'producto_id', pi.producto_id,
            'nombre',      pr.nombre,
            'imagen_url',  pr.imagen_url,
            'cantidad',    pi.cantidad,
            'precio',      pi.precio_unitario
          ) ORDER BY pr.nombre), '[]'::JSONB)
          FROM pedido_items pi
          JOIN productos pr ON pr.id = pi.producto_id
          WHERE pi.pedido_id = p.id
        )
      ) AS pedido
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id
    WHERE c.user_id = auth.uid()
      AND (p.estado <> 'pendiente' OR p.created_at > NOW() - INTERVAL '48 hours')
  ) x;
$$;

REVOKE ALL ON FUNCTION mis_pedidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mis_pedidos() TO authenticated;

COMMIT;
