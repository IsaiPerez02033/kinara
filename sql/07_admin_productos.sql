-- ============================================================
-- 07_admin_productos.sql — El panel admin crea productos y sube fotos
-- Correr una vez en Supabase → SQL Editor, después de 06.
--
-- - productos.activo: ocultar un producto sin borrarlo. Oculto no
--   se ve en la tienda ni se puede comprar, pero sus pedidos viejos
--   siguen intactos.
-- - productos.imagenes: todas las fotos; imagen_url es la principal
--   (la primera) para no cambiar lo que ya lee la tienda.
-- - Cada producto nuevo nace con su fila de inventario en 0.
-- - Bucket público "productos" para las fotos; solo un admin sube,
--   cambia o borra.
-- ============================================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo   BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagenes TEXT[]  NOT NULL DEFAULT '{}';

-- Las fotos que ya existían pasan a la galería
UPDATE productos SET imagenes = ARRAY[imagen_url]
WHERE imagen_url IS NOT NULL AND imagen_url <> '' AND imagenes = '{}';

-- -------------------------------------------------------
-- Inventario automático para productos nuevos
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_inventario_producto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO inventario (producto_id, stock_actual)
  VALUES (NEW.id, 0)
  ON CONFLICT (producto_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION crear_inventario_producto() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_productos_inventario ON productos;
CREATE TRIGGER trg_productos_inventario
  AFTER INSERT ON productos
  FOR EACH ROW EXECUTE FUNCTION crear_inventario_producto();

-- -------------------------------------------------------
-- La tienda solo ve productos activos. Las columnas nuevas
-- van al final porque CREATE OR REPLACE VIEW no deja reordenar.
-- -------------------------------------------------------
CREATE OR REPLACE VIEW productos_con_stock AS
  SELECT
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
    c.id          AS coleccion_id,
    c.nombre      AS coleccion_nombre,
    c.filosofia   AS coleccion_filosofia,
    i.stock_actual,
    i.stock_minimo,
    i.actualizado_en AS stock_actualizado_en,
    CASE
      WHEN i.stock_actual = 0              THEN 'agotado'
      WHEN i.stock_actual <= i.stock_minimo THEN 'pocas'
      ELSE                                      'disponible'
    END AS estado_stock,
    p.imagenes
  FROM productos p
  LEFT JOIN inventario i ON i.producto_id = p.id
  INNER JOIN colecciones c ON c.id = p.coleccion_id
  WHERE c.activa = TRUE AND p.activo = TRUE
  ORDER BY p.destacado DESC, p.nombre ASC;

-- -------------------------------------------------------
-- El checkout rechaza productos ocultos (igual que en 04,
-- más la revisión de pr.activo)
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
-- FOTOS: bucket público, escritura solo para admins
-- -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('productos', 'productos', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "fotos_productos_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "fotos_productos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "fotos_productos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "fotos_productos_admin_delete" ON storage.objects;

CREATE POLICY "fotos_productos_admin_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin());
CREATE POLICY "fotos_productos_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos' AND public.es_admin());
CREATE POLICY "fotos_productos_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin())
  WITH CHECK (bucket_id = 'productos' AND public.es_admin());
CREATE POLICY "fotos_productos_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'productos' AND public.es_admin());
