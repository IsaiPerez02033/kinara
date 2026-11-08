-- ============================================================
-- 08_google_login.sql — Entrar con Google
-- Google manda el nombre como "full_name" o "name", no como "nombre"
-- (que es el que guarda el registro con correo). Sin esto, las cuentas
-- de Google quedarían con el nombre sacado del correo ("juan.perez").
-- Lo demás no cambia: Google ya entrega el correo confirmado, así que
-- vincular_mi_cuenta liga los pedidos de invitado igual que siempre.
-- ============================================================

BEGIN;

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

  v_nombre := left(COALESCE(
    NULLIF(trim(v_user.raw_user_meta_data->>'nombre'), ''),
    NULLIF(trim(v_user.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(v_user.raw_user_meta_data->>'name'), '')
  ), 120);

  INSERT INTO clientes (nombre, email, user_id)
  VALUES (COALESCE(v_nombre, split_part(v_user.email, '@', 1)), lower(v_user.email), v_uid)
  ON CONFLICT (email) DO UPDATE
    SET user_id = COALESCE(clientes.user_id, EXCLUDED.user_id);

  RETURN jsonb_build_object('vinculado', TRUE);
END;
$$;

COMMIT;
