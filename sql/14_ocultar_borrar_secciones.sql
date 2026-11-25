-- =======================================================
-- 14 — OCULTAR Y BORRAR SECCIONES DESDE EL PANEL
-- Ocultar una sección = activa FALSE (sus productos salen de la
-- tienda y no se pueden comprar, pero siguen en el admin).
-- Las colecciones del catálogo viejo quedan "archivadas" para que
-- el admin no las confunda con secciones ocultas.
-- Borrar se hace con DELETE normal (RLS es_admin); la llave de
-- productos es RESTRICT, así que solo se borra una sección vacía.
-- Requiere 13_secciones.sql. Se puede correr más de una vez.
-- =======================================================

ALTER TABLE colecciones ADD COLUMN IF NOT EXISTS archivada BOOLEAN NOT NULL DEFAULT FALSE;

-- Hoy las únicas apagadas son las del catálogo viejo (Zen, Min, Nova…)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM colecciones WHERE archivada) THEN
    UPDATE colecciones SET archivada = TRUE WHERE NOT activa;
  END IF;
END $$;

-- crear_seccion ya no revive colecciones archivadas
CREATE OR REPLACE FUNCTION crear_seccion(p_nombre TEXT, p_descripcion TEXT DEFAULT NULL, p_color TEXT DEFAULT NULL)
RETURNS colecciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_desc   TEXT := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_orden  INT;
  v_fila   colecciones;
BEGIN
  IF NOT es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede crear secciones' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_nombre) < 2 OR char_length(v_nombre) > 40 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 2 y 40 letras' USING ERRCODE = '22023';
  END IF;
  IF v_desc IS NOT NULL AND char_length(v_desc) > 120 THEN
    RAISE EXCEPTION 'La descripción es de máximo 120 letras' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM colecciones WHERE activa AND lower(btrim(nombre)) = lower(v_nombre)) THEN
    RAISE EXCEPTION 'Ya existe una sección llamada %', v_nombre USING ERRCODE = '23505';
  END IF;

  SELECT coalesce(max(orden), 0) + 1 INTO v_orden FROM colecciones WHERE activa;

  UPDATE colecciones
     SET activa = TRUE, orden = v_orden,
         descripcion = coalesce(v_desc, descripcion),
         color = coalesce(p_color, color)
   WHERE id = (SELECT id FROM colecciones
                WHERE NOT activa AND NOT archivada AND lower(btrim(nombre)) = lower(v_nombre)
                ORDER BY created_at DESC LIMIT 1)
  RETURNING * INTO v_fila;

  IF v_fila.id IS NULL THEN
    INSERT INTO colecciones (nombre, filosofia, descripcion, color, orden, activa)
    VALUES (v_nombre, '', v_desc, p_color, v_orden, TRUE)
    RETURNING * INTO v_fila;
  END IF;

  RETURN v_fila;
END;
$$;

REVOKE ALL ON FUNCTION crear_seccion(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crear_seccion(TEXT, TEXT, TEXT) TO authenticated;
