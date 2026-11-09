"""Recorta y exporta a WebP con transparencia.
  hero:  python3 exportar.py hero carpeta_png destino_assets
  cat:   python3 exportar.py cat destino_assets png...
"""
import sys, os, glob
from PIL import Image

modo = sys.argv[1]


def caja_alfa(im, umbral=6):
    return im.getchannel('A').point(lambda a: 255 if a > umbral else 0).getbbox()


def limpiar_piso(im):
    """El atrapasombras oscurece todo el piso: dejo solo la sombra cerca de la base."""
    import numpy as np
    from PIL import ImageFilter
    a = np.asarray(im.getchannel('A')).astype(np.float32)
    H, W = a.shape
    objeto = Image.fromarray(((a >= 254) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    objeto = np.asarray(objeto) > 0
    filas = np.where(objeto.any(1))[0]
    cols = np.where(objeto.any(0))[0]
    base_y = filas.max()
    cx = (cols.min() + cols.max()) / 2
    rx = (cols.max() - cols.min()) * 0.5
    ry = H * 0.065
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - (base_y - ry * 0.4)) / ry) ** 2)
    t = np.clip(1.0 - d, 0, 1)
    mascara = t * t * (3 - 2 * t)
    nueva = np.where(objeto, a, a * mascara)
    im.putalpha(Image.fromarray(nueva.astype(np.uint8)))
    return im


if modo == 'hero':
    origen, destino = sys.argv[2], sys.argv[3]
    archivos = sorted(glob.glob(f'{origen}/p2s_*.png'))
    ims = [limpiar_piso(Image.open(a).convert('RGBA')) for a in archivos]
    # Un solo recorte para todos: la unión de lo visible, con margen
    cajas = [caja_alfa(i) for i in ims]
    x0 = min(c[0] for c in cajas); y0 = min(c[1] for c in cajas)
    x1 = max(c[2] for c in cajas); y1 = max(c[3] for c in cajas)
    m = 12
    W, H = ims[0].size
    caja = (max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m))
    print('recorte', caja, 'de', ims[0].size)
    for sub, escala, q in (('d', 1.0, 80), ('m', 0.56, 76)):
        os.makedirs(f'{destino}/{sub}', exist_ok=True)
        total = 0
        for a, im in zip(archivos, ims):
            r = im.crop(caja)
            if escala != 1:
                r = r.resize((round(r.width * escala), round(r.height * escala)), Image.LANCZOS)
            ruta = f'{destino}/{sub}/{os.path.basename(a)[:-4]}.webp'
            r.save(ruta, 'WEBP', quality=q, alpha_quality=100, method=6)
            total += os.path.getsize(ruta)
        print(sub, r.size, 'total KB', total // 1024, 'promedio KB', total // 1024 // len(ims))
else:
    destino = sys.argv[2]
    os.makedirs(destino, exist_ok=True)
    for a in sys.argv[3:]:
        im = limpiar_piso(Image.open(a).convert('RGBA'))
        x0, y0, x1, y1 = caja_alfa(im)
        lado = int(max(x1 - x0, y1 - y0) * 1.3)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        lienzo = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
        lienzo.alpha_composite(im.crop((cx - lado // 2, cy - lado // 2, cx - lado // 2 + lado, cy - lado // 2 + lado)))
        lienzo = lienzo.resize((900, 900), Image.LANCZOS)
        nombre = os.path.basename(a).replace('cat_', '')[:-4]
        ruta = f'{destino}/{nombre}.webp'
        lienzo.save(ruta, 'WEBP', quality=82, alpha_quality=80, method=6)
        print(nombre, os.path.getsize(ruta) // 1024, 'KB')
