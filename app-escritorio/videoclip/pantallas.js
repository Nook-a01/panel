// Arma los cuatro videos que van en las pantallas del modelo del estudio, para
// una canción:
//
//   visualizador.mp4     monitor principal: la escena de videoclip.py (esfera y
//                        barras), al 50 % y pasada a 60 fps como el modelo
//   monitor-2.mp4        monitor de al lado: espectrograma de la canción
//   cartel-grande.mp4    cartel de la entrada (2:1): el título en neón que late
//                        al tempo, espejado porque el plano tiene la UV invertida
//   cartel-luminoso.mp4  cartel luminoso (8:1): "NOOK • TÍTULO •" que corre
//
// Uso: node pantallas.js master.wav audio.json carpeta-pantallas "TÍTULO" BPM
// Va escribiendo "PASO n/4 ..." para que la app muestre en qué anda. Si un
// video ya existe se saltea: para rehacerlo, se borra.

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const [, , master, datos, dir, titulo = "NOOK", bpmArg = "120"] = process.argv;
if (!master || !datos || !dir) {
  console.error('Uso: node pantallas.js master.wav audio.json carpeta-pantallas "TÍTULO" BPM');
  process.exit(1);
}
const bpm = Number(bpmArg) || 120;
const ffmpeg = [process.env.FFMPEG, path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages",
  "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-9.0.2-full_build", "bin", "ffmpeg.exe")]
  .find(p => p && fs.existsSync(p)) || "ffmpeg";
const blender = process.env.BLENDER || "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
const FUENTE = "C\\:/Windows/Fonts/bahnschrift.ttf";
fs.mkdirSync(dir, { recursive: true });

// drawtext necesita escapar : ' \ y % del texto.
const texto = t => String(t).replace(/\\/g, "\\\\").replace(/'/g, "’").replace(/:/g, "\\:");

function correr(prog, args, env) {
  const r = spawnSync(prog, args, { stdio: "inherit", env: Object.assign({}, process.env, env || {}) });
  if (r.status !== 0) { console.error("Falló:", path.basename(prog)); process.exit(r.status || 1); }
}
function hecho(nombre) {
  const p = path.join(dir, nombre);
  return fs.existsSync(p) && fs.statSync(p).size > 0;
}

// 1. Visualizador (lo más largo: ~15-25 min).
console.log("PASO 1/4 visualizador del monitor principal");
if (!hecho("visualizador.mp4")) {
  const d = JSON.parse(fs.readFileSync(datos, "utf8"));
  const tmp = path.join(dir, "visualizador-30.mp4");
  correr(blender, ["-b", "-P", path.join(__dirname, "videoclip.py"), "--", datos, tmp, "16x9", "0", String(d.segundos), "50"],
    { VIDEOCLIP_TITULO: titulo });
  correr(ffmpeg, ["-v", "error", "-y", "-i", tmp, "-an", "-vf", "fps=60", "-c:v", "libx264", "-crf", "18", path.join(dir, "visualizador.mp4")]);
  fs.rmSync(tmp, { force: true });
  fs.rmSync(path.join(dir, "visualizador-30.blend"), { force: true });
}

// 2. Monitor de al lado: espectrograma que avanza, con una línea rosa abajo.
console.log("PASO 2/4 espectrograma del monitor de al lado");
if (!hecho("monitor-2.mp4")) {
  correr(ffmpeg, ["-v", "error", "-y", "-i", master, "-filter_complex",
    "[0:a]showspectrum=s=1600x860:slide=scroll:color=magma:scale=log:fscale=log:legend=0,fps=60," +
    "pad=1600:888:0:0:color=0x0a0614,drawbox=x=0:y=868:w=1600:h=14:color=0xff2bd6:t=fill,format=yuv420p",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", path.join(dir, "monitor-2.mp4")]);
}

// 3. Cartel grande: título en neón rosa, "NOOK" abajo, brillo que late al tempo.
console.log("PASO 3/4 cartel grande");
if (!hecho("cartel-grande.mp4")) {
  const tam = Math.max(120, Math.min(330, Math.floor(2600 / Math.max(4, titulo.length))));
  correr(ffmpeg, ["-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=0x0a0614:s=1600x800:d=8:r=60",
    "-f", "lavfi", "-i", "color=c=black@0.0:s=1600x800:d=8:r=60,format=rgba",
    "-filter_complex",
    `[1]drawtext=fontfile='${FUENTE}':text='${texto(titulo)}':fontsize=${tam}:expansion=none:fontcolor=0xff2bd6:x=(w-tw)/2:y=(h-th)/2-70,` +
    `drawtext=fontfile='${FUENTE}':text='NOOK':fontsize=110:fontcolor=0xffffff:x=(w-tw)/2:y=h-200,split[t][g];` +
    `[g]boxblur=28:2[glow];[0][glow]overlay[a];[a][t]overlay,eq=brightness='0.06*cos(2*PI*t*${bpm}/60)':eval=frame,hflip,format=yuv420p`,
    "-c:v", "libx264", "-crf", "18", path.join(dir, "cartel-grande.mp4")]);
}

// 4. Cartel luminoso: el texto corre en bucle sin saltos (tres copias pegadas).
console.log("PASO 4/4 cartel luminoso");
if (!hecho("cartel-luminoso.mp4")) {
  const unidad = path.join(dir, "unidad.png");
  const frase = `NOOK  •  ${titulo}  •`;
  const ancho = Math.max(800, Math.round(frase.length * 57));
  correr(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black@0.0:s=${ancho}x200:d=1:r=60,format=rgba`,
    "-vf", `drawtext=fontfile='${FUENTE}':text='${texto(frase)}':expansion=none:fontsize=120:fontcolor=0xff2bd6:x=(w-tw)/2:y=(h-th)/2`,
    "-frames:v", "1", unidad]);
  const vuelta = ancho / 240;  // segundos que tarda una copia en pasar
  correr(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=0x0a0614:s=1600x200:d=${(vuelta * 2).toFixed(3)}:r=60`,
    "-loop", "1", "-framerate", "60", "-t", (vuelta * 2).toFixed(3), "-i", unidad,
    "-filter_complex", `[1]format=rgba,split=3[a][b][c];[a][b][c]hstack=inputs=3,crop=1600:200:'mod(t*240,${ancho})':0,split[t][g];` +
    "[g]boxblur=14:2[glow];[0][glow]overlay[x];[x][t]overlay,format=yuv420p",
    "-t", (vuelta * 2).toFixed(3), "-c:v", "libx264", "-crf", "18", path.join(dir, "cartel-luminoso.mp4")]);
  fs.rmSync(unidad, { force: true });
}
console.log("LISTO pantallas en " + dir);
