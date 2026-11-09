"""Estudio fotográfico realista para productos de Kinara (Blender headless, Cycles).
Uso: blender -b -P estudio.py -- <config.json>
Acepta piezas .obj o .stl (en mm). Para .3mf, convertir antes con tmf2obj.py.
Ver ejemplos/ y docs/NUEVO-PRODUCTO.md.
"""
import bpy, sys, json, glob, math, os
from mathutils import Vector, Matrix

cfg = json.load(open(sys.argv[sys.argv.index('--') + 1]))
bpy.ops.wm.read_factory_settings(use_empty=True)
esc = bpy.context.scene
MM = 0.001

def hexrgb(h, a=1.0):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)

def tipo_nodo(nt, t):
    return next(n for n in nt.nodes if n.type == t)

def nodo(nt, tipo, x=0, y=0, **ent):
    n = nt.nodes.new(tipo)
    n.location = (x, y)
    for k, v in ent.items():
        n.inputs[k].default_value = v
    return n

# ---------------- Material PLA con líneas de capa ----------------
def material_pla(nombre, color, rugosidad=0.5, sss=0.08, capa=0.2):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    p = tipo_nodo(nt,'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = hexrgb(color)
    p.inputs['Roughness'].default_value = rugosidad
    p.inputs['Specular IOR Level'].default_value = 0.35
    p.inputs['Subsurface Weight'].default_value = sss
    p.inputs['Subsurface Radius'].default_value = (1.0, 0.8, 0.6)
    p.inputs['Subsurface Scale'].default_value = 0.0015
    # Líneas de capa: seno de la altura en mm (coordenadas de objeto sin escalar)
    tc = nodo(nt, 'ShaderNodeTexCoord', -900, -300)
    sep = nodo(nt, 'ShaderNodeSeparateXYZ', -700, -300)
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mul = nodo(nt, 'ShaderNodeMath', -500, -300)
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 2 * math.pi / capa
    nt.links.new(sep.outputs['Z'], mul.inputs[0])
    sen = nodo(nt, 'ShaderNodeMath', -300, -300)
    sen.operation = 'SINE'
    nt.links.new(mul.outputs[0], sen.inputs[0])
    # Pequeña variación para que no se vea perfecta
    ruido = nodo(nt, 'ShaderNodeTexNoise', -500, -550)
    ruido.inputs['Scale'].default_value = 0.08
    nt.links.new(tc.outputs['Object'], ruido.inputs['Vector'])
    suma = nodo(nt, 'ShaderNodeMath', -100, -350)
    suma.operation = 'MULTIPLY_ADD'
    suma.inputs[1].default_value = 0.85
    nt.links.new(sen.outputs[0], suma.inputs[0])
    nt.links.new(ruido.outputs['Fac'], suma.inputs[2])
    bump = nodo(nt, 'ShaderNodeBump', 100, -300)
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.00006
    nt.links.new(suma.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def material_madera():
    """Roble claro: vetas largas a lo largo de X, poros finos y barniz satinado."""
    m = bpy.data.materials.new('madera')
    m.use_nodes = True
    nt = m.node_tree
    p = tipo_nodo(nt, 'BSDF_PRINCIPLED')
    tc = nodo(nt, 'ShaderNodeTexCoord', -1400, 0)
    map_ = nodo(nt, 'ShaderNodeMapping', -1200, 0)
    map_.inputs['Scale'].default_value = (0.35, 9.0, 1.0)
    nt.links.new(tc.outputs['Object'], map_.inputs['Vector'])
    veta = nodo(nt, 'ShaderNodeTexNoise', -1000, 100, Scale=6.0, Detail=12.0, Roughness=0.62, Distortion=1.2)
    nt.links.new(map_.outputs[0], veta.inputs['Vector'])
    map2 = nodo(nt, 'ShaderNodeMapping', -1200, -300)
    map2.inputs['Scale'].default_value = (4.0, 160.0, 4.0)
    nt.links.new(tc.outputs['Object'], map2.inputs['Vector'])
    poro = nodo(nt, 'ShaderNodeTexNoise', -1000, -300, Scale=20.0, Detail=4.0)
    nt.links.new(map2.outputs[0], poro.inputs['Vector'])
    mezcla = nodo(nt, 'ShaderNodeMath', -800, 0)
    mezcla.operation = 'MULTIPLY_ADD'
    mezcla.inputs[1].default_value = 0.25
    nt.links.new(poro.outputs['Fac'], mezcla.inputs[0])
    nt.links.new(veta.outputs['Fac'], mezcla.inputs[2])
    ramp = nodo(nt, 'ShaderNodeValToRGB', -550, 0)
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.42, hexrgb('#8a6243')
    els[1].position, els[1].color = 0.78, hexrgb('#c69c6d')
    e = els.new(0.6)
    e.color = hexrgb('#a97c54')
    nt.links.new(mezcla.outputs[0], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.38
    p.inputs['Coat Weight'].default_value = 0.25
    p.inputs['Coat Roughness'].default_value = 0.2
    bump = nodo(nt, 'ShaderNodeBump', -300, -300, Strength=0.05)
    nt.links.new(poro.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

def material_liso(nombre, color, rug=0.85):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    p = tipo_nodo(m.node_tree,'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = hexrgb(color)
    p.inputs['Roughness'].default_value = rug
    return m

def material_luz(nombre, color, fuerza):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(tipo_nodo(nt,'BSDF_PRINCIPLED'))
    em = nodo(nt, 'ShaderNodeEmission', 0, 0)
    em.inputs['Color'].default_value = hexrgb(color)
    em.inputs['Strength'].default_value = fuerza
    nt.links.new(em.outputs[0], tipo_nodo(nt,'OUTPUT_MATERIAL').inputs['Surface'])
    return m

# ---------------- Importar piezas ----------------
def importar(ruta):
    antes = set(bpy.data.objects)
    if ruta.lower().endswith('.stl'):
        bpy.ops.wm.stl_import(filepath=ruta, forward_axis='Y', up_axis='Z')
    else:
        bpy.ops.wm.obj_import(filepath=ruta, forward_axis='Y', up_axis='Z')
    o = [x for x in bpy.data.objects if x not in antes][0]
    return o

piezas = []
ANCLAS = {}
for p in cfg['piezas']:
    o = importar(p['archivo'])
    # Origen al centro de la base, para colocarla con coordenadas en mm
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    o.select_set(False)
    bb = [Vector(c) for c in o.bound_box]
    alto = max(v.z for v in bb) - min(v.z for v in bb)
    o.location = (0, 0, 0)
    ancla_local = None
    if p.get('alinear') == 'disco':
        # Disco con borde plano: el borde define el plano; lo que sobresale va hacia arriba y atrás
        import numpy as np
        co = np.array([v.co[:] for v in o.data.vertices])
        r = np.linalg.norm(co - co.mean(axis=0), axis=1)
        borde = co[r > np.percentile(r, 85)]
        c0 = borde.mean(axis=0)
        val, vec = np.linalg.eigh(np.cov((borde - c0).T))
        n = vec[:, 0]
        alto = (co - c0) @ n
        if alto.mean() < 0:
            n = -n
            alto = -alto
        r1 = Vector(n).rotation_difference(Vector((0, 0, 1))).to_matrix()
        sobre = co[alto > np.percentile(alto, 90)] - c0
        d = r1 @ Vector(sobre.mean(axis=0))
        giro = math.atan2(d.x, d.y)
        r2 = Matrix.Rotation(giro, 3, 'Z')
        o.rotation_euler = (r2 @ r1).to_euler()
        ancla_local = Vector(c0)
    elif p.get('alinear'):
        # Endereza piezas impresas inclinadas: el eje más delgado (o el más largo) va a Z
        import numpy as np
        co = np.array([v.co[:] for v in o.data.vertices])
        co = co - co.mean(axis=0)
        val, vec = np.linalg.eigh(np.cov(co.T))
        z = vec[:, 0] if p['alinear'] == 'delgado' else vec[:, 2]
        if p.get('voltear'):
            z = -z
        z = Vector(z).normalized()
        o.rotation_euler = z.rotation_difference(Vector((0, 0, 1))).to_euler()
        if p.get('giro_z'):
            o.rotation_euler.rotate_axis('Z', math.radians(p['giro_z']))
    if p.get('rot'):
        o.rotation_euler = [math.radians(a) for a in p['rot']]
    if p.get('ejes'):
        # {"x": "+z", "z": "-y"}: hacia dónde apunta cada eje local en el mundo
        dirs = {'x': Vector((1, 0, 0)), 'y': Vector((0, 1, 0)), 'z': Vector((0, 0, 1))}
        def vec(t):
            return dirs[t[1]] * (1 if t[0] == '+' else -1)
        col = {k: vec(v) for k, v in p['ejes'].items()}
        faltan = [k for k in 'xyz' if k not in col]
        if faltan == ['x']: col['x'] = col['y'].cross(col['z'])
        if faltan == ['y']: col['y'] = col['z'].cross(col['x'])
        if faltan == ['z']: col['z'] = col['x'].cross(col['y'])
        mat = Matrix((col['x'], col['y'], col['z'])).transposed()
        o.rotation_euler = mat.to_euler()
    bpy.context.view_layer.update()
    # Colocar: que la pieza quede apoyada en z=pos[2]
    bbw = [o.matrix_world @ o.data.vertices[i].co for i in range(0, len(o.data.vertices), max(1, len(o.data.vertices) // 4000))]
    zmin = min(v.z for v in bbw)
    px, py, pz = p.get('pos', (0, 0, 0))
    o.location = (px, py, pz - zmin)
    if ancla_local is not None:
        bpy.context.view_layer.update()
        aw = o.matrix_world @ ancla_local
        o.location.x += px - aw.x
        o.location.y += py - aw.y
        bpy.context.view_layer.update()
        ANCLAS[p.get('nombre', o.name)] = o.matrix_world @ ancla_local
    if p.get('en_ancla'):
        aw = ANCLAS[p['en_ancla']]
        bpy.context.view_layer.update()
        ws = [o.matrix_world @ o.data.vertices[i].co for i in range(0, len(o.data.vertices), max(1, len(o.data.vertices) // 4000))]
        cx = (min(v.x for v in ws) + max(v.x for v in ws)) / 2
        cy = (min(v.y for v in ws) + max(v.y for v in ws)) / 2
        zmn, zmx = min(v.z for v in ws), max(v.z for v in ws)
        objetivo_z = aw.z if p.get('arriba', True) else aw.z - (zmx - zmn)
        if p.get('centro_z'):
            objetivo_z = aw.z - (zmx - zmn) / 2
        o.location.x += aw.x - cx + p.get('dx', 0)
        o.location.y += aw.y - cy + p.get('dy', 0)
        o.location.z += objetivo_z + p.get('dz', 0) - zmn
    o.scale = (MM, MM, MM)
    o.location = (o.location.x * MM, o.location.y * MM, o.location.z * MM)
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    o.data.materials.clear()
    o.data.materials.append(material_pla(p.get('nombre', 'pla'), p['color'], p.get('rugosidad', 0.5), p.get('sss', 0.08)))
    piezas.append(o)

if cfg.get('rot_grupo'):
    eje = bpy.data.objects.new('grupo', None)
    esc.collection.objects.link(eje)
    for o in piezas:
        o.parent = eje
    eje.rotation_euler = [math.radians(a) for a in cfg['rot_grupo']]
    bpy.context.view_layer.update()
    for o in piezas:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    bpy.context.view_layer.update()
    zmin = min((o.matrix_world @ Vector(c)).z for o in piezas for c in o.bound_box)
    for o in piezas:
        o.location.z -= zmin

for o in piezas:
    w = [o.matrix_world @ o.data.vertices[i].co for i in range(0, len(o.data.vertices), max(1, len(o.data.vertices) // 4000))]
    print('PIEZA', o.name, [round(min(v[i] for v in w) * 1000) for i in range(3)], [round(max(v[i] for v in w) * 1000) for i in range(3)])

# Centro y tamaño del producto (para cámara y difusor)
bbs = [o.matrix_world @ Vector(c) for o in piezas for c in o.bound_box]
mn = Vector([min(v[i] for v in bbs) for i in range(3)])
mx = Vector([max(v[i] for v in bbs) for i in range(3)])
centro = (mn + mx) / 2
tam = mx - mn
desplazar = Vector((-centro.x, -centro.y, 0))
for o in piezas:
    o.location += desplazar
centro += desplazar

# ---------------- Escenario ----------------
noche = cfg.get('modo') == 'noche'
bpy.ops.mesh.primitive_plane_add(size=3, location=(0, 0, 0))
mesa = bpy.context.object
mesa.data.materials.append(material_madera())
# Canto de la mesa: un poco de grosor para que no se vea como papel
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0.9, 1.0), rotation=(math.radians(90), 0, 0))
pared = bpy.context.object
pared.data.materials.append(material_liso('pared', cfg.get('pared', '#9a9c86'), 0.95))
RECORTE = cfg.get('recorte')
if RECORTE:
    # Pieza recortada: sin pared y la mesa solo deja la sombra
    bpy.data.objects.remove(pared)
    mesa.is_shadow_catcher = True
    mesa.data.materials.clear()
    mesa.data.materials.append(material_liso('base', RECORTE, 0.7))
    cfg['extras'] = []

for extra in cfg.get('extras', []):
    if extra['tipo'] == 'libros':
        y = 0
        for i, (w, d, h, col) in enumerate(extra['libros']):
            bpy.ops.mesh.primitive_cube_add(size=1)
            b = bpy.context.object
            b.scale = (w * MM, d * MM, h * MM)
            b.location = (extra['pos'][0] * MM, extra['pos'][1] * MM, (y + h / 2) * MM)
            b.rotation_euler.z = math.radians(extra.get('giro', 0) + i * 4)
            bev = b.modifiers.new('bisel', 'BEVEL')
            bev.width = 0.0015
            bev.segments = 3
            b.data.materials.append(material_liso(f'libro{i}', col, 0.9))
            y += h
    if extra['tipo'] == 'esfera':
        a = ANCLAS[extra['ancla']] * MM + desplazar
        bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=extra['r'] * MM,
                                             location=(a.x, a.y + extra.get('dy', 0) * MM, a.z + extra.get('dz', 0) * MM))
        bpy.ops.object.shade_smooth()
        bpy.context.object.data.materials.append(material_pla('esfera', extra['color'], 0.55, 0.0))
    if extra['tipo'] == 'taza':
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=extra['r'] * MM, depth=extra['h'] * MM,
                                            location=(extra['pos'][0] * MM, extra['pos'][1] * MM, extra['h'] / 2 * MM))
        t = bpy.context.object
        sol = t.modifiers.new('grosor', 'SOLIDIFY')
        sol.thickness = 0.003
        bev = t.modifiers.new('bisel', 'BEVEL')
        bev.width = 0.001
        bev.segments = 3
        bpy.ops.object.shade_smooth()
        t.data.materials.append(material_liso('ceramica', extra['color'], 0.25))

# Panel de luz trasero (lámparas de capas)
if cfg.get('panel') and noche:
    pn = cfg['panel']
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, pn['y'] * MM, pn['z'] * MM), rotation=(math.radians(90), 0, 0))
    pl = bpy.context.object
    pl.scale = (pn['w'] * MM, pn['h'] * MM, 1)
    pl.data.materials.append(material_luz('panel', '#ffd2a0', pn['fuerza']))

# Luz interior para lámparas
if cfg.get('luz_interior'):
    li = cfg['luz_interior']
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=li['r'] * MM, depth=li['h'] * MM,
                                        location=(0, 0, li['z'] * MM + li['h'] / 2 * MM))
    dif = bpy.context.object
    bpy.ops.object.shade_smooth()
    dif.data.materials.append(material_luz('difusor', '#ffd6a0', li['fuerza'] if noche else li.get('fuerza_dia', 0)))
    if noche:
        bpy.ops.object.light_add(type='POINT', location=(0, 0, (li['z'] + li['h'] * 0.6) * MM))
        pl = bpy.context.object
        pl.data.energy = li.get('watts', 6)
        pl.data.color = hexrgb('#ffc98a')[:3]
        pl.data.shadow_soft_size = 0.004

# ---------------- Luz ----------------
mundo = bpy.data.worlds.new('mundo')
esc.world = mundo
mundo.use_nodes = True
fondo = tipo_nodo(mundo.node_tree,'BACKGROUND')
if noche:
    fondo.inputs['Color'].default_value = hexrgb('#1b2a2c')
    fondo.inputs['Strength'].default_value = 0.08
    bpy.ops.object.light_add(type='AREA', location=(-1.2, -0.6, 1.0))
    rel = bpy.context.object
    rel.data.energy = 6
    rel.data.size = 1.2
    rel.data.color = hexrgb('#9fb6c9')[:3]
    rel.rotation_euler = (Vector((0, 0, 0.1)) - rel.location).to_track_quat('-Z', 'Y').to_euler()
else:
    fondo.inputs['Color'].default_value = hexrgb('#e9eef0')
    fondo.inputs['Strength'].default_value = cfg.get('cielo', 0.12)
    # Ventana grande a la izquierda: luz principal suave
    bpy.ops.object.light_add(type='AREA', location=(-0.9, -0.35, 0.75))
    ven = bpy.context.object
    ven.data.shape = 'RECTANGLE'
    ven.data.size = 0.9
    ven.data.size_y = 1.3
    ven.data.energy = cfg.get('luz', 70)
    ven.data.color = hexrgb('#fff4e6')[:3]
    ven.rotation_euler = (Vector((0, 0, 0.08)) - ven.location).to_track_quat('-Z', 'Y').to_euler()
    # Relleno tenue desde la derecha
    bpy.ops.object.light_add(type='AREA', location=(0.9, -0.6, 0.5))
    rel = bpy.context.object
    rel.data.size = 1.2
    rel.data.energy = cfg.get('relleno', 10)
    rel.rotation_euler = (Vector((0, 0, 0.08)) - rel.location).to_track_quat('-Z', 'Y').to_euler()

# ---------------- Cámara ----------------
cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d)
esc.collection.objects.link(cam)
esc.camera = cam
cam_d.lens = cfg.get('lente', 70)
objetivo = Vector((0, 0, tam.z * cfg.get('mira', 0.45)))
ang = math.radians(cfg.get('azimut', -28))
elev = math.radians(cfg.get('elevacion', 14))
diag = max(tam.x, tam.y, tam.z)
dist = diag * cfg.get('distancia', 4.2)
cam.location = objetivo + Vector((math.sin(ang) * math.cos(elev), -math.cos(ang) * math.cos(elev), math.sin(elev))) * dist
cam.rotation_euler = (objetivo - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_d.dof.use_dof = True
cam_d.dof.focus_distance = (objetivo - cam.location).length
cam_d.dof.aperture_fstop = cfg.get('fstop', 2.8)

# ---------------- Render ----------------
esc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    esc.cycles.device = 'GPU'
except Exception as e:
    print('sin GPU', e)
esc.cycles.samples = cfg.get('muestras', 256)
esc.cycles.use_denoising = True
esc.cycles.max_bounces = 10
esc.cycles.transmission_bounces = 10
esc.render.resolution_x = cfg.get('px', 1400)
esc.render.resolution_y = cfg.get('px', 1400)
esc.view_settings.view_transform = 'AgX'
try:
    esc.view_settings.look = 'AgX - Medium High Contrast'
except TypeError:
    pass
esc.view_settings.exposure = cfg.get('exposicion', 0)
esc.render.image_settings.file_format = 'PNG'
if cfg.get('recorte'):
    esc.render.film_transparent = True
    esc.render.image_settings.color_mode = 'RGBA'
esc.render.filepath = cfg['salida']
if cfg.get('rapido'):
    esc.render.engine = 'BLENDER_WORKBENCH'
    esc.display.shading.color_type = 'MATERIAL'
    esc.display.shading.show_cavity = True
bpy.ops.render.render(write_still=True)
print('LISTO', cfg['salida'], [round(v * 1000) for v in tam])
