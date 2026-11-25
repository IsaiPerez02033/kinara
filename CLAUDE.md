# Kinara — instrucciones para Claude Code

Tienda de impresión 3D en **kinaramx.com**. HTML/CSS/JS sin framework + Supabase + Mercado Pago.
Responde siempre en español, en mensajes cortos.

## Si te pasan un link de MakerWorld, un .stl o un .3mf

Sigue **[docs/NUEVO-PRODUCTO.md](docs/NUEVO-PRODUCTO.md)** de principio a fin:
licencia (paso 0, solo MakerWorld) → modelo → render en Blender → alta en la tienda →
paquete para el catálogo PDF de Cowork → resumen a Aram.
Si quien te habla solo hace renders y sube desde el panel (sin git ni SQL), usa en su lugar
**[docs/GUIA-RENDERS.md](docs/GUIA-RENDERS.md)** (Parte B).
Las fichas y los modelos descartados por licencia se anotan en `productos-nuevos.md`
(raíz del repo; es un archivo local que no se sube a git, porque el repo es público).

## Dónde está cada cosa

| Ruta | Qué es |
|---|---|
| `kinara_completo/` | El sitio. Vercel publica `main` solo en cada push (direcciones sin `.html`). |
| `kinara_completo/pages/admin.html` + `js/admin.js` | Panel: productos, secciones (crear, editar, foto, orden, ocultar, borrar), pedidos, cotizaciones, ajustes. |
| `kinara_completo/js/secciones.js` | La tienda lee las secciones de la tabla `colecciones` y las acomoda en mosaico, filtros y pie. |
| `sql/` | Migraciones numeradas y Edge Functions (`*.ts`). |
| `herramientas/render/` | Estudio de render en Blender (`estudio.py`, `foto_producto.py`, `tmf2obj.py`). |
| `correos/` | Plantillas de correo de Supabase Auth. |
| `../modelos/`, `../fotos/`, `../catalogo/` | Archivos 3D, fotos finales y catálogo PDF (fuera del repo). |

## Reglas fijas

- **Git:** todo commit y push va con el usuario de GitHub de Isai:
  ```bash
  GIT_AUTHOR_NAME=IsaiPerez02033 GIT_AUTHOR_EMAIL=isaipz0510@gmail.com \
  GIT_COMMITTER_NAME=IsaiPerez02033 GIT_COMMITTER_EMAIL=isaipz0510@gmail.com git commit -m "..."
  git push origin HEAD:fix/seguridad-checkout HEAD:main
  ```
- **SQL y configuración de Supabase los corre Aram** en el SQL Editor. Tú escribes el archivo en `sql/NN_*.sql`
  (que se pueda correr dos veces) y le dices cuál correr. Nunca pidas contraseñas ni llaves secretas.
- El código debe seguir funcionando si Aram todavía no corre el SQL nuevo (consultas con respaldo).
- Nada de marcas ajenas en nombres, textos ni modelos (Funko, Anthropic/Claude, personajes con derechos).
- Nada de precios inventados: si falta el precio, se pregunta.

## Probar en local

`.claude/launch.json` (en `Kinara/`) tiene `kinara-local`: un servidor estático en `http://localhost:8787`
que usa el Supabase de producción solo para leer. El panel pide sesión de admin; para revisar su diseño,
abre el diálogo o la vista desde la consola con datos de ejemplo, sin escribir en la base.
