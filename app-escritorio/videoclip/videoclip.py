# Videoclip del Estudio Nook, armado por Blender sin mouse.
#
#   blender -b -P videoclip.py -- datos.json salida.mp4 [16x9|9x16] [desde_s] [hasta_s] [escala_%]
#
# datos.json sale de analizar-audio.js (graves, medios, agudos, energia y
# golpes de bombo, cuadro por cuadro a 30 fps). La escena es un anillo de
# barras de luz alrededor de una esfera, sobre un piso que refleja:
#   - la esfera late con el bombo,
#   - cada barra sigue una mezcla de graves, medios y agudos según dónde está
#     en el anillo, con un pequeño retraso para que la onda gire,
#   - los colores pasan de fríos (intro, puente) a calientes (drop) según la
#     energía de cada parte,
#   - la cámara da una vuelta lenta y se acerca un poco en cada golpe.
# El audio va pegado al video (AAC 320). También guarda el .blend al lado.

import bpy
import json
import math
import os
import sys
import colorsys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    raise SystemExit("Uso: blender -b -P videoclip.py -- datos.json salida.mp4 [16x9|9x16] [desde_s] [hasta_s] [escala_%]")
DATOS, SALIDA = argv[0], argv[1]
FORMATO = argv[2] if len(argv) > 2 else "16x9"
DESDE = float(argv[3]) if len(argv) > 3 else 0.0
HASTA = float(argv[4]) if len(argv) > 4 else None
ESCALA = int(argv[5]) if len(argv) > 5 else 100

with open(DATOS, encoding="utf-8") as f:
    d = json.load(f)
FPS = d["fps"]
N = d["cuadros"]
graves, medios, agudos, energia = d["graves"], d["medios"], d["agudos"], d["energia"]

# Energía llevada a 0..1 en toda la canción: 0 la parte más tranquila, 1 el drop.
e_min, e_max = min(energia), max(energia)
parte = [(x - e_min) / ((e_max - e_min) or 1) for x in energia]

# Cuánto "pega" cada golpe de bombo: 1 en el golpe y cae en ~0,25 s.
pegada = [0.0] * N
for g in d["golpes"]:
    for k in range(int(FPS * 0.35)):
        if g + k < N:
            pegada[g + k] = max(pegada[g + k], math.exp(-k / (FPS * 0.09)))


# ---------------------------------------------------------------- utilidades

def vaciar_escena():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def fcurve(id_dato, ruta, indice=0):
    """Devuelve la F-curve de `ruta[indice]`, creándola. Sirve para las
    acciones por capas de Blender 4.4+ y para las viejas."""
    # indice None = propiedad suelta (no vector), como la lente de la cámara.
    id_dato.keyframe_insert(ruta, index=-1 if indice is None else indice, frame=1)
    indice = indice or 0
    accion = id_dato.animation_data.action
    curvas = None
    try:
        from bpy_extras import anim_utils
        bolsa = anim_utils.action_get_channelbag_for_slot(accion, id_dato.animation_data.action_slot)
        curvas = bolsa.fcurves
    except Exception:
        curvas = accion.fcurves
    for c in curvas:
        if c.data_path == ruta and c.array_index == indice:
            return c
    raise RuntimeError("no encontré la curva " + ruta)


def animar(id_dato, ruta, indice, valores, primero=1, lineal=True):
    """Pone un cuadro clave por cada valor, de una sola vez (rápido)."""
    c = fcurve(id_dato, ruta, indice)
    c.keyframe_points.clear()
    c.keyframe_points.add(len(valores))
    co = []
    for i, v in enumerate(valores):
        co += [primero + i, v]
    c.keyframe_points.foreach_set("co", co)
    if lineal:
        c.keyframe_points.foreach_set("interpolation", [1] * len(valores))  # 1 = LINEAR
    c.update()


def material_luz(nombre, fuerza=7.0):
    """Material que brilla con el color del objeto: RGB = tono, alfa = brillo.
    Así cada objeto se anima con obj.color y comparten un solo material."""
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mult = nt.nodes.new("ShaderNodeMath")
    mult.operation = "MULTIPLY"
    mult.inputs[1].default_value = fuerza
    emi = nt.nodes.new("ShaderNodeEmission")
    salida = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(info.outputs["Color"], emi.inputs["Color"])
    nt.links.new(info.outputs["Alpha"], mult.inputs[0])
    nt.links.new(mult.outputs[0], emi.inputs["Strength"])
    nt.links.new(emi.outputs[0], salida.inputs["Surface"])
    return m


def color(tono, sat=1.0, luz=1.0):
    return colorsys.hsv_to_rgb(tono % 1.0, sat, luz)


def tono_de(i):
    # Frío (azul-violeta, 0.68) en las partes tranquilas, caliente
    # (magenta-naranja, 0.95 -> 1.05) en el drop.
    return 0.68 + 0.37 * parte[i]


# ---------------------------------------------------------------- escena

vaciar_escena()
escena = bpy.context.scene
escena.render.fps = FPS
escena.frame_start = 1 + int(DESDE * FPS)
escena.frame_end = min(N, int(HASTA * FPS)) if HASTA else N

for motor in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        escena.render.engine = motor
        break
    except TypeError:
        pass
# AgX con más contraste, para que los colores no se laven a blanco.
for look in ("AgX - Punchy", "Punchy"):
    try:
        escena.view_settings.look = look
        break
    except TypeError:
        pass
ev = escena.eevee
for prop, val in (("use_raytracing", True), ("taa_render_samples", 16), ("use_shadows", True)):
    if hasattr(ev, prop):
        setattr(ev, prop, val)

# Mundo casi negro, con un azul muy oscuro.
mundo = bpy.data.worlds.new("Mundo")
escena.world = mundo
mundo.use_nodes = True
fondo = mundo.node_tree.nodes.get("Background")
fondo.inputs["Color"].default_value = (0.002, 0.002, 0.006, 1)
fondo.inputs["Strength"].default_value = 1.0

# Piso oscuro y brilloso que refleja las luces.
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
piso = bpy.context.object
piso.name = "Piso"
mp = bpy.data.materials.new("Piso")
mp.use_nodes = True
bsdf = mp.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.01, 0.01, 0.015, 1)
bsdf.inputs["Roughness"].default_value = 0.18
bsdf.inputs["Metallic"].default_value = 0.7
piso.data.materials.append(mp)

luz = material_luz("Luz")

# Esfera central: late con el bombo.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1.0, location=(0, 0, 1.6))
esfera = bpy.context.object
esfera.name = "Esfera"
bpy.ops.object.shade_smooth()
esfera.data.materials.append(luz)
tam = [1.0 + 0.35 * graves[i] + 0.25 * pegada[i] for i in range(N)]
for eje in range(3):
    animar(esfera, "scale", eje, tam)
rgb = [color(tono_de(i) + 0.08) for i in range(N)]
for c in range(3):
    animar(esfera, "color", c, [rgb[i][c] for i in range(N)])
animar(esfera, "color", 3, [0.1 + 0.35 * graves[i] + 0.5 * pegada[i] for i in range(N)])

# Anillo de barras.
BARRAS = 48
RADIO = 4.2
for b in range(BARRAS):
    ang = 2 * math.pi * b / BARRAS
    bpy.ops.mesh.primitive_cube_add(size=1, location=(RADIO * math.cos(ang), RADIO * math.sin(ang), 0))
    barra = bpy.context.object
    barra.name = "Barra %02d" % b
    barra.rotation_euler = (0, 0, ang)
    barra.dimensions = (0.16, 0.16, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Origen abajo, para que crezca hacia arriba.
    barra.data.transform(__import__("mathutils").Matrix.Translation((0, 0, 0.5)))
    barra.data.materials.append(luz)
    # Posición en el anillo -> qué banda sigue: atrás graves, costados medios,
    # adelante agudos (espejado, para que quede simétrico).
    p = abs(((b / BARRAS) * 2) % 2 - 1)  # 0 adelante ... 1 atrás
    wg, wm, wa = max(0, p - 0.5) * 2, 1 - abs(p - 0.5) * 2, max(0, 0.5 - p) * 2
    retraso = b % 6
    alto, brillo = [], []
    for i in range(N):
        k = max(0, i - retraso)
        v = wg * graves[k] + wm * medios[k] + wa * agudos[k]
        alto.append(0.15 + 3.2 * v * (0.55 + 0.45 * parte[k]))
        brillo.append(0.08 + 0.9 * v)
    animar(barra, "scale", 2, alto)
    tono_barra = [tono_de(i) + 0.12 * (b / BARRAS) for i in range(N)]
    for c in range(3):
        animar(barra, "color", c, [color(tono_barra[i])[c] for i in range(N)])
    animar(barra, "color", 3, brillo)

# Título al principio, que se apaga a los 4 segundos. Va de frente a donde
# arranca la cámara (girada GIRO_INICIAL alrededor del centro).
GIRO_INICIAL = math.radians(-50)
bpy.ops.object.text_add(location=(3.0 * math.sin(GIRO_INICIAL), -3.0 * math.cos(GIRO_INICIAL), 3.4),
                        rotation=(math.radians(80), 0, GIRO_INICIAL))
titulo = bpy.context.object
titulo.name = "Titulo"
# El título lo pasa quien lo llama (pantallas.js) por la variable VIDEOCLIP_TITULO.
titulo.data.body = os.environ.get("VIDEOCLIP_TITULO", "NOOK")
titulo.data.align_x = "CENTER"
titulo.data.size = 1.0
titulo.data.extrude = 0.03
titulo.data.materials.append(luz)
for c, v in enumerate(color(0.68, 0.3)):
    animar(titulo, "color", c, [v, v], primero=1)
apagado = [1.0 if i < 3 * FPS else max(0.0, 1 - (i - 3 * FPS) / FPS) for i in range(5 * FPS)]
animar(titulo, "color", 3, apagado)
# Apagado no alcanza: sin brillo queda un texto negro. Se achica a cero.
for eje in range(3):
    animar(titulo, "scale", eje, [1.0 if i < 4 * FPS else 0.0 for i in range(5 * FPS)])

# Cámara: gira despacio alrededor del centro y se acerca un poco en cada golpe.
bpy.ops.object.empty_add(location=(0, 0, 1.4))
centro = bpy.context.object
centro.name = "Centro"
bpy.ops.object.empty_add(location=(0, 0, 0))
giro = bpy.context.object
giro.name = "Giro"
distancia, altura = (12.5, 3.6) if FORMATO == "16x9" else (14.5, 5.5)
bpy.ops.object.camera_add(location=(0, -distancia, altura))
cam = bpy.context.object
cam.parent = giro
escena.camera = cam
seguir = cam.constraints.new("TRACK_TO")
seguir.target = centro
seguir.track_axis = "TRACK_NEGATIVE_Z"
seguir.up_axis = "UP_Y"
animar(giro, "rotation_euler", 2, [GIRO_INICIAL + math.radians(130) * i / N for i in range(N)])
animar(cam.data, "lens", None,[35 + 3.0 * pegada[i] for i in range(N)])

# Un poco de luz de relleno para que el piso no quede negro del todo.
bpy.ops.object.light_add(type="AREA", location=(0, 0, 9))
bpy.context.object.data.energy = 300
bpy.context.object.data.size = 12

# ---------------------------------------------------------------- brillo (bloom)

def poner_brillo():
    """Resplandor alrededor de las luces con el nodo Glare del compositor.
    La API del compositor cambió en Blender 5; si falla, sale sin brillo."""
    try:
        ng = bpy.data.node_groups.new("Brillo", "CompositorNodeTree")
        escena.compositing_node_group = ng
        capas = ng.nodes.new("CompositorNodeRLayers")
        glare = ng.nodes.new("CompositorNodeGlare")
        salida = ng.nodes.new("NodeGroupOutput")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        for nombre, valor in (("Type", "Bloom"), ("Threshold", 0.6), ("Strength", 0.9), ("Size", 0.6)):
            if nombre in glare.inputs:
                glare.inputs[nombre].default_value = valor
        if hasattr(glare, "glare_type"):
            glare.glare_type = "BLOOM"
        ng.links.new(capas.outputs["Image"], glare.inputs["Image"])
        ng.links.new(glare.outputs["Image"], salida.inputs[0])
        print("Brillo: compositor de Blender 5")
        return
    except Exception as e:
        print("Brillo (Blender 5) no se pudo:", e)
    try:
        escena.use_nodes = True
        nt = escena.node_tree
        nt.nodes.clear()
        capas = nt.nodes.new("CompositorNodeRLayers")
        glare = nt.nodes.new("CompositorNodeGlare")
        comp = nt.nodes.new("CompositorNodeComposite")
        glare.glare_type = "BLOOM"
        nt.links.new(capas.outputs["Image"], glare.inputs["Image"])
        nt.links.new(glare.outputs["Image"], comp.inputs["Image"])
        print("Brillo: compositor viejo")
    except Exception as e:
        print("Sin brillo:", e)


poner_brillo()

# ---------------------------------------------------------------- audio y salida

ed = escena.sequence_editor_create()
tiras = ed.strips if hasattr(ed, "strips") else ed.sequences
tiras.new_sound("Cancion", d["archivo"], 1, 1)

r = escena.render
r.resolution_x, r.resolution_y = (1920, 1080) if FORMATO == "16x9" else (1080, 1920)
r.resolution_percentage = ESCALA
im = r.image_settings
if hasattr(im, "media_type"):
    im.media_type = "VIDEO"
im.file_format = "FFMPEG"
ff = r.ffmpeg
ff.format = "MPEG4"
ff.codec = "H264"
ff.constant_rate_factor = "HIGH"
ff.audio_codec = "AAC"
ff.audio_bitrate = 320
ff.audio_channels = "STEREO"
ff.audio_mixrate = 44100
r.filepath = SALIDA

os.makedirs(os.path.dirname(os.path.abspath(SALIDA)), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(SALIDA)[0] + ".blend")
print("Renderizando cuadros %d a %d en %s %d%%" % (escena.frame_start, escena.frame_end, FORMATO, ESCALA))
bpy.ops.render.render(animation=True)
print("Listo:", SALIDA)
