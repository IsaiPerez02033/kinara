-- ============================================================
-- 06_cuentas_clientes.sql — Cuentas de cliente (Fase 1)
-- Ejecuto este archivo DESPUÉS de 05_catalogo_impresion_3d.sql.
--
-- 1. Cada cuenta de Supabase Auth se liga a una fila de clientes.
-- 2. Los pedidos hechos como invitado con el mismo correo
--    aparecen en la cuenta, pero solo con el correo confirmado.
-- 3. Direcciones guardadas, una predeterminada por cuenta.
-- 4. El cliente lee sus datos solo por funciones: nunca tiene
--    acceso directo a las tablas de clientes ni de pedidos.
-- ============================================================

BEGIN;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN clientes.user_id IS 'Cuenta de Supabase Auth dueña de este cliente (NULL = invitado).';

-- -------------------------------------------------------
-- DIRECCIONES GUARDADAS
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS direcciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  etiqueta       TEXT CHECK (char_length(etiqueta) <= 40),
  calle          TEXT NOT NULL CHECK (char_length(calle) BETWEEN 10 AND 300),
  ciudad         TEXT NOT NULL CHECK (char_length(ciudad) BETWEEN 2 AND 100),
  estado         TEXT NOT NULL CHECK (char_length(estado) BETWEEN 2 AND 60),
  cp             TEXT NOT NULL CHECK (cp ~ '^\d{5}$'),
  predeterminada BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS direcciones_user_idx ON direcciones (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS direcciones_una_predeterminada
  ON direcciones (user_id) WHERE predeterminada;

ALTER TABLE direcciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "direcciones_propias" ON direcciones;
CREATE POLICY "direcciones_propias" ON direcciones
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "direcciones_es_admin" ON direcciones;
CREATE POLICY "direcciones_es_admin" ON direcciones
  FOR SELECT TO authenticated
  USING (es_admin());

-- Máximo 10 direcciones por cuenta
CREATE OR REPLACE FUNCTION limitar_direcciones()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM direcciones WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Puedes guardar hasta 10 direcciones';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS direcciones_limite ON direcciones;
CREATE TRIGGER direcciones_limite
  BEFORE INSERT ON direcciones
  FOR EACH ROW EXECUTE FUNCTION limitar_direcciones();

-- -------------------------------------------------------
-- FUNCIÓN: vincular_mi_cuenta
-- La llamo cada vez que el cliente entra. Liga (o crea) su fila
-- de clientes y con ella todos sus pedidos de invitado.
-- Sin correo confirmado no liga nada: así nadie ve pedidos
-- ajenos registrándose con un correo que no es suyo.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION vincular_mi_cuenta()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_user   RECORD;
  v_nombre TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sin sesión';
  END IF;

  SELECT email, email_confirmed_at, raw_user_meta_data
  INTO v_user
  FROM auth.users WHERE id = v_uid;

  IF v_user.email_confirmed_at IS NULL THEN
    RETURN jsonb_build_object('vinculado', FALSE);
  END IF;

  -- Si la cuenta cambió de correo, suelto la fila del correo anterior
  UPDATE clientes SET user_id = NULL
  WHERE user_id = v_uid AND email <> lower(v_user.email);

  v_nombre := NULLIF(trim(v_user.raw_user_meta_data->>'nombre'), '');

  INSERT INTO clientes (nombre, email, user_id)
  VALUES (COALESCE(v_nombre, split_part(v_user.email, '@', 1)), lower(v_user.email), v_uid)
  ON CONFLICT (email) DO UPDATE
    SET user_id = COALESCE(clientes.user_id, EXCLUDED.user_id);

  RETURN jsonb_build_object('vinculado', TRUE);
END;
$$;

-- -------------------------------------------------------
-- FUNCIÓN: mi_perfil
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION mi_perfil()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'nombre',       c.nombre,
    'email',        c.email,
    'telefono',     c.telefono,
    'cliente_desde', c.created_at,
    'total_pagado', COALESCE((
      SELECT sum(p.total) FROM pedidos p
      WHERE p.cliente_id = c.id
        AND p.estado IN ('pagado', 'en_produccion', 'enviado', 'entregado')
    ), 0)
  )
  FROM clientes c
  WHERE c.user_id = auth.uid();
$$;

-- -------------------------------------------------------
-- FUNCIÓN: actualizar_mi_perfil
-- Solo nombre y teléfono; el correo lo maneja Supabase Auth.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_mi_perfil(p_nombre TEXT, p_telefono TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(trim(COALESCE(p_nombre, ''))) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Escribe tu nombre completo';
  END IF;
  IF p_telefono IS NOT NULL AND p_telefono <> ''
     AND length(regexp_replace(p_telefono, '\D', '', 'g')) NOT BETWEEN 10 AND 15 THEN
    RAISE EXCEPTION 'El teléfono debe tener al menos 10 dígitos';
  END IF;

  UPDATE clientes
  SET nombre = trim(p_nombre), telefono = NULLIF(trim(p_telefono), '')
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tu cuenta aún no está lista. Confirma tu correo e intenta de nuevo.';
  END IF;
END;
$$;

-- -------------------------------------------------------
-- FUNCIÓN: mis_pedidos
-- Pedidos de la cuenta, con sus piezas. Los pendientes de pago
-- solo se muestran las primeras 48 horas (luego son carritos
-- abandonados que solo estorban).
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
        'id',         p.id,
        'estado',     p.estado,
        'total',      p.total,
        'creado',     p.created_at,
        'actualizado', p.updated_at,
        'direccion',  p.direccion_envio,
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

REVOKE ALL ON FUNCTION vincular_mi_cuenta()                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mi_perfil()                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION actualizar_mi_perfil(TEXT, TEXT)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION mis_pedidos()                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION limitar_direcciones()                FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION vincular_mi_cuenta()              TO authenticated;
GRANT EXECUTE ON FUNCTION mi_perfil()                       TO authenticated;
GRANT EXECUTE ON FUNCTION actualizar_mi_perfil(TEXT, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION mis_pedidos()                     TO authenticated;

REVOKE ALL ON TABLE direcciones FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE direcciones TO authenticated;
GRANT ALL ON TABLE direcciones TO service_role;

COMMIT;
