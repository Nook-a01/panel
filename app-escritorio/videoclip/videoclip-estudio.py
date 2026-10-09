# Videoclip con el modelo del estudio de Nook.
#
#   blender -b "D:\Nook\Videos\Blender\...\Estudio y animacion.blend" -P videoclip-estudio.py -- \
#       cancion.wav pantallas\ salida.mp4 [desde_cuadro hasta_cuadro] [escala_%] [muestras]
#
# El modelo (D:\Nook\Videos\Blender\music_studio_at_home - Reversion #4\) es la
# escena que Agustín usa para todos sus videoclips: él entra al estudio, pasa
# por el cartel grande y el cartel luminoso, se sienta y arranca la música. Las
# cámaras cambian solas con los marcadores de la línea de tiempo.
#
# Este script NO toca el modelo: lo primero que hace es guardarlo como un .blend
# nuevo al lado de la salida. Después cambia sólo lo que es de cada canción:
#   - monitor principal  <- pantallas\visualizador.mp4 (videoclip.py, a 60 fps)
#   - monitor de al lado <- pantallas\monitor-2.mp4   (espectro de la canción)
#   - cartel grande      <- pantallas\cartel-grande.mp4 (título, en bucle)
#   - cartel luminoso    <- pantallas\cartel-luminoso.mp4 (texto que corre)
#   - el audio de la canción, desde que se sienta (INICIO_MUSICA)
# y renderiza en H.264 + AAC 320 a 60 fps.

import bpy
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
if len(argv) < 3:
    raise SystemExit("Uso: ... -- cancion.wav pantallas\\ salida.mp4 [desde hasta] [escala_%] [muestras]")
AUDIO, PANTALLAS, SALIDA = (os.path.abspath(a) for a in argv[:3])
DESDE = int(argv[3]) if len(argv) > 3 else None
HASTA = int(argv[4]) if len(argv) > 4 else None
ESCALA = int(argv[5]) if len(argv) > 5 else 100
MUESTRAS = int(argv[6]) if len(argv) > 6 else 32

# Cuadro en el que en el modelo arrancan las pantallas del escritorio (él ya
# está sentado y le da play). La música entra ahí.
INICIO_MUSICA = 830

# Video viejo del modelo -> archivo nuevo, cuadro en que arranca y si se repite.
PANTALLAS_MODELO = {
    "SONY -- BZRP Freestyle Session #2.mp4": ("visualizador.mp4", INICIO_MUSICA, False),
    "2024-10-21 21-08-29.mp4": ("monitor-2.mp4", INICIO_MUSICA, False),
    "Cartel Grande.mp4": ("cartel-grande.mp4", 200, True),
    "Cartel-Luminoso.mp4": ("cartel-luminoso.mp4", 200, True),
}

escena = bpy.context.scene
os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
blend_nuevo = os.path.splitext(SALIDA)[0] + ".blend"
if os.path.normcase(blend_nuevo) == os.path.normcase(bpy.data.filepath):
    raise SystemExit("La salida no puede pisar el modelo")
bpy.ops.wm.save_as_mainfile(filepath=blend_nuevo, copy=False)
print("Copia de trabajo:", blend_nuevo)

# ---------------------------------------------------------------- pantallas

for img in bpy.data.images:
    if img.name not in PANTALLAS_MODELO:
        continue
    archivo, inicio, ciclico = PANTALLAS_MODELO[img.name]
    ruta = os.path.join(PANTALLAS, archivo)
    if not os.path.exists(ruta):
        raise SystemExit("Falta la pantalla " + ruta)
    img.filepath = ruta
    img.source = "MOVIE"
    img.reload()
    cuadros = img.frame_duration
    # El ImageUser (cuadros, desde, repetir) vive en cada nodo que usa la imagen.
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image == img:
                iu = n.image_user
                iu.frame_duration = cuadros
                iu.frame_start = inicio
                iu.frame_offset = 0
                iu.use_cyclic = ciclico
                iu.use_auto_refresh = True
    print("Pantalla %-40s <- %s (%d cuadros desde %d%s)" % (img.name, archivo, cuadros, inicio, ", en bucle" if ciclico else ""))

# ---------------------------------------------------------------- audio

ed = escena.sequence_editor_create()
tiras = ed.strips if hasattr(ed, "strips") else ed.sequences
for t in list(tiras):
    if t.type == "SOUND":
        tiras.remove(t)
sonido = tiras.new_sound("Cancion", AUDIO, 1, INICIO_MUSICA)
fin_cancion = sonido.frame_final_end
print("Audio desde el cuadro %d hasta el %d" % (INICIO_MUSICA, fin_cancion))

# ---------------------------------------------------------------- salida

escena.frame_start = DESDE if DESDE is not None else 0
escena.frame_end = HASTA if HASTA is not None else fin_cancion + escena.render.fps  # 1 s de cola
r = escena.render
r.resolution_x, r.resolution_y = 1920, 1080
r.resolution_percentage = ESCALA
if hasattr(escena.eevee, "taa_render_samples"):
    escena.eevee.taa_render_samples = MUESTRAS
# Se renderiza cuadro por cuadro a JPG y no directo a MP4: el 05/10/2026 un
# render de horas se cortó en el 12 % y el MP4 quedó inservible. Así, si se
# corta, se vuelve a lanzar igual y saltea los cuadros que ya están.
CUADROS = os.path.splitext(SALIDA)[0] + " - cuadros"
os.makedirs(CUADROS, exist_ok=True)
# Un archivo vacío es el cuadro que se estaba haciendo cuando se cortó: se
# borra para que se haga de nuevo (si no, Blender lo da por hecho).
for f in os.listdir(CUADROS):
    if os.path.getsize(os.path.join(CUADROS, f)) == 0:
        os.remove(os.path.join(CUADROS, f))
print("Cuadros ya hechos:", len(os.listdir(CUADROS)), flush=True)
im = r.image_settings
if hasattr(im, "media_type"):
    im.media_type = "IMAGE"
im.file_format = "JPEG"
im.quality = 95
r.use_overwrite = False
r.use_placeholder = True
r.use_file_extension = True
r.filepath = os.path.join(CUADROS, "#####")
bpy.ops.wm.save_mainfile()

print("Renderizando cuadros %d a %d (%d%%, %d muestras) en %s" % (escena.frame_start, escena.frame_end, ESCALA, MUESTRAS, CUADROS), flush=True)
bpy.ops.render.render(animation=True)

# Un cuadro vacío es un "placeholder" de un render que se cortó: hay que
# borrarlo y relanzar para que se haga de nuevo.
vacios = [f for f in os.listdir(CUADROS) if os.path.getsize(os.path.join(CUADROS, f)) == 0]
if vacios:
    for f in vacios:
        os.remove(os.path.join(CUADROS, f))
    raise SystemExit("Quedaron %d cuadros sin hacer (borrados): volver a lanzar" % len(vacios))

# ---------------------------------------------------------------- armar el MP4

import shutil
import subprocess

ffmpeg = os.environ.get("FFMPEG") or shutil.which("ffmpeg") or os.path.join(
    os.path.expanduser("~"), "AppData", "Local", "Microsoft", "WinGet", "Packages",
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-9.0.2-full_build", "bin", "ffmpeg.exe")
retraso = (INICIO_MUSICA - escena.frame_start) / escena.render.fps
comando = [ffmpeg, "-v", "error", "-y",
           "-framerate", str(escena.render.fps), "-start_number", str(escena.frame_start),
           "-i", os.path.join(CUADROS, "%05d.jpg"),
           "-i", AUDIO,
           "-map", "0:v", "-map", "1:a",
           # Silencio al principio hasta que él se sienta (adelay va en ms).
           "-af", "adelay=%d:all=1" % round(retraso * 1000),
           "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", SALIDA]
print("Armando el MP4:", " ".join(comando), flush=True)
subprocess.run(comando, check=True)
print("Listo:", SALIDA, flush=True)
