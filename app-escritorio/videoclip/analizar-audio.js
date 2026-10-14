// Analiza el master de una canción para el videoclip.
//
// Saca, cuadro por cuadro (30 por segundo), cuánto suenan los graves (bombo y
// bajo), los medios (acordes, voces, lead) y los agudos (hats, platillos), más
// dónde cae cada golpe de bombo. Blender lee ese JSON y anima la escena con él
// (videoclip.py). Nada sale de la máquina: se decodifica con ffmpeg local.
//
// Uso: node analizar-audio.js cancion.wav salida.json [ffmpeg.exe]

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FPS = 30;
const SR = 44100;

function buscarFfmpeg(dado) {
  const candidatos = [
    dado,
    process.env.FFMPEG,
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages",
      "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-9.0.2-full_build", "bin", "ffmpeg.exe"),
  ].filter(Boolean);
  for (const c of candidatos) if (fs.existsSync(c)) return c;
  return "ffmpeg"; // que lo busque en el PATH
}

// Decodifica a mono float32 pasando antes por el filtro de la banda.
function banda(ffmpeg, archivo, filtro) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-i", archivo, "-af", filtro + ",aformat=channel_layouts=mono",
    "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error("ffmpeg: " + r.stderr.toString());
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

// Energía RMS de cada cuadro de video.
function porCuadro(muestras) {
  const n = Math.floor(muestras.length / (SR / FPS));
  const paso = SR / FPS, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const a = Math.floor(i * paso), z = Math.floor((i + 1) * paso);
    for (let k = a; k < z; k++) s += muestras[k] * muestras[k];
    out[i] = Math.sqrt(s / (z - a));
  }
  return out;
}

// Lleva la curva a 0..1 tomando el percentil 97 como tope, para que un pico
// suelto no aplaste todo lo demás.
function normalizar(v) {
  const orden = [...v].sort((a, b) => a - b);
  const tope = orden[Math.floor(orden.length * 0.97)] || 1;
  return v.map(x => Math.min(1, x / tope));
}

// Golpes de bombo: subidas bruscas de los graves, separadas al menos 0,2 s.
function golpes(graves) {
  const out = [];
  let ultimo = -99;
  for (let i = 1; i < graves.length; i++) {
    const subida = graves[i] - graves[i - 1];
    if (subida > 0.18 && graves[i] > 0.45 && i - ultimo >= FPS * 0.2) { out.push(i); ultimo = i; }
  }
  return out;
}

// Energía general suavizada en ventanas de 2 s: sirve para saber en qué parte
// de la canción se está (intro tranquila, drop fuerte, puente).
function energiaSuave(g, m, a) {
  const crudo = g.map((x, i) => (x + m[i] + a[i]) / 3);
  const r = FPS;
  return crudo.map((_, i) => {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - r); k < Math.min(crudo.length, i + r); k++) { s += crudo[k]; n++; }
    return s / n;
  });
}

function main() {
  const [, , archivo, salida, dado] = process.argv;
  if (!archivo || !salida) { console.error("Uso: node analizar-audio.js cancion.wav salida.json [ffmpeg.exe]"); process.exit(1); }
  const ffmpeg = buscarFfmpeg(dado);
  const graves = normalizar(porCuadro(banda(ffmpeg, archivo, "lowpass=f=150,lowpass=f=150")));
  const medios = normalizar(porCuadro(banda(ffmpeg, archivo, "highpass=f=300,lowpass=f=3000")));
  const agudos = normalizar(porCuadro(banda(ffmpeg, archivo, "highpass=f=5000,highpass=f=5000")));
  const n = Math.min(graves.length, medios.length, agudos.length);
  const r3 = v => v.slice(0, n).map(x => Math.round(x * 1000) / 1000);
  const datos = {
    archivo: path.resolve(archivo),
    fps: FPS,
    cuadros: n,
    segundos: n / FPS,
    graves: r3(graves),
    medios: r3(medios),
    agudos: r3(agudos),
    energia: r3(energiaSuave(graves, medios, agudos)),
    golpes: golpes(graves.slice(0, n)),
  };
  fs.writeFileSync(salida, JSON.stringify(datos));
  console.log(`${n} cuadros (${datos.segundos.toFixed(1)} s), ${datos.golpes.length} golpes de bombo -> ${salida}`);
}

main();
