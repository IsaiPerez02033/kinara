-- ============================================================
-- 05_catalogo_impresion_3d.sql — Kinara pasa a impresión 3D general
-- Ejecuto este archivo DESPUÉS de 04_seguridad_checkout.sql.
-- Se puede ejecutar más de una vez sin duplicar datos.
--
-- Uso la tabla colecciones como categorías del catálogo.
-- Las colecciones de luminarias quedan inactivas, no se borran,
-- porque los pedidos anteriores siguen apuntando a sus productos.
--
-- PROVISIONAL: precios, medidas, materiales y stock de los productos
-- nuevos son de ejemplo. Hay que confirmarlos antes de lanzar.
-- ============================================================

BEGIN;

-- -------------------------------------------------------
-- CATEGORÍAS
-- -------------------------------------------------------
INSERT INTO colecciones (id, nombre, filosofia, descripcion, activa) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Lámparas',
   'Luz con forma propia',
   'Lámparas impresas en 3D para mesa, pared y techo.', TRUE),
  ('33333333-0000-0000-0000-000000000002', 'Herramientas',
   'Piezas para trabajar',
   'Organizadores, soportes y guías para el taller o la oficina.', TRUE),
  ('33333333-0000-0000-0000-000000000003', 'Moldes',
   'La forma para producir más',
   'Moldes y matrices para jabón, concreto, silicón y otros materiales.', TRUE),
  ('33333333-0000-0000-0000-000000000004', 'Juguetes',
   'Piezas para jugar',
   'Juguetes articulados y rompecabezas impresos en 3D.', TRUE),
  ('33333333-0000-0000-0000-000000000005', 'Figuras',
   'Para coleccionar y regalar',
   'Figuras decorativas y de colección.', TRUE)
ON CONFLICT (id) DO UPDATE SET
  nombre = EXCLUDED.nombre, filosofia = EXCLUDED.filosofia,
  descripcion = EXCLUDED.descripcion, activa = TRUE;

-- -------------------------------------------------------
-- LÁMPARAS QUE SIGUEN A LA VENTA
-- Conservo las que son principalmente piezas impresas.
-- Las demás quedan fuera del sitio al desactivar su colección.
-- -------------------------------------------------------
UPDATE productos SET coleccion_id = '33333333-0000-0000-0000-000000000001'
WHERE id IN (
  '22222222-0002-0000-0000-000000000001',  -- Ma
  '22222222-0007-0000-0000-000000000003',  -- Pulsar
  '22222222-0009-0000-0000-000000000004',  -- Nimbo
  '22222222-0011-0000-0000-000000000005',  -- Greca
  '22222222-0012-0000-0000-000000000005'   -- K'in
);

-- La descripción anterior de K'in hablaba de la marca como luz
UPDATE productos
SET descripcion = 'Lámpara mural con el símbolo maya del sol. La luz se filtra por el diseño impreso y dibuja sus rayos sobre la pared.'
WHERE id = '22222222-0012-0000-0000-000000000005';

UPDATE colecciones SET activa = FALSE
WHERE id IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004',
  '11111111-0000-0000-0000-000000000005'
);

-- -------------------------------------------------------
-- PRODUCTOS NUEVOS
-- -------------------------------------------------------
INSERT INTO productos
  (id, coleccion_id, nombre, descripcion, precio, materiales, dimensiones, acabado, destacado, nuevo, tags)
VALUES
  ('44444444-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000002',
   'Organizador de brocas',
   'Base con perforaciones numeradas para tener tus brocas ordenadas y a la mano.',
   280.00, ARRAY['PETG'], '18cm × 8cm × 4cm', 'Negro mate', TRUE, TRUE,
   ARRAY['taller', 'organización']),
  ('44444444-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002',
   'Soporte de pared para herramientas',
   'Soporte modular para colgar pinzas, desarmadores y llaves en el taller.',
   220.00, ARRAY['PETG'], '15cm × 6cm × 5cm', 'Gris grafito', FALSE, FALSE,
   ARRAY['taller', 'pared']),
  ('44444444-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002',
   'Escuadra de ensamble a 90°',
   'Mantiene las piezas a escuadra mientras atornillas o pegas. Se vende por par.',
   190.00, ARRAY['PETG'], '10cm × 10cm × 3cm', 'Naranja', FALSE, TRUE,
   ARRAY['carpintería', 'ensamble']),

  ('44444444-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000003',
   'Molde para jabón artesanal',
   'Molde rígido de seis cavidades para producir barras de jabón. No es apto para alimentos.',
   350.00, ARRAY['PETG'], '24cm × 16cm × 4cm', 'Natural', FALSE, TRUE,
   ARRAY['jabón', 'producción']),
  ('44444444-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000003',
   'Molde para maceta de concreto',
   'Molde de dos partes para colar macetas geométricas de concreto.',
   480.00, ARRAY['PETG'], '14cm × 14cm × 12cm', 'Natural', TRUE, FALSE,
   ARRAY['concreto', 'macetas']),
  ('44444444-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003',
   'Matriz para molde de silicón',
   'Pieza maestra de superficie lisa para sacar tus propios moldes de silicón.',
   420.00, ARRAY['Resina'], '10cm × 10cm × 6cm', 'Gris liso', FALSE, FALSE,
   ARRAY['silicón', 'matriz']),

  ('44444444-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000004',
   'Dragón articulado',
   'Dragón de cuerpo flexible que se imprime ya armado. Contiene piezas pequeñas: no apto para menores de 3 años.',
   320.00, ARRAY['PLA'], '30cm × 12cm × 4cm', 'Bicolor', TRUE, TRUE,
   ARRAY['articulado', 'regalo']),
  ('44444444-0000-0000-0000-000000000008', '33333333-0000-0000-0000-000000000004',
   'Rompecabezas de engranes',
   'Cubo de engranes que giran entre sí y se arma pieza por pieza. Contiene piezas pequeñas: no apto para menores de 3 años.',
   290.00, ARRAY['PLA'], '8cm × 8cm × 8cm', 'Multicolor', FALSE, FALSE,
   ARRAY['rompecabezas', 'mecánico']),

  ('44444444-0000-0000-0000-000000000009', '33333333-0000-0000-0000-000000000005',
   'Ajolote de escritorio',
   'Figura decorativa de ajolote, pintada a mano, para tu escritorio o repisa.',
   380.00, ARRAY['Resina'], '12cm × 8cm × 7cm', 'Rosa pintado a mano', TRUE, TRUE,
   ARRAY['méxico', 'decoración']),
  ('44444444-0000-0000-0000-000000000010', '33333333-0000-0000-0000-000000000005',
   'Alebrije de colección',
   'Figura inspirada en los alebrijes mexicanos, con detalles pintados a mano.',
   650.00, ARRAY['Resina'], '15cm × 10cm × 14cm', 'Multicolor pintado a mano', FALSE, FALSE,
   ARRAY['méxico', 'colección'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventario (producto_id, stock_actual, stock_minimo, stock_maximo)
SELECT id, 10, 3, 30
FROM productos
WHERE id::TEXT LIKE '44444444-%'
ON CONFLICT (producto_id) DO NOTHING;

-- -------------------------------------------------------
-- TIPOS DE CONSULTA DEL FORMULARIO
-- 'personalizado' y 'arquitecto' siguen permitidos por los
-- mensajes que ya existan.
-- -------------------------------------------------------
ALTER TABLE contactos DROP CONSTRAINT IF EXISTS contactos_tipo_consulta_check;
ALTER TABLE contactos ADD CONSTRAINT contactos_tipo_consulta_check
  CHECK (tipo_consulta IN (
    'producto', 'figura', 'a_medida', 'volumen',
    'personalizado', 'arquitecto', 'otro'
  ));

COMMENT ON TABLE colecciones IS 'Categorías del catálogo de impresión 3D. Las inactivas no se muestran ni se venden.';
COMMENT ON TABLE productos   IS 'Catálogo de productos impresos en 3D de Kinara.';

COMMIT;
