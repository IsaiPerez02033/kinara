-- ============================================================
-- 02_seed.sql — Datos iniciales de Kinara
-- Inserto aquí las 5 colecciones, los 12 productos del
-- catálogo y sus registros de inventario correspondientes.
-- Ejecuto este archivo DESPUÉS de 01_schema.sql.
-- ============================================================

-- -------------------------------------------------------
-- COLECCIONES — Las 5 líneas de diseño de Kinara
-- -------------------------------------------------------
INSERT INTO colecciones (id, nombre, filosofia, descripcion, activa) VALUES

  -- Guardo los IDs como constantes para referenciarlos en productos
  ('11111111-0000-0000-0000-000000000001',
   'Kinara Zen',
   'Minimalismo japonés',
   'Inspirada en los principios del diseño japonés: sobriedad como elegancia suprema, ausencia de lo superfluo y búsqueda del equilibrio perfecto entre la forma y el vacío.',
   TRUE),

  ('11111111-0000-0000-0000-000000000002',
   'Kinara Min',
   'Diseño moderno y geométrico',
   'Explora el lenguaje de las formas geométricas puras: ángulos precisos, superficies planas y estructuras que celebran la lógica de la geometría y la arquitectura contemporánea.',
   TRUE),

  ('11111111-0000-0000-0000-000000000003',
   'Kinara Nova',
   'Estilo futurista e innovador',
   'Inspirada en la ciencia ficción y la exploración espacial. Formas inesperadas y efectos lumínicos que desafían las convenciones del diseño de iluminación.',
   TRUE),

  ('11111111-0000-0000-0000-000000000004',
   'Kinara Aura',
   'Formas orgánicas y luz ambiental',
   'Formas fluidas, curvas y asimétricas evocando conchas, raíces y nubes. La luz se difunde suavemente creando halos luminosos y ambientes cálidos y acogedores.',
   TRUE),

  ('11111111-0000-0000-0000-000000000005',
   'Kinara Raíz',
   'Inspiración en la cultura mexicana',
   'Homenaje explícito al origen mexicano de la marca. Nutre del rico acervo de patrones, texturas y formas de las culturas prehispánicas y populares de México.',
   TRUE);

-- -------------------------------------------------------
-- PRODUCTOS — Los 12 productos del catálogo inicial
-- Uso UUIDs predecibles para facilitar el desarrollo.
-- -------------------------------------------------------
INSERT INTO productos
  (id, coleccion_id, nombre, descripcion, precio, materiales, dimensiones, acabado, destacado, nuevo, tags)
VALUES

  -- === COLECCIÓN ZEN ===

  ('22222222-0001-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Wabi',
   'Lámpara de piso inspirada en la imperfección japonesa. Formas suaves que proyectan una luz cálida y envolvente, perfecta para espacios de meditación.',
   4800.00,
   ARRAY['PLA Matte', 'Bambú'],
   '35cm × 35cm × 120cm',
   'Blanco hueso mate',
   TRUE,   -- destacado
   FALSE,  -- no es nuevo
   ARRAY['minimalismo', 'piso', 'cálida']),

  ('22222222-0002-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Ma',
   'Lámpara de mesa que celebra el espacio vacío. Su forma geométrica simple genera sombras perfectas que se convierten en parte del diseño.',
   2400.00,
   ARRAY['Resina traslúcida'],
   '20cm × 20cm × 35cm',
   'Traslúcido ámbar',
   FALSE,
   TRUE,   -- nuevo
   ARRAY['minimalismo', 'mesa', 'geométrica']),

  ('22222222-0003-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Shizen',
   'Aplique mural de formas orgánicas que evoca la naturaleza japonesa. La luz se filtra a través de capas superpuestas creando profundidad.',
   3200.00,
   ARRAY['PLA Biodegradable'],
   '40cm × 8cm × 25cm',
   'Blanco natural',
   FALSE,
   FALSE,
   ARRAY['minimalismo', 'mural', 'capas']),

  -- === COLECCIÓN MIN ===

  ('22222222-0004-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000002',
   'Axis',
   'Lámpara de techo con geometría pura. Sus aristas precisas proyectan patrones de luz y sombra que dialogan con la arquitectura contemporánea.',
   5600.00,
   ARRAY['ABS Negro', 'Aluminio'],
   '60cm × 60cm × 15cm',
   'Negro mate industrial',
   TRUE,
   FALSE,
   ARRAY['geométrico', 'techo', 'arquitectónico']),

  ('22222222-0005-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000002',
   'Vertex',
   'Lámpara de escritorio minimalista que reduce la forma al mínimo esencial. Un ángulo, una luz, un propósito.',
   1800.00,
   ARRAY['Acero inoxidable', 'PLA'],
   '15cm × 15cm × 45cm',
   'Cromo mate',
   FALSE,
   TRUE,
   ARRAY['geométrico', 'escritorio', 'funcional']),

  ('22222222-0006-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000002',
   'Plano',
   'Panel luminoso de pared que aporta claridad uniforme sin elementos decorativos. La elegancia del rectángulo perfecto.',
   3800.00,
   ARRAY['Acrílico difusor', 'Aluminio'],
   '80cm × 30cm × 4cm',
   'Blanco óptico',
   FALSE,
   FALSE,
   ARRAY['geométrico', 'mural', 'uniforme']),

  -- === COLECCIÓN NOVA ===

  ('22222222-0007-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000003',
   'Pulsar',
   'Lámpara suspendida de diseño futurista. Sus capas concéntricas generan un efecto óptico de profundidad que transforma el espacio.',
   7200.00,
   ARRAY['PETG Translúcido', 'LED integrado'],
   '50cm × 50cm × 30cm',
   'Translúcido iridiscente',
   TRUE,
   TRUE,
   ARRAY['futurista', 'suspensión', 'óptico']),

  ('22222222-0008-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000003',
   'Quasar',
   'Escultura luminosa de piso. Inspirada en la energía de los quásares, proyecta patrones de luz en movimiento sobre las paredes.',
   9500.00,
   ARRAY['TPU Flexible', 'Cobre'],
   '45cm × 45cm × 180cm',
   'Cobre espejado',
   TRUE,
   FALSE,
   ARRAY['futurista', 'piso', 'escultura']),

  -- === COLECCIÓN AURA ===

  ('22222222-0009-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000004',
   'Nimbo',
   'Lámpara colgante de forma orgánica inspirada en las nubes. La luz se difunde suavemente envolviendo el espacio en una atmósfera íntima.',
   4200.00,
   ARRAY['PLA Orgánico', 'Fibra de coco'],
   '65cm × 45cm × 35cm',
   'Blanco nube',
   FALSE,
   FALSE,
   ARRAY['orgánico', 'suspensión', 'íntima']),

  ('22222222-0010-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000004',
   'Coral',
   'Aplique inspirado en formaciones coralinas submarinas. Cada pieza es única gracias al proceso generativo de diseño.',
   3600.00,
   ARRAY['Resina biológica'],
   '35cm × 20cm × 40cm',
   'Arena rosada',
   FALSE,
   TRUE,
   ARRAY['orgánico', 'mural', 'único']),

  -- === COLECCIÓN RAÍZ ===

  ('22222222-0011-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000005',
   'Greca',
   'Lámpara de mesa con patrones de grecas zapotecas. La luz se filtra a través del diseño tradicional creando constelaciones en las paredes.',
   3100.00,
   ARRAY['PLA Terracota'],
   '25cm × 25cm × 40cm',
   'Terracota viejo',
   FALSE,
   FALSE,
   ARRAY['mexicano', 'mesa', 'patrón']),

  ('22222222-0012-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000005',
   'K''in',
   'Lámpara mural con el símbolo maya del sol. El nombre de la marca cobra forma: K''in, donde la luz cobra vida en cada amanecer.',
   4500.00,
   ARRAY['PLA Dorado', 'Madera tzalam'],
   '50cm × 8cm × 50cm',
   'Dorado prehispánico',
   TRUE,
   FALSE,
   ARRAY['mexicano', 'mural', 'símbolo']);

-- -------------------------------------------------------
-- INVENTARIO — Un registro por cada producto
-- Configuro el stock inicial de cada luminaria.
-- stock_minimo = 3 en todos (regla de negocio de Kinara)
-- -------------------------------------------------------
INSERT INTO inventario (producto_id, stock_actual, stock_minimo, stock_maximo) VALUES

  -- Zen: Wabi — stock normal
  ('22222222-0001-0000-0000-000000000001', 7,  3, 20),

  -- Zen: Ma — stock crítico (≤ stock_minimo → badge dorado)
  ('22222222-0002-0000-0000-000000000001', 3,  3, 15),

  -- Zen: Shizen — agotado
  ('22222222-0003-0000-0000-000000000001', 0,  3, 15),

  -- Min: Axis — stock amplio
  ('22222222-0004-0000-0000-000000000002', 12, 3, 30),

  -- Min: Vertex — stock crítico (solo 2 piezas)
  ('22222222-0005-0000-0000-000000000002', 2,  3, 10),

  -- Min: Plano — stock normal
  ('22222222-0006-0000-0000-000000000002', 8,  3, 25),

  -- Nova: Pulsar — stock normal
  ('22222222-0007-0000-0000-000000000003', 5,  3, 15),

  -- Nova: Quasar — pieza exclusiva, solo 1 disponible
  ('22222222-0008-0000-0000-000000000003', 1,  3, 5),

  -- Aura: Nimbo — stock normal
  ('22222222-0009-0000-0000-000000000004', 9,  3, 20),

  -- Aura: Coral — stock normal
  ('22222222-0010-0000-0000-000000000004', 4,  3, 15),

  -- Raíz: Greca — stock amplio
  ('22222222-0011-0000-0000-000000000005', 15, 3, 40),

  -- Raíz: K'in — stock normal
  ('22222222-0012-0000-0000-000000000005', 6,  3, 20);

-- ============================================================
-- FIN DEL SEED
-- Ya tienes todas las tablas con datos.
-- Ahora configura las variables de entorno en js/lib/supabase.js
-- ============================================================
