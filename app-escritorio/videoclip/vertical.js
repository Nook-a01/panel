// Versión vertical (9:16, TikTok) del videoclip del estudio, sin volver a
// renderizar: recorta el video horizontal siguiendo la acción.
//
// El recorte sigue un plan de posiciones (vertical-estudio.json): para cada
// cuadro clave, dónde va el centro del recorte (0 = borde izquierdo, 1 = borde
// derecho del video horizontal). Entre dos claves se mueve en línea recta; una
// clave con "corte": true salta de golpe (cuando el modelo cambia de cámara).
// Como el modelo del estudio es siempre el mismo, el plan sirve para todas las
// canciones.
//
// Uso: node vertical.js horizontal.mp4 salida.mp4 [plan.json] [ffmpeg.exe]

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const [, , entrada, salida, planArg, ffmpegArg] = process.argv;
if (!entrada || !salida) {
  console.error("Uso: node vertical.js horizontal.mp4 salida.mp4 [plan.json] [ffmpeg.exe]");
  process.exit(1);
}
const ffmpeg = [ffmpegArg, process.env.FFMPEG,
  path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages",
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-9.0.2-full_build", "bin", "ffmpeg.exe")]
  .find(p => p && fs.existsSync(p)) || "ffmpeg";
const plan = JSON.parse(fs.readFileSync(planArg || path.join(__dirname, "vertical-estudio.json"), "utf8"));

const ANCHO = 1920, ALTO = 1080;
const RECORTE = Math.round(ALTO * 9 / 16 / 2) * 2; // 608 px, par para H.264
const fps = plan.fps;

// x (borde izquierdo del recorte, en píxeles) para un centro dado, sin salirse del cuadro.
const xDe = c => Math.max(0, Math.min(ANCHO - RECORTE, Math.round(c * ANCHO - RECORTE / 2)));

// Arma la expresión de ffmpeg: tramos lineales anidados con if(lt(t, ...)).
function expresion(claves) {
  const k = [...claves].sort((a, b) => a.cuadro - b.cuadro);
  let expr = String(xDe(k[k.length - 1].centro));
  for (let i = k.length - 2; i >= 0; i--) {
    const a = k[i], b = k[i + 1];
    const ta = (a.cuadro / fps).toFixed(4), tb = (b.cuadro / fps).toFixed(4);
    const xa = xDe(a.centro), xb = xDe(b.centro);
    // Si la clave siguiente es un corte, este tramo se queda quieto hasta el salto.
    const tramo = b.corte || xa === xb ? String(xa) : `${xa}+(${xb - xa})*(t-${ta})/(${tb}-${ta})`;
    expr = `if(lt(t,${tb}),${tramo},${expr})`;
  }
  return expr;
}

const x = expresion(plan.claves);
const filtro = `crop=${RECORTE}:${ALTO}:'${x}':0,scale=1080:1920:flags=lanczos,setsar=1,unsharp=5:5:0.6`;
const r = spawnSync(ffmpeg, ["-v", "error", "-y", "-i", entrada, "-vf", filtro,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "copy", "-movflags", "+faststart", salida], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Vertical listo: ${salida} (${plan.claves.length} claves, recorte de ${RECORTE} px)`);
