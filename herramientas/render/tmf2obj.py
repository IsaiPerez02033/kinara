"""Convierte un .3mf (incluido el formato de Bambu con componentes) a un .obj
por objeto de la placa. Uso: python3 -I tmf2obj.py archivo.3mf carpeta_salida"""
import sys, os, zipfile, re
import xml.etree.ElementTree as ET

NS = '{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}'
NS_P = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'

def matriz(t):
    if not t:
        return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
    return [float(x) for x in t.split()]

def mult(a, b):
    # a, b: 3x4 como 12 valores (m00 m01 m02 m10 ... m30 m31 m32) en convención 3MF (fila = vector)
    A = [[a[0], a[1], a[2], 0], [a[3], a[4], a[5], 0], [a[6], a[7], a[8], 0], [a[9], a[10], a[11], 1]]
    B = [[b[0], b[1], b[2], 0], [b[3], b[4], b[5], 0], [b[6], b[7], b[8], 0], [b[9], b[10], b[11], 1]]
    C = [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
    return [C[0][0], C[0][1], C[0][2], C[1][0], C[1][1], C[1][2], C[2][0], C[2][1], C[2][2], C[3][0], C[3][1], C[3][2]]

def aplicar(m, v):
    x, y, z = v
    return (x * m[0] + y * m[3] + z * m[6] + m[9],
            x * m[1] + y * m[4] + z * m[7] + m[10],
            x * m[2] + y * m[5] + z * m[8] + m[11])

def main(ruta, salida):
    os.makedirs(salida, exist_ok=True)
    z = zipfile.ZipFile(ruta)
    modelos = {}
    for n in z.namelist():
        if n.lower().endswith('.model'):
            modelos['/' + n] = ET.fromstring(z.read(n))
    raiz_nombre = '/3D/3dmodel.model'
    ext_parte, ext_obj = {}, {}
    if 'Metadata/model_settings.config' in z.namelist():
        cfg = ET.fromstring(z.read('Metadata/model_settings.config'))
        for ob in cfg.iter('object'):
            e_ob = next((m.get('value') for m in ob.findall('metadata') if m.get('key') == 'extruder'), '1')
            ext_obj[ob.get('id')] = e_ob
            for pa in ob.iter('part'):
                e = next((m.get('value') for m in pa.findall('metadata') if m.get('key') == 'extruder'), e_ob)
                ext_parte[(ob.get('id'), pa.get('id'))] = e
    objetos = {}  # (archivo, id) -> elemento
    for arch, raiz in modelos.items():
        for o in raiz.iter(NS + 'object'):
            objetos[(arch, o.get('id'))] = o

    def mallas(arch, oid, m, acc, ext='1'):
        o = objetos.get((arch, oid))
        if o is None:
            return
        malla = o.find(NS + 'mesh')
        if malla is not None:
            vs = [(float(v.get('x')), float(v.get('y')), float(v.get('z'))) for v in malla.find(NS + 'vertices')]
            tris = list(malla.find(NS + 'triangles'))
            ts = [(int(t.get('v1')), int(t.get('v2')), int(t.get('v3'))) for t in tris]
            # Pintura multicolor de Bambu: "4" = filamento 1, "8" = 2, "C" = 3...
            def ext_de(t):
                c = t.get('paint_color') or ''
                try:
                    n = int(c, 16)
                except ValueError:
                    n = 0
                return str(n // 4) if n and n % 4 == 0 and n // 4 <= 16 else ext
            vw = [aplicar(m, v) for v in vs]
            por = {}
            for t, tri in zip(ts, tris):
                por.setdefault(ext_de(tri), []).append(t)
            for e, lista in por.items():
                acc.append((vw, lista, e))
        comps = o.find(NS + 'components')
        if comps is not None:
            for c in comps:
                destino = c.get(NS_P + 'path') or arch
                e = ext_parte.get((oid_raiz[0], c.get('objectid')), ext)
                mallas(destino, c.get('objectid'), mult(matriz(c.get('transform')), m), acc, e)

    raiz = modelos[raiz_nombre]
    nombres = {}
    for o in raiz.iter(NS + 'object'):
        nombres[o.get('id')] = o.get('name') or f"obj{o.get('id')}"
    build = raiz.find(NS + 'build')
    oid_raiz = [None]
    hechos = []
    for i, item in enumerate(build):
        acc = []
        oid_raiz[0] = item.get('objectid')
        mallas(raiz_nombre, item.get('objectid'), matriz(item.get('transform')), acc, ext_obj.get(item.get('objectid'), '1'))
        if not acc:
            continue
        nombre = re.sub(r'[^A-Za-z0-9_-]+', '_', nombres.get(item.get('objectid'), f'item{i}'))[:40]
        grupos = {}
        for vs, ts, e in acc:
            grupos.setdefault(e, []).append((vs, ts))
        for e, lista in grupos.items():
            archivo = os.path.join(salida, f'{i:02d}_{nombre}__e{e}.obj')
            with open(archivo, 'w') as f:
                base = 1
                for vs, ts in lista:
                    for v in vs:
                        f.write('v %.4f %.4f %.4f\n' % v)
                    for t in ts:
                        f.write('f %d %d %d\n' % (t[0] + base, t[1] + base, t[2] + base))
                    base += len(vs)
            hechos.append((archivo, sum(len(t) for _, t in lista)))
    for a, n in hechos:
        print(os.path.basename(a), n, 'triángulos')

main(sys.argv[1], sys.argv[2])
