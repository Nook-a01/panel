# Foto cuadrada de 3000 × 3000 para la tapa del single.
#
#   blender -b "<canción>\Videoclip\<título> - videoclip estudio 16x9.blend" -P tapa.py -- foto.png [cámara] [cuadro]
#
# Se abre la copia de trabajo que dejó videoclip-estudio.py (ya tiene las
# pantallas y el audio de esta canción), nunca el modelo. No se guarda nada en
# el .blend: sólo se escribe la foto. El título lo agrega después ffmpeg.

import bpy
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
FOTO = argv[0]
CAMARA = argv[1] if len(argv) > 1 else "Detalle"
CUADRO = int(argv[2]) if len(argv) > 2 else 1200

escena = bpy.context.scene
camara = bpy.data.objects.get(CAMARA) or bpy.data.objects.get(CAMARA + " ")
if camara is None:
    raise SystemExit("No existe la cámara " + CAMARA + ". Hay: " + ", ".join(o.name for o in bpy.data.objects if o.type == "CAMERA"))
# Los marcadores con cámara mandan sobre escena.camera: se sacan (no se guarda).
escena.timeline_markers.clear()
escena.camera = camara
escena.frame_set(CUADRO)

r = escena.render
r.resolution_x = r.resolution_y = 3000
r.resolution_percentage = 100
if hasattr(escena.eevee, "taa_render_samples"):
    escena.eevee.taa_render_samples = 64
im = r.image_settings
if hasattr(im, "media_type"):
    im.media_type = "IMAGE"
im.file_format = "PNG"
im.color_mode = "RGB"
r.filepath = FOTO
bpy.ops.render.render(write_still=True)
print("Foto:", FOTO)
