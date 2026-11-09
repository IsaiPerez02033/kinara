"""Convierte un render de estudio.py en las fotos finales de un producto.

Uso: python3 foto_producto.py <render.png> <nombre_archivo_sin_extension>
  Ej: python3 foto_producto.py <scratchpad>/renders/maceta.png maceta_dia

Genera (cuadrado 1000×1000, recorte centrado):
  kinara_completo/assets/productos/<nombre>.webp   → la que usa la tienda
  ../fotos/<nombre>.jpg                            → original para el catálogo PDF
"""
import os
import sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(AQUI, '..', '..'))
TIENDA = os.path.join(REPO, 'kinara_completo', 'assets', 'productos')
FOTOS = os.path.abspath(os.path.join(REPO, '..', 'fotos'))

origen, nombre = sys.argv[1], sys.argv[2]
im = Image.open(origen).convert('RGB')
lado = min(im.size)
x, y = (im.width - lado) // 2, (im.height - lado) // 2
im = im.crop((x, y, x + lado, y + lado)).resize((1000, 1000), Image.LANCZOS)
os.makedirs(FOTOS, exist_ok=True)
im.save(os.path.join(TIENDA, f'{nombre}.webp'), 'WEBP', quality=80, method=6)
im.save(os.path.join(FOTOS, f'{nombre}.jpg'), quality=90)
print('webp', os.path.getsize(os.path.join(TIENDA, f'{nombre}.webp')) // 1024, 'KB →', TIENDA)
print('jpg  →', FOTOS)
