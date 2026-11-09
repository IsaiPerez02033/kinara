# Nuevo producto desde un .stl: instrucciones para Claude Code

Este documento es para la sesión de Claude Code que trabaja en el repo de Kinara.
Cuando Aram te pase un `.stl` (o `.3mf`), tú haces el render, lo subes a la tienda
y le dejas listo un paquete para que **Claude Cowork** actualice el catálogo PDF.

Rutas (todas bajo `~/Desktop/Xolum/Kinara/`):

| Ruta | Qué es |
|---|---|
| `kinara/` | Repo git (remoto IsaiPerez02033/kinara). |
| `kinara/kinara_completo/` | La tienda. Vercel publica `main` en kinaramx.com. |
| `kinara/sql/` | Migraciones. Aram las corre a mano en Supabase. |
| `kinara/herramientas/render/` | Estudio de render en Blender (`estudio.py`) y utilidades. |
| `modelos/` | Archivos 3D originales (`.3mf`, `.stl`) y `obj/` convertidos. |
| `fotos/` | Fotos finales en JPG (originales del catálogo). |
| `catalogo/` | Catálogo PDF que mantiene Cowork. Tú solo escribes en `catalogo/nuevos/`. |

---

## 1. Lo que Aram te pasa

Como mínimo, el archivo `.stl`. Lo ideal es que venga con esta ficha (pídele lo que falte, **en una sola pregunta**):

```
Archivo:      ~/Downloads/lampara_luna.stl   (uno o varios .stl, o un .3mf)
Nombre:       Lámpara Luna
Categoría:    Lámparas | Herramientas | Moldes | Juguetes | Figuras
Precio:       $699
Colores:      pieza principal blanco; base negra   (color de cada .stl si son varios)
Material:     PLA mate + luz LED USB
Medidas:      (opcional, las mido del modelo)
Descripción:  (opcional, la redacto yo)
Fotos:        día / noche (solo lámparas)  ·  escena: escritorio, repisa…
Diseño:       propio, o de quién es y con qué licencia
```

Si no te da precio, no lo inventes: pregunta. Si el diseño es de un tercero, confirma que tiene
licencia comercial (ver `productos-nuevos.md`: hay modelos descartados por licencia "no comercial"
o por ser marca ajena). No uses marcas ajenas en nombres ni textos (nada de "Funko").

## 2. Preparar el modelo

1. Copia el archivo a `modelos/` con un nombre en minúsculas y sin acentos (`lampara_luna.stl`).
2. Si es `.3mf` (Bambu Studio), conviértelo a un `.obj` por pieza:
   `python3 -I kinara/herramientas/render/tmf2obj.py modelos/x.3mf modelos/obj/x`
3. Un `.stl` entra directo: `estudio.py` acepta `.stl` y `.obj` (unidades en mm).
4. Revisa las medidas reales: `estudio.py` imprime al final `LISTO <salida> [x, y, z]` en mm.
   Esas son las medidas del producto (redondea a cm con un decimal: `12 × 12 × 14 cm`).

## 3. Render

Usa `kinara/herramientas/render/estudio.py` con Blender en segundo plano (Cycles):

```bash
blender -b -P kinara/herramientas/render/estudio.py -- config.json
```

Parte de un ejemplo de `herramientas/render/ejemplos/` y cambia `RENDERS` por la carpeta
`renders/` de tu scratchpad. Claves principales del `config.json`:

| Clave | Qué hace |
|---|---|
| `piezas[]` | `archivo`, `nombre`, `color` (hex), `pos` [x,y,z] en mm. Opcionales: `rot` [°], `alinear` (`"delgado"`, `"largo"`, `"disco"`), `sss`. |
| `azimut`, `elevacion`, `distancia` | Cámara. Buen inicio: -28, 14, 3.5. |
| `lente`, `fstop`, `mira` | Lente (mm), desenfoque y altura del punto de mira (0 a 1). |
| `modo` | `"noche"` para fotos con la lámpara encendida (más `luz_interior`). |
| `pared` | Color de la pared de fondo. Las fotos actuales usan el de serie. |
| `extras[]` | Utilería: `taza`, `libros`, `esfera`. |
| `rapido`, `muestras`, `px` | Pruebas con `"rapido": true`, 16 muestras y 500 px. Final: `false`, 160 a 200 muestras, 1200 px. |

Proceso:
1. Render rápido de prueba. Míralo (Read de la imagen) y ajusta cámara, colores y posición.
2. Render final.
3. Lámparas: dos fotos, `_dia` (apagada) y `_noche` (encendida). Lo demás: una foto.
4. Que se parezca a las fotos actuales: pieza centrada, mesa de madera, fondo desenfocado, luz suave.
   Compara con `fotos/organizador.jpg` o `fotos/asanoha_alta_dia.jpg`.

Convierte cada render en las fotos finales (cuadradas, 1000×1000):

```bash
python3 kinara/herramientas/render/foto_producto.py <render.png> lampara_luna_dia
```

Esto crea `kinara_completo/assets/productos/lampara_luna_dia.webp` (tienda) y
`fotos/lampara_luna_dia.jpg` (catálogo).

## 4. Darlo de alta en la tienda

1. Crea `sql/NN_producto_<slug>.sql`, donde NN es el número siguiente en `sql/`. Copia el
   patrón de `sql/12_catalogo_real.sql`:
   - `id`: el siguiente de la serie `55555555-0000-0000-0000-0000000000NN`. Revisa los
     que ya existen en los SQL y en la API (`productos_con_stock`).
   - `coleccion_id` de la categoría:

     | Categoría | coleccion_id |
     |---|---|
     | Lámparas | `33333333-0000-0000-0000-000000000001` |
     | Herramientas | `33333333-0000-0000-0000-000000000002` |
     | Moldes | `33333333-0000-0000-0000-000000000003` |
     | Juguetes | `33333333-0000-0000-0000-000000000004` |
     | Figuras | `33333333-0000-0000-0000-000000000005` |

   - `imagen_url` e `imagenes` con rutas `/assets/productos/<archivo>.webp`. En lámparas, la primera foto es la de día.
   - `INSERT … ON CONFLICT (id) DO UPDATE`, y el stock inicial en `inventario` (10 piezas, mínimo 2), para poder correrlo dos veces.
   - Escribe la descripción en 2 a 4 frases, en tono directo y sin exclamaciones.
2. Haz commit y push **con el usuario de GitHub de Isai** (regla fija):

   ```bash
   GIT_AUTHOR_NAME=IsaiPerez02033 GIT_AUTHOR_EMAIL=isaipz0510@gmail.com \
   GIT_COMMITTER_NAME=IsaiPerez02033 GIT_COMMITTER_EMAIL=isaipz0510@gmail.com \
   git commit -m "feat(catalogo): <nombre del producto>"
   git push origin HEAD:main
   ```

   El push publica las fotos en kinaramx.com en menos de un minuto.
3. Pídele a Aram que corra el SQL en Supabase (SQL Editor). Tú no lo corres ni le pides contraseñas.
   Otra opción es que lo dé de alta desde el panel (`/pages/admin.html` → Productos → Nuevo) y suba ahí las fotos.
4. Cuando avise que ya lo corrió, verifica que aparezca:
   `GET https://vrazcrtbdmwjahgrljag.supabase.co/rest/v1/productos_con_stock?id=eq.<id>`
   con la llave pública que está en `kinara_completo/js/lib/supabase.js`.

## 5. Paquete para Cowork (el catálogo PDF)

Crea la carpeta `~/Desktop/Xolum/Kinara/catalogo/nuevos/<slug>/` con:

```
nuevos/lampara-luna/
├── producto.json
├── foto-1.jpg      ← la principal (de día, en lámparas)
└── foto-2.jpg      ← opcional (de noche, u otro ángulo)
```

`producto.json`:

```json
{
  "accion": "alta",
  "slug": "lampara-luna",
  "nombre": "Lámpara Luna",
  "categoria": "Lámparas",
  "descripcion": "La misma descripción que pusiste en la tienda.",
  "precio": 699,
  "medidas": "12 × 12 × 14 cm",
  "materiales": ["PLA mate", "Luz LED USB"],
  "acabado": "Blanco mate con base negra",
  "nuevo": true,
  "fecha_alta": "2026-11-20",
  "supabase_id": "55555555-0000-0000-0000-000000000009"
}
```

- `slug`: el nombre en minúsculas, sin acentos y con guiones.
- Fotos: copia los JPG de `fotos/` (1000×1000). Cowork las reduce y les pone nombre.
- No toques `catalogo/productos.json` ni el PDF: eso es trabajo de Cowork.
- Si cambiaste el precio o el texto de un producto que ya existía, el paquete lleva
  `"accion": "cambio"`, el `slug` y solo los campos que cambiaron.
  Si Aram quita un producto: `"accion": "baja"` y el `slug`.

## 6. Lo que le entregas a Aram al terminar

Un mensaje corto con:

1. Las fotos (envíalas con SendUserFile para que las vea).
2. El SQL que tiene que correr: ruta y nombre del archivo.
3. El paquete del catálogo: `catalogo/nuevos/<slug>/`.
4. La frase para Cowork:
   > Agrega lo nuevo al catálogo.

Cowork ya tiene la carpeta `catalogo/` y sus instrucciones en `catalogo/INSTRUCCIONES-COWORK.md`.
