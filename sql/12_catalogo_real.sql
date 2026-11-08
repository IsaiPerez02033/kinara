-- =========================================================
-- 12 · Catálogo real: primeros 8 productos
-- - Oculta los productos de ejemplo (22222222-… y 44444444-…)
--   sin borrarlos, para no romper pedidos viejos.
-- - Da de alta los productos reales con fotos, medidas y precio.
-- - Deja 10 piezas de stock en cada uno (se ajusta en el panel).
-- Se puede correr más de una vez.
-- =========================================================

BEGIN;

-- 1. Ocultar los productos de ejemplo
UPDATE productos
SET activo = FALSE, destacado = FALSE, nuevo = FALSE, updated_at = NOW()
WHERE id::text LIKE '22222222-%' OR id::text LIKE '44444444-%';

-- 2. Productos reales
INSERT INTO productos
  (id, coleccion_id, nombre, descripcion, precio, imagen_url, imagenes,
   materiales, dimensiones, acabado, destacado, nuevo, tags, activo)
VALUES
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000001',
   'Lámpara Asanoha',
   'Lámpara de mesa con celosía asanoha, el patrón japonés de hojas de cáñamo. Encendida proyecta una trama de luz cálida y suave; apagada se ve como una pieza tallada. Incluye base y luz LED de bajo consumo con cable USB.',
   749, '/assets/productos/asanoha_alta_dia.webp',
   ARRAY['/assets/productos/asanoha_alta_dia.webp', '/assets/productos/asanoha_alta_noche.webp'],
   ARRAY['PLA mate', 'Luz LED USB'], '10 × 10 × 19 cm', 'Beige con base negra',
   TRUE, TRUE, ARRAY['lampara', 'decoracion', 'japones', 'regalo'], TRUE),

  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001',
   'Lámpara Montaña',
   'Un paisaje de montañas en capas dentro de un marco. Con la luz encendida, cada cordillera se ilumina con un tono distinto y crea profundidad. Pieza decorativa para escritorio, buró o repisa.',
   899, '/assets/productos/lampara_montana_noche.webp',
   ARRAY['/assets/productos/lampara_montana_noche.webp', '/assets/productos/lampara_montana_dia.webp'],
   ARRAY['PLA mate', 'Luz LED USB'], '14 × 8 × 18 cm', 'Marco negro, capas en tonos marfil',
   TRUE, TRUE, ARRAY['lampara', 'decoracion', 'paisaje', 'regalo'], TRUE),

  ('55555555-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002',
   'Organizador de escritorio modular',
   'Organizador con contenedores que se quitan y se reacomodan: plumas, tijeras, cargadores y todo lo que traigas en el escritorio. Estructura abierta de diseño moderno, con contenedores intercambiables.',
   649, '/assets/productos/organizador.webp',
   ARRAY['/assets/productos/organizador.webp'],
   ARRAY['PLA'], '19 × 19 × 18 cm', 'Blanco con contenedores naranja',
   FALSE, TRUE, ARRAY['escritorio', 'oficina', 'organizador'], TRUE),

  ('55555555-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002',
   'Soporte para audífonos',
   'Soporte de escritorio para audífonos de diadema con frente de panal. Base estable, sin armado complicado. Mantiene tus audífonos a la mano y el escritorio en orden.',
   349, '/assets/productos/soporte_audifonos.webp',
   ARRAY['/assets/productos/soporte_audifonos.webp'],
   ARRAY['PLA'], '9 × 15 × 24 cm', 'Negro con panal gris',
   FALSE, TRUE, ARRAY['escritorio', 'gamer', 'audifonos'], TRUE),

  ('55555555-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000001',
   'Lámpara Agujero Negro',
   'Lámpara inspirada en un agujero negro: una esfera negra rodeada por un disco de luz que se curva a su alrededor, como en las imágenes del espacio. Encendida, el anillo brilla con luz cálida. Pieza de colección para escritorio o repisa.',
   799, '/assets/productos/agujero_negro_dia.webp',
   ARRAY['/assets/productos/agujero_negro_dia.webp', '/assets/productos/agujero_negro_noche.webp'],
   ARRAY['PLA mate', 'Luz LED USB'], '22 × 22 × 18 cm', 'Blanco con esfera negra',
   TRUE, TRUE, ARRAY['lampara', 'espacio', 'decoracion', 'regalo'], TRUE),

  ('55555555-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003',
   'Molde para maceta de concreto',
   'Kit de molde para hacer tus propias macetas de concreto o cemento: molde exterior, molde interior y plato para el agua. Se arma, se vacía la mezcla y en 24 horas se desmolda. Reutilizable.',
   549, '/assets/productos/molde_maceta.webp',
   ARRAY['/assets/productos/molde_maceta.webp'],
   ARRAY['PLA'], 'Maceta de 10 × 10 × 10 cm', 'Gris y beige',
   FALSE, TRUE, ARRAY['molde', 'concreto', 'maceta', 'manualidades'], TRUE),

  ('55555555-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000005',
   'Mascota pixel de escritorio',
   'Mascota pixelada sentada en su silla con su laptop. Un compañero para el escritorio de quien programa o trabaja frente a la computadora. Se arma en segundos.',
   199, '/assets/productos/clawd.webp',
   ARRAY['/assets/productos/clawd.webp'],
   ARRAY['PLA'], '5 × 5 × 4.5 cm', 'Naranja, silla negra y laptop gris',
   FALSE, TRUE, ARRAY['figura', 'escritorio', 'programador', 'regalo'], TRUE),

  ('55555555-0000-0000-0000-000000000008', '33333333-0000-0000-0000-000000000005',
   'Llavero mascota pixel',
   'Llavero de mascota pixelada con ojos en contraste. Ligero y resistente, ideal para llaves, mochila o como detalle para regalar.',
   89, '/assets/productos/llaveros.webp',
   ARRAY['/assets/productos/llaveros.webp'],
   ARRAY['PLA'], '4 × 5 × 1.2 cm', 'Naranja, beige o gris con ojos negros',
   FALSE, TRUE, ARRAY['llavero', 'regalo', 'pixel'], TRUE)
ON CONFLICT (id) DO UPDATE SET
  coleccion_id = EXCLUDED.coleccion_id,
  nombre       = EXCLUDED.nombre,
  descripcion  = EXCLUDED.descripcion,
  precio       = EXCLUDED.precio,
  imagen_url   = EXCLUDED.imagen_url,
  imagenes     = EXCLUDED.imagenes,
  materiales   = EXCLUDED.materiales,
  dimensiones  = EXCLUDED.dimensiones,
  acabado      = EXCLUDED.acabado,
  destacado    = EXCLUDED.destacado,
  nuevo        = EXCLUDED.nuevo,
  tags         = EXCLUDED.tags,
  activo       = TRUE,
  updated_at   = NOW();

-- 3. Stock inicial (el disparador crea la fila en 0 al insertar)
INSERT INTO inventario (producto_id, stock_actual, stock_minimo)
SELECT id, 10, 2 FROM productos WHERE id::text LIKE '55555555-%'
ON CONFLICT (producto_id) DO UPDATE SET stock_actual = GREATEST(inventario.stock_actual, 10), stock_minimo = 2;

COMMIT;

-- Revisión: deben salir solo los 8 productos reales
SELECT p.nombre, p.precio, p.dimensiones, i.stock_actual
FROM productos p JOIN inventario i ON i.producto_id = p.id
WHERE p.activo
ORDER BY p.destacado DESC, p.nombre;
