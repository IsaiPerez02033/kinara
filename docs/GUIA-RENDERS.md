# Kinara: de un link de MakerWorld a un producto listo para el panel

Guía para trabajar con **Claude Code**. Tú buscas modelos en MakerWorld y Claude hace el resto:
revisa la licencia, prepara el modelo, hace las fotos en Blender y te entrega una **ficha lista**
para que subas el producto desde el panel de la tienda (kinaramx.com).

- **Parte A** es para ti (la persona): qué instalar y cómo pedir cada producto.
- **Parte B** es para Claude Code: el proceso que debe seguir. No necesitas leerla.

---

# Parte A — Para ti

## A1. Lo que necesitas una sola vez

1. **Blender 4.5 LTS** (gratis): <https://www.blender.org/download/lts/>. Instálalo normal.
2. **Python 3** con la librería Pillow. Si no sabes si lo tienes, Claude Code lo revisa y te dice qué hacer.
3. **Claude Code** (la app de escritorio o la terminal).
4. Una carpeta de trabajo con el repo de Kinara. En la terminal:
   ```bash
   git clone https://github.com/IsaiPerez02033/kinara.git ~/Kinara/kinara
   ```
5. **Cuenta de MakerWorld** con la sesión abierta en tu navegador (para descargar modelos).
6. **Acceso al panel de admin** de kinaramx.com: crea tu cuenta en kinaramx.com/pages/acceso
   y pídele a Aram que te dé permiso de admin.

## A2. Cómo empezar cada vez

1. Abre Claude Code en la carpeta `~/Kinara/kinara`.
2. La primera vez en esa conversación, escribe:
   > Lee docs/GUIA-RENDERS.md y sigue la Parte B.
3. Pega el link del modelo de MakerWorld. Si quieres, agrega lo que ya sepas:
   > https://makerworld.com/es/models/1288081-... · categoría Lámparas · colores blanco y negro · precio $749

Claude te dirá si el modelo **se puede vender**. Si no, busca otro.
Si sí, te pedirá lo que falte y al final te entrega:

- Las **fotos** del producto (cuadradas, listas para subir).
- Una **ficha** con nombre, categoría, descripción, medidas, materiales y acabado, en el mismo
  orden que los campos del panel.

## A3. Subirlo a la tienda

1. Entra a **kinaramx.com/pages/admin** → **Productos** → **+ Nuevo producto**.
2. Arrastra las fotos de la carpeta `entrega/` que te indique Claude. La primera es la principal
   (en lámparas, la de día).
3. Copia cada campo de la ficha en su lugar: Nombre, Categoría, Precio, Descripción, Medidas,
   Acabado, Materiales y Piezas en stock.
4. Si la categoría no existe, en el mismo formulario usa **+ Crear otra sección** (o pregúntale a Aram).
5. Deja **Visible en la tienda** prendido solo cuando el precio sea el definitivo. **Guardar**.

---

# Parte B — Para Claude Code

Vas a ayudar a una persona del equipo de Kinara (tienda de impresión 3D en México, kinaramx.com)
a convertir modelos de MakerWorld en fichas de producto con fotos realistas hechas en Blender.
Ella sube el producto desde el panel; tú **no publicas nada**.

**Responde en español, con mensajes cortos y sin tecnicismos.** Ella no es programadora.

## B0. Límites

- **No hagas** commits, push, SQL ni cambios en `kinara_completo/` (el sitio). Tu trabajo vive en la
  carpeta de entregas (B2). Si algo del sitio parece roto, díselo para que avise a Aram.
- **No inicies sesión** por ella ni le pidas contraseñas. Si una página pide sesión, ella la abre.
- **No inventes el precio.** Si no te lo dio, la ficha lo deja como "Pendiente (lo decide Aram)" y
  le das los datos de impresión (gramos y horas) para calcularlo.
- **No uses las fotos del diseñador**: las fotos salen de tu render.
- Nada de marcas ajenas en nombres ni textos (Funko, Pokémon, Disney, Anthropic/Claude…).

## B1. Revisión inicial (solo la primera vez)

1. Encuentra Blender: `blender --version`; en Mac suele estar en
   `/Applications/Blender.app/Contents/MacOS/Blender`; en Windows en
   `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`. Se probó con 4.5 LTS.
2. Revisa Pillow: `python3 -c "import PIL"`. Si falta: `python3 -m pip install --user pillow`
   (pídele permiso antes de instalar).
3. Herramientas que vas a usar, todas en `herramientas/render/`:
   - `estudio.py`: arma la escena (mesa de madera, pared, luz suave) y hace el render con Cycles.
   - `tmf2obj.py`: convierte un `.3mf` de Bambu Studio en un `.obj` por pieza.
   - `foto_producto.py`: recorta el render a 1000×1000 y lo guarda en `.jpg` y `.webp`.
   - `ejemplos/*.json`: configuraciones reales de productos de la tienda (las rutas son de otra
     computadora: úsalas solo como modelo).

## B2. Carpeta de trabajo por producto

Usa `~/Kinara/entregas/<slug>/` (slug: nombre en minúsculas, sin acentos, con guiones, p. ej.
`lampara-asanoha`):

```
entregas/lampara-asanoha/
├── modelo/      ← archivo descargado y los .obj convertidos
├── renders/     ← pruebas y renders finales (.png)
├── config/      ← los .json de estudio.py
└── entrega/     ← lo que ella sube: fotos .jpg/.webp + ficha.md
```

## B3. Leer el modelo y revisar la licencia

1. Abre el link en el navegador y lee la página. Saca nombre, diseñador, descripción, medidas
   (si las da), los perfiles de "Archivos de impresión" (nombre, horas) y la **licencia**: está en
   el bloque "Licencia", cortada; dale clic a "más" para leerla completa.
2. Decide si se puede vender (Kinara vende la pieza impresa):

   | Licencia | ¿Se puede vender? |
   |---|---|
   | CC BY, CC BY-SA, CC0 | Sí, dando crédito al diseñador. |
   | Cualquiera con **NC** (BY-NC, BY-NC-SA, BY-NC-ND) | **No.** |
   | Standard Digital File License (la de serie de MakerWorld) | Solo si el diseñador ofrece licencia o membresía comercial y Kinara la tiene. Si no, **requiere permiso del diseñador**. |
   | No dice o no es clara | **Requiere permiso del diseñador.** |

   También es **no** si usa marcas o personajes ajenos, aunque la licencia lo permita.
3. Dile el resultado en una o dos líneas: modelo, diseñador, licencia y si se puede vender.
   - **No se puede**: termina ahí. No descargues ni hagas render.
   - **Requiere permiso**: pregúntale si sigue de todos modos (Aram lo resolverá antes de publicar)
     y anótalo en la ficha.

## B4. Descargar el archivo

1. Pregúntale antes de descargar. Prefiere el **`.3mf`** (trae piezas separadas y colores);
   si no hay, los `.stl`.
2. La descarga de MakerWorld pide sesión. Si tienes acceso al navegador donde ella tiene la sesión
   abierta, da clic en "Descargar" con su permiso. Si no, pídele que lo descargue ella y te diga
   dónde quedó (normalmente `~/Downloads/`).
3. Copia el archivo a `entregas/<slug>/modelo/`.
4. Si es `.3mf`: `python3 -I herramientas/render/tmf2obj.py <archivo.3mf> entregas/<slug>/modelo/obj`.
   Si es `.stl`, entra directo a `estudio.py`. Si el `.3mf` trae varias placas o versiones (alta/baja),
   pregúntale cuál quiere.

En el mismo mensaje pídele lo que falte, **en una sola pregunta**:

```
Nombre en la tienda:  (si no, propones uno corto en español)
Categoría:            Lámparas | Herramientas | Moldes | Juguetes | Figuras | Accesorios | otra
Colores:              color de cada pieza (p. ej. pantalla blanca, base negra)
Material:             PLA mate (de serie), PETG, PLA + kit LED…
Precio:               si ya lo sabe
```

Las categorías actuales las puedes consultar en
`https://vrazcrtbdmwjahgrljag.supabase.co/rest/v1/colecciones?select=nombre&activa=eq.true&order=orden`
con la llave pública (`apikey`) que está en `kinara_completo/js/lib/supabase.js`.

## B5. Render en Blender

1. Copia el ejemplo más parecido de `herramientas/render/ejemplos/` a `entregas/<slug>/config/`:
   `organizador.json` (piezas de varios colores), `llaveros.json` (piezas chicas),
   `hoyo.json` y `hoyo_noche.json` (lámpara de día y de noche).
2. Cambia `piezas[].archivo` por tus `.obj`/`.stl` (rutas absolutas), `color` (hex) de cada pieza y
   `salida` por `entregas/<slug>/renders/<nombre>.png` (ruta absoluta). Si las piezas vienen
   separadas, acomódalas con `pos` [x, y, z] en mm como quedarían armadas.
3. **Prueba rápida** (`"rapido": true`, `"muestras": 16`, `"px": 500`):
   ```bash
   <blender> -b -P herramientas/render/estudio.py -- entregas/<slug>/config/<nombre>.json
   ```
   Tarda segundos y es una vista simple (sin madera ni luz realista), solo para encuadre. Abre la
   imagen y revisa: pieza centrada y completa, colores de cada pieza, armado correcto, que se lea la forma. Ajusta `azimut`, `elevacion`, `distancia`, `mira` y vuelve a probar.
4. **Render final**: `"rapido": false`, `"muestras": 160` a `200`, `"px": 1200`. Tarda varios minutos:
   avísale.
5. **Lámparas**: dos fotos, `_dia` (apagada) y `_noche` (encendida, `"modo": "noche"` y
   `luz_interior`, como en `hoyo_noche.json`). Lo demás: una foto; dos si un segundo ángulo ayuda.
6. Estilo de la tienda: mesa de madera clara, fondo desenfocado, luz suave, pieza al centro. Sin texto
   encima de la foto.
7. **Medidas**: `estudio.py` imprime al final `LISTO <salida> [x, y, z]` en mm. Son las medidas del
   producto armado: pásalas a cm con un decimal (`10 × 10 × 17.6 cm`). Si la página de MakerWorld
   da otras, usa las del modelo y menciónalo.

## B6. Fotos finales

Por cada render final:

```bash
python3 herramientas/render/foto_producto.py entregas/<slug>/renders/<nombre>.png <slug>_dia entregas/<slug>/entrega
```

Deja `<slug>_dia.jpg` y `<slug>_dia.webp` (1000×1000) en `entrega/`. Al panel se sube cualquiera de
los dos; el `.jpg` es el más fácil de ver en cualquier computadora.

## B7. La ficha

Escribe `entregas/<slug>/entrega/ficha.md`, con los campos **en el orden del panel**:

```markdown
# Lámpara Asanoha alta

**Nombre:** Lámpara Asanoha alta
**Categoría:** Lámparas
**Precio (MXN, con IVA):** Pendiente (lo decide Aram)
**Descripción:** Lámpara de mesa con celosía asanoha, el patrón japonés de hojas de cáñamo. Encendida proyecta una trama de luz cálida; apagada parece madera tallada. Funciona con luz LED y cable USB.
**Medidas:** 10 × 10 × 17.6 cm
**Acabado:** Mate, beige con base negra
**Materiales:** PLA mate, kit LED USB
**Piezas en stock:** 0 (cámbialo cuando haya piezas impresas)
**Fotos (en este orden):** lampara-asanoha_dia.jpg, lampara-asanoha_noche.jpg

---
Para Aram (no va en el panel):
- Diseño: Meyui · MakerWorld 1288081 · Standard Digital File License: requiere licencia comercial
- Impresión: perfil "Alta", ~11 h, ~175 g de PLA + kit LED 001
- Link: https://makerworld.com/es/models/1288081
```

Reglas de texto:
- Descripción de 2 a 4 frases: qué es, para qué sirve y un detalle que la haga atractiva. Tono directo,
  sin exclamaciones ni frases de relleno ("eleva tu espacio", "único en su tipo").
- Materiales separados por coma (el panel los separa así).
- Nada de marcas ajenas ni el nombre del diseñador en la descripción.

## B8. Entrega

Termina con un mensaje corto:

1. Muestra las fotos (ábrelas o envíalas para que las vea).
2. Dile dónde está la carpeta `entrega/` y pega la ficha.
3. Recuérdale los pasos de la Parte A3 (panel → Productos → + Nuevo producto).
4. Si la licencia requiere permiso o falta el precio, dile que avise a Aram antes de dejarlo visible.

Si ella pide cambios (otro ángulo, otro color, otra escena), ajusta la config y repite desde B5.
