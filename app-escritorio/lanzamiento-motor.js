// Estudio — Mezcla, Videoclip, Campaña y Métricas: la parte que toca la máquina.
//
// Lo registra estudio-motor.js (sigue siendo la única puerta al disco). Todo
// trabaja sobre una canción: una carpeta de D:\Nook\Fl Studio\Proyectos\Mis
// canciones\<género>\<canción>. Los trabajos largos (pantallas, render de
// Blender, vertical) corren como procesos aparte que siguen aunque se cierre
// el Estudio; su estado se lee de los archivos que dejan.
//
// QUÉ NO HACE
// - No publica nada ni entra a ninguna cuenta: la Campaña prepara los posts y
//   cada publicación la hace Agustín.
// - Sólo sale a internet en Métricas, cuando se toca «Actualizar YouTube», y
//   sólo a la API de YouTube con la clave que escribió Agustín.
// - Nunca toca el modelo del videoclip (videoclip-estudio.py trabaja sobre una copia).

const { ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fss = require("node:fs");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");

const RAIZ = "D:\\Nook\\Fl Studio\\Proyectos\\Mis canciones";
const BLENDER = "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
const MODELO = "D:\\Nook\\Videos\\Blender\\music_studio_at_home - Reversion #4\\Estudio y animacion.blend";
const INICIO_MUSICA = 830;           // cuadro del modelo en que entra la canción (60 fps)
const FPS_MODELO = 60;
const VIDEOCLIP = path.join(__dirname, "videoclip");
const FFMPEG = [process.env.FFMPEG, path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages",
  "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-9.0.2-full_build", "bin", "ffmpeg.exe")]
  .find(p => p && fss.existsSync(p)) || "ffmpeg";
// node para los scripts: el que trae Electron hace de node con ELECTRON_RUN_AS_NODE.
const NODE = process.execPath;

let datos = null;     // función de estudio-motor para la carpeta de datos
let escanear = null;  // escanearPlugins de estudio-motor

async function existe(p) { try { await fs.access(p); return true; } catch { return false; } }
async function leerJson(p, d) { try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return d; } }
async function escribirJson(p, o) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(o, null, 2) + "\n", "utf8");
}
async function tamano(p) { try { return (await fs.stat(p)).size; } catch { return 0; } }

/* ---------------- canciones ---------------- */

// "EDM 777 - La menor 124 BPM - FLEX (05-10-2026)" -> título, tonalidad, BPM, fecha.
function leerNombre(carpeta) {
  const partes = carpeta.split(" - ");
  const bpm = (carpeta.match(/(\d{2,3})\s*BPM/i) || [])[1];
  const fecha = (carpeta.match(/\((\d{2}-\d{2}-\d{4})\)/) || [])[1];
  const ton = partes[1] ? partes[1].replace(/\s*\d{2,3}\s*BPM.*/i, "").trim() : "";
  return { titulo: partes[0].trim(), tonalidad: ton, bpm: bpm ? Number(bpm) : null, fecha: fecha || null };
}

// Sólo se aceptan carpetas que estén adentro de Mis canciones: la pantalla no
// puede pedir cualquier ruta del disco.
function carpetaDe(id) {
  const c = path.resolve(RAIZ, id);
  if (!c.toLowerCase().startsWith(RAIZ.toLowerCase() + path.sep)) throw new Error("Esa carpeta no es de Mis canciones.");
  return c;
}

async function listarCanciones() {
  const lista = [];
  let generos = [];
  try { generos = await fs.readdir(RAIZ, { withFileTypes: true }); } catch { return { raiz: RAIZ, canciones: [] }; }
  for (const g of generos) {
    if (!g.isDirectory()) continue;
    for (const c of await fs.readdir(path.join(RAIZ, g.name), { withFileTypes: true })) {
      if (!c.isDirectory()) continue;
      const carpeta = path.join(RAIZ, g.name, c.name);
      const archivos = await fs.readdir(carpeta);
      lista.push(Object.assign({ id: path.join(g.name, c.name), genero: g.name, carpeta: c.name,
        tieneFlp: archivos.some(a => a.toLowerCase().endsWith(".flp")),
        tieneMaster: archivos.some(a => / - master\.wav$/i.test(a)) }, leerNombre(c.name)));
    }
  }
  lista.sort((a, b) => (b.fecha || "").split("-").reverse().join("").localeCompare((a.fecha || "").split("-").reverse().join("")));
  return { raiz: RAIZ, canciones: lista };
}

/* ---------------- medir volumen ---------------- */

function correr(prog, args, opciones) {
  return new Promise((ok, mal) => {
    execFile(prog, args, Object.assign({ maxBuffer: 64 << 20, windowsHide: true }, opciones || {}), (e, salida, err) => {
      if (e) { e.message += "\n" + String(err).slice(-800); return mal(e); }
      ok({ salida: String(salida), err: String(err) });
    });
  });
}

// Mide con el filtro ebur128 de ffmpeg (lo mismo que se usó a mano el 05/10).
async function medir(archivo) {
  const { err } = await correr(FFMPEG, ["-hide_banner", "-nostats", "-i", archivo, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const resumen = err.slice(err.lastIndexOf("Summary:"));
  const num = re => { const m = resumen.match(re); return m ? Number(m[1]) : null; };
  const r = { integrado: num(/I:\s+(-?[\d.]+) LUFS/), rango: num(/LRA:\s+(-?[\d.]+) LU/), picoReal: num(/Peak:\s+(-?[\d.]+) dBFS/) };
  const info = await correr(FFMPEG, ["-hide_banner", "-i", archivo]).catch(e => ({ err: e.message }));
  const linea = (info.err.match(/Stream #\d+:\d+.*Audio: ([^\n]+)/) || [])[1] || "";
  r.formato = linea.trim();
  r.hz = Number((linea.match(/(\d+) Hz/) || [])[1]) || null;
  r.bits = /s24|24 bit|pcm_s24/.test(linea) ? 24 : /s16|pcm_s16/.test(linea) ? 16 : /s32|f32|flt/.test(linea) ? 32 : null;
  r.duracion = ((info.err.match(/Duration: ([\d:.]+)/) || [])[1]) || null;
  r.consejos = consejos(r);
  r.ok = r.consejos.every(c => c.ok);
  return r;
}

// Lo aprendido con la EDM 777: con el Fruity Limiter del Master en ATT 0 ms,
// el pico real queda ~1,8 dB arriba del techo, así que el techo va ~2 dB por
// debajo de la meta; y la ganancia del limitador mueve el volumen casi 1 a 1.
function consejos(r) {
  const c = [];
  if (r.integrado != null) {
    const d = +(-14 - r.integrado).toFixed(1);
    c.push(Math.abs(d) <= 0.5
      ? { ok: true, texto: `Volumen ${r.integrado} LUFS: bien (meta −14 ±0,5).` }
      : { ok: false, texto: `Volumen ${r.integrado} LUFS: ${d > 0 ? "subí" : "bajá"} unos ${Math.abs(d)} dB la GAIN del Fruity Limiter del Master.` });
  }
  if (r.picoReal != null) {
    c.push(r.picoReal <= -1
      ? { ok: true, texto: `Pico real ${r.picoReal} dBTP: bien (meta −1 o menos).` }
      : { ok: false, texto: `Pico real ${r.picoReal} dBTP: bajá el CEIL del limitador ${(r.picoReal + 1.2).toFixed(1)} dB (y ATT en 0 ms).` });
  }
  if (r.hz && r.hz !== 44100) c.push({ ok: false, texto: `Está a ${r.hz} Hz: exportalo a 44.100 Hz.` });
  if (r.bits && r.bits !== 24) c.push({ ok: false, texto: `Está en ${r.bits} bits: exportalo en WAV 24 bits (WAV bit depth: 24Bit int).` });
  return c;
}

async function estadoMezcla(id) {
  const carpeta = carpetaDe(id);
  const { titulo } = leerNombre(path.basename(carpeta));
  const archivos = await fs.readdir(carpeta);
  const wav = archivos.find(a => / - master\.wav$/i.test(a));
  const mp3 = archivos.find(a => / - master\.mp3$/i.test(a));
  let pruebas = [];
  try { pruebas = (await fs.readdir(path.join(carpeta, "Pruebas de mezcla"))).filter(a => /\.wav$/i.test(a)); } catch {}
  const medidas = await leerJson(path.join(carpeta, "mezcla.json"), {});
  return { titulo, wav: wav || null, mp3: mp3 || null, pruebas, medidas };
}

// Toma un WAV exportado de FL: si está bien medido, queda como master y se
// arma el MP3 320. El master anterior no se borra: pasa a Pruebas de mezcla.
async function usarComoMaster(id, wav) {
  const carpeta = carpetaDe(id);
  const { titulo } = leerNombre(path.basename(carpeta));
  const medida = await medir(wav);
  const destino = path.join(carpeta, `${titulo} - master.wav`);
  if (path.resolve(wav).toLowerCase() !== destino.toLowerCase()) {
    if (await existe(destino)) {
      const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      await fs.mkdir(path.join(carpeta, "Pruebas de mezcla"), { recursive: true });
      await fs.rename(destino, path.join(carpeta, "Pruebas de mezcla", `${titulo} - master anterior ${sello}.wav`));
    }
    await fs.copyFile(wav, destino);
  }
  const mp3 = path.join(carpeta, `${titulo} - master.mp3`);
  await correr(FFMPEG, ["-v", "error", "-y", "-i", destino, "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "44100", mp3]);
  const medidaMp3 = await medir(mp3);
  const previo = await leerJson(path.join(carpeta, "mezcla.json"), {});
  const todo = Object.assign(previo, { wav: medida, mp3: medidaMp3, fecha: new Date().toISOString(), origen: wav });
  await escribirJson(path.join(carpeta, "mezcla.json"), todo);
  return todo;
}

/* ---------------- mezcla con referencia ----------------
   (13/10/2026) Una canción de referencia SÓLO para la mezcla, medida a fondo
   con ffmpeg: volumen, pico real, rango, balance de graves/medios/agudos,
   cuánto pega (cresta) y ancho estéreo. Se compara con el master. */

function db(salida, clave) {
  const m = String(salida).match(new RegExp(clave + ":\\s*(-?[\\d.]+) dB"));
  return m ? Number(m[1]) : null;
}

async function nivel(archivo, filtro) {
  const { err } = await correr(FFMPEG, ["-hide_banner", "-nostats", "-i", archivo, "-af", (filtro ? filtro + "," : "") + "volumedetect", "-f", "null", "-"]);
  return { medio: db(err, "mean_volume"), maximo: db(err, "max_volume") };
}

async function analizarMezcla(archivo) {
  const base = await medir(archivo);
  const total = await nivel(archivo, "");
  const graves = await nivel(archivo, "lowpass=f=150,lowpass=f=150");
  const medios = await nivel(archivo, "highpass=f=300,lowpass=f=3000");
  const agudos = await nivel(archivo, "highpass=f=5000,highpass=f=5000");
  const mid = await nivel(archivo, "pan=mono|c0=0.5*c0+0.5*c1");
  const side = await nivel(archivo, "pan=mono|c0=0.5*c0-0.5*c1");
  const r1 = x => x == null ? null : Math.round(x * 10) / 10;
  return Object.assign(base, {
    archivo,
    bandas: { graves: r1(graves.medio - total.medio), medios: r1(medios.medio - total.medio), agudos: r1(agudos.medio - total.medio) },
    cresta: r1(total.maximo - total.medio),
    ancho: r1(side.medio - mid.medio),
  });
}

// Qué le falta al master para parecerse a la referencia, en palabras.
function compararMezcla(m, ref) {
  if (!m || !ref) return [];
  const out = [];
  const d = (a, b) => a != null && b != null ? Math.round((a - b) * 10) / 10 : null;
  const dif = (nombre, a, b, umbral, mas, menos) => {
    const x = d(a, b);
    if (x == null) return;
    if (Math.abs(x) <= umbral) out.push({ ok: true, texto: `${nombre}: igual que la referencia (${a} vs ${b}).` });
    else out.push({ ok: false, texto: `${nombre}: tu master tiene ${Math.abs(x)} ${x > 0 ? mas : menos} (${a} vs ${b}).` });
  };
  dif("Volumen (LUFS)", m.integrado, ref.integrado, 1, "dB más", "dB menos");
  dif("Graves", m.bandas && m.bandas.graves, ref.bandas && ref.bandas.graves, 1.5, "dB más de graves", "dB menos de graves");
  dif("Medios", m.bandas && m.bandas.medios, ref.bandas && ref.bandas.medios, 1.5, "dB más de medios", "dB menos de medios");
  dif("Agudos", m.bandas && m.bandas.agudos, ref.bandas && ref.bandas.agudos, 1.5, "dB más de agudos", "dB menos de agudos");
  dif("Pegada (cresta)", m.cresta, ref.cresta, 1.5, "dB más de pegada (menos comprimido)", "dB menos de pegada (más aplastado)");
  dif("Ancho estéreo", m.ancho, ref.ancho, 2, "dB más ancho", "dB más angosto");
  dif("Rango dinámico (LRA)", m.rango, ref.rango, 2, "LU más de variación", "LU menos de variación");
  return out;
}

async function elegirReferenciaMezcla(id) {
  const carpeta = carpetaDe(id);
  const r = await dialog.showOpenDialog({ title: "Elegí la canción de referencia para la mezcla", properties: ["openFile"],
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "m4a", "aac", "ogg", "aif", "aiff"] }] });
  if (r.canceled || !r.filePaths.length) return null;
  const analisis = await analizarMezcla(r.filePaths[0]);
  const m = await leerJson(path.join(carpeta, "mezcla.json"), {});
  m.referencia = analisis;
  await escribirJson(path.join(carpeta, "mezcla.json"), m);
  return analisis;
}

async function guardarMezcla(id, cambios) {
  const carpeta = carpetaDe(id);
  const m = await leerJson(path.join(carpeta, "mezcla.json"), {});
  if (typeof cambios.notas === "string") m.notas = cambios.notas.slice(0, 5000);
  if (Array.isArray(cambios.plugins)) m.plugins = cambios.plugins.slice(0, 60).map(String);
  await escribirJson(path.join(carpeta, "mezcla.json"), m);
  return m;
}

// Los plugins de mezcla que andan en FL: los de fábrica (con su rol) y los VST
// instalados en las carpetas estándar. Nada de lo que falta comprar.
const ROLES_FL = {
  "Fruity Parametric EQ 2": ["Ecualización", "El EQ de todas las pistas: cortar graves, limpiar barro, abrir brillo.", true],
  "EQUO": ["Ecualización", "EQ gráfico con morphing."],
  "Fruity 7 Band EQ": ["Ecualización", "EQ simple de 7 bandas."],
  "Fruity Compressor": ["Compresión", "Compresor clásico para bajo, voces y buses.", true],
  "Fruity Multiband Compressor": ["Compresión", "Compresión por bandas: controla graves sin apagar los agudos."],
  "Transient Processor": ["Compresión", "Más o menos ataque en bombo, caja y percusión.", true],
  "Fruity Squeeze": ["Compresión", "Compresor + bitcrush: carácter."],
  "Maximus": ["Master", "Compresor/limitador multibanda: pegamento y volumen del master.", true],
  "Fruity Limiter": ["Master", "Limitador del final de la cadena (techo −1 dBTP).", true],
  "Soundgoodizer": ["Master", "Un Maximus en una perilla: brillo y pegada rápidos."],
  "Fruity Soft Clipper": ["Master", "Recorte suave antes del limitador."],
  "Fruity Reeverb 2": ["Reverb", "Reverb principal (envíos).", true],
  "Fruity Convolver": ["Reverb", "Reverb de impulsos reales: salas y placas."],
  "Luxeverb": ["Reverb", "Reverb algorítmico premium de FL."],
  "Fruity Delay 3": ["Delay", "Delay sincronizado con filtro: envíos 1/4 y 1/8.", true],
  "Fruity Delay 2": ["Delay", "Delay simple."],
  "Multiband Delay": ["Delay", "Delay por bandas, para efectos."],
  "Fruity Delay Bank": ["Delay", "Ocho delays en serie."],
  "Fruity Fast Dist": ["Saturación", "Distorsión rápida: calor en bajos y leads.", true],
  "Fruity Blood Overdrive": ["Saturación", "Overdrive para guitarras y sintes."],
  "Distructor": ["Saturación", "Distorsión multietapa con cabinas."],
  "Fruity WaveShaper": ["Saturación", "Forma de onda a mano."],
  "Hardcore": ["Saturación", "Pedalera de guitarra."],
  "Fruity Stereo Enhancer": ["Estéreo", "Más ancho o más angosto.", true],
  "Fruity Stereo Shaper": ["Estéreo", "Mid/side y retraso entre canales."],
  "Fruity PanOMatic": ["Estéreo", "Paneo y volumen con LFO.", true],
  "Fruity Balance": ["Estéreo", "Volumen y paneo simples."],
  "Fruity Center": ["Estéreo", "Quita el DC offset."],
  "Vintage Chorus": ["Modulación", "Chorus analógico para pads y guitarras."],
  "Hyper Chorus": ["Modulación", "Chorus denso moderno."],
  "Fruity Phaser": ["Modulación", "Phaser."],
  "Vintage Phaser": ["Modulación", "Phaser analógico."],
  "Fruity Flangus": ["Modulación", "Flanger/chorus."],
  "Gross Beat": ["Modulación", "Efectos de tiempo y volumen: tartamudeos, half-time, sidechain."],
  "Fruity Love Philter": ["Filtro", "Filtros con envolventes y secuencia."],
  "Fruity Filter": ["Filtro", "Filtro simple."],
  "Fruity Fast LP": ["Filtro", "Pasa-bajos liviano."],
  "Fruity Free Filter": ["Filtro", "Filtros varios con Q."],
  "Wave Candy": ["Medición", "Osciloscopio, espectro y vectorscopio."],
  "Fruity Spectroman": ["Medición", "Analizador de espectro."],
  "Fruity dB Meter": ["Medición", "Medidor de nivel."],
  "Patcher": ["Herramienta", "Cadenas de efectos en paralelo."],
  "Fruity Send": ["Herramienta", "Envíos a otros inserts."],
  "Edison": ["Herramienta", "Grabar y editar audio."],
  "Newtone": ["Herramienta", "Afinar y editar melodías grabadas."],
  "Pitcher": ["Herramienta", "Afinación en tiempo real / armonías."],
  "Vocodex": ["Herramienta", "Vocoder."],
  "Frequency Splitter": ["Herramienta", "Divide en bandas para procesar aparte."],
};
const ROLES_VST = {
  "TDR Nova": ["Ecualización", "EQ dinámico (gratis): compresión por banda, limpia resonancias.", true],
  "ValhallaSupermassive": ["Reverb", "Reverb/delay gigante (gratis): colas y ambientes.", true],
  "ValhallaFreqEcho": ["Delay", "Delay con cambio de frecuencia (gratis)."],
  "ValhallaSpaceModulator": ["Modulación", "Flanger/chorus (gratis)."],
};

async function pluginsMezcla() {
  const r = await escanear();
  const lista = [], vistos = new Set();
  for (const c of r.carpetas) {
    for (const p of c.plugins) {
      if (p.tipo === "instrumento" || vistos.has(p.nombre)) continue;   // VST2 y VST3 del mismo: una vez
      const rol = ROLES_FL[p.nombre] || ROLES_VST[p.nombre];
      if (!rol) continue;
      vistos.add(p.nombre);
      lista.push({ nombre: p.nombre, origen: c.clase, grupo: rol[0], para: rol[1], pro: !!rol[2] });
    }
  }
  const orden = ["Ecualización", "Compresión", "Master", "Reverb", "Delay", "Saturación", "Estéreo", "Modulación", "Filtro", "Medición", "Herramienta"];
  lista.sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo) || (b.pro - a.pro) || a.nombre.localeCompare(b.nombre));
  return lista;
}

// El brief que lee Claude para mezclar en FL: referencia, comparación, notas y
// plugins elegidos. Queda en <canción>\Mezcla\brief-mezcla.md.
async function briefMezcla(id) {
  const carpeta = carpetaDe(id);
  const { titulo } = leerNombre(path.basename(carpeta));
  const m = await leerJson(path.join(carpeta, "mezcla.json"), {});
  const archivos = await fs.readdir(carpeta);
  const wav = archivos.find(a => / - master\.wav$/i.test(a));
  const master = wav ? await analizarMezcla(path.join(carpeta, wav)) : null;
  const cmp = compararMezcla(master, m.referencia);
  const f = x => x == null ? "—" : x;
  const bloque = (n, a) => a ? `- Volumen ${f(a.integrado)} LUFS · pico real ${f(a.picoReal)} dBTP · LRA ${f(a.rango)} LU\n- Graves ${f(a.bandas && a.bandas.graves)} dB · medios ${f(a.bandas && a.bandas.medios)} dB · agudos ${f(a.bandas && a.bandas.agudos)} dB (respecto del total)\n- Cresta ${f(a.cresta)} dB · ancho estéreo ${f(a.ancho)} dB` : `- (no hay ${n})`;
  const texto = `# Brief de mezcla — ${titulo}\n\nGenerado por el Estudio el ${new Date().toLocaleString("es-AR")}.\n\n## Meta\n−14 LUFS integrados, −1 dBTP, WAV 44,1 kHz / 24 bits.\n\n## Referencia\n${m.referencia ? path.basename(m.referencia.archivo) : "(sin referencia)"}\n${bloque("referencia", m.referencia)}\n\n## Master actual\n${wav || "(sin master)"}\n${bloque("master", master)}\n\n## Qué cambiar para parecerse a la referencia\n${cmp.length ? cmp.map(c => `- ${c.ok ? "✔" : "✘"} ${c.texto}`).join("\n") : "- (falta la referencia o el master)"}\n\n## Lo que a Agustín le gusta de esa mezcla\n${m.notas || "(sin notas)"}\n\n## Plugins elegidos (instalados y funcionando en FL)\n${(m.plugins || []).length ? m.plugins.map(p => `- ${p}`).join("\n") : "- (ninguno marcado: usar los de FL de fábrica)"}\n\n## Cómo mezclar (para Claude)\n1. Abrir el .flp de la canción en FL (lo abre Agustín).\n2. Cadena por insert: EQ → compresión → saturación si hace falta → envíos a reverb y delay.\n3. Buses: batería, bajo, melódicos. Master: Maximus → Fruity Limiter (ATT 0 ms, CEIL −3 dB).\n4. Exportar WAV 24 bits y medirlo en Mezcla; repetir hasta la meta.\n`;
  const dir = path.join(carpeta, "Mezcla");
  await fs.mkdir(dir, { recursive: true });
  const destino = path.join(dir, "brief-mezcla.md");
  await fs.writeFile(destino, texto, "utf8");
  await escribirJson(path.join(dir, "brief-mezcla.json"), { titulo, referencia: m.referencia || null, master, comparacion: cmp, notas: m.notas || "", plugins: m.plugins || [] });
  return { ruta: destino, comparacion: cmp, master };
}


/* ---------------- trabajos largos ----------------
   Cada uno deja <canción>\Videoclip\<paso>.log y <paso>.trabajo.json con el pid. */

function vivo(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } }

async function lanzar(carpetaVideo, paso, prog, args, env) {
  await fs.mkdir(carpetaVideo, { recursive: true });
  const log = path.join(carpetaVideo, paso + ".log");
  const fd = fss.openSync(log, "w");
  const hijo = spawn(prog, args, { detached: true, windowsHide: true, stdio: ["ignore", fd, fd],
    env: Object.assign({}, process.env, env || {}) });
  hijo.unref();
  fss.closeSync(fd);
  await escribirJson(path.join(carpetaVideo, paso + ".trabajo.json"), { pid: hijo.pid, inicio: new Date().toISOString(), log });
  return hijo.pid;
}

async function trabajo(carpetaVideo, paso) {
  const t = await leerJson(path.join(carpetaVideo, paso + ".trabajo.json"), null);
  if (!t) return null;
  let cola = "";
  try { const s = await fs.readFile(t.log, "utf8"); cola = s.slice(-4000); } catch {}
  return { corriendo: vivo(t.pid), inicio: t.inicio, cola };
}

async function rutasVideo(id) {
  const carpeta = carpetaDe(id);
  const nombre = leerNombre(path.basename(carpeta));
  const v = path.join(carpeta, "Videoclip");
  const t = nombre.titulo;
  return {
    carpeta, nombre, v, master: path.join(carpeta, `${t} - master.wav`),
    audio: path.join(v, `${t} - audio.json`), pantallas: path.join(v, "Pantallas"),
    h: path.join(v, `${t} - videoclip estudio 16x9.mp4`), vert: path.join(v, `${t} - videoclip estudio 9x16.mp4`),
    cuadros: path.join(v, `${t} - videoclip estudio 16x9 - cuadros`), blend: path.join(v, `${t} - videoclip estudio 16x9.blend`),
    pedido: path.join(v, "pedido.md"),
  };
}

async function estadoVideoclip(id) {
  const r = await rutasVideo(id);
  const audio = await leerJson(r.audio, null);
  const pantallas = {};
  for (const n of ["visualizador", "monitor-2", "cartel-grande", "cartel-luminoso"]) pantallas[n] = (await tamano(path.join(r.pantallas, n + ".mp4"))) > 0;
  let hechos = 0;
  try { hechos = (await fs.readdir(r.cuadros)).filter(f => f.endsWith(".jpg")).length; } catch {}
  const total = audio ? INICIO_MUSICA + Math.ceil(audio.segundos * FPS_MODELO) + FPS_MODELO + 1 : null;
  const estado = {
    titulo: r.nombre.titulo, bpm: r.nombre.bpm, hayMaster: await existe(r.master),
    audio: audio ? { segundos: audio.segundos, golpes: audio.golpes.length } : null,
    pantallas, cuadros: { hechos, total },
    horizontal: (await tamano(r.h)) > 0 ? r.h : null, vertical: (await tamano(r.vert)) > 0 ? r.vert : null,
    hayBlend: await existe(r.blend),
    pedido: await fs.readFile(r.pedido, "utf8").catch(() => ""),
    trabajos: {},
  };
  for (const p of ["pantallas", "preparar", "render", "vertical"]) estado.trabajos[p] = await trabajo(r.v, p);
  // El render escribe su propio registro (render.log): de ahí sale el último cuadro.
  if (estado.trabajos.render) {
    try { estado.trabajos.render.cola = (await fs.readFile(path.join(r.v, "render.log"), "utf8")).slice(-3000); } catch {}
  }
  return estado;
}

async function pasoVideoclip(id, paso, opciones) {
  const r = await rutasVideo(id);
  const o = opciones || {};
  if (paso === "pedido") {
    // Lo que Agustín quiere ver en el video, en sus palabras. Claude lo lee y arma la escena.
    await fs.mkdir(r.v, { recursive: true });
    await fs.writeFile(r.pedido, String(o.texto || "").slice(0, 20000), "utf8");
    return estadoVideoclip(id);
  }
  if (paso === "blender") {
    // Vista previa: Blender con ventana, sobre la copia de trabajo. Agustín le da play.
    if (!(await existe(r.blend))) throw new Error("Primero tocá «Preparar».");
    const hijo = spawn(BLENDER, [r.blend], { detached: true, stdio: "ignore" });
    hijo.unref();
    return estadoVideoclip(id);
  }
  for (const p of ["pantallas", "preparar", "render", "vertical"]) {
    const t = await trabajo(r.v, p);
    if (t && t.corriendo) throw new Error(`Ya hay un trabajo corriendo (${p}). Esperá a que termine.`);
  }
  if (!(await existe(r.master))) throw new Error("Falta el master: armalo en Mezcla.");
  const env = { ELECTRON_RUN_AS_NODE: "1", FFMPEG };
  if (paso === "analizar") {
    await fs.mkdir(r.v, { recursive: true });
    await correr(NODE, [path.join(VIDEOCLIP, "analizar-audio.js"), r.master, r.audio, FFMPEG], { env: Object.assign({}, process.env, env) });
    return estadoVideoclip(id);
  }
  if (!(await existe(r.audio))) throw new Error("Primero analizá el audio.");
  if (paso === "pantallas") {
    // Para rehacer una pantalla (otro título, por ejemplo) se borra y se vuelve a armar.
    for (const n of o.rehacer || []) await fs.rm(path.join(r.pantallas, n + ".mp4"), { force: true });
    await lanzar(r.v, "pantallas", NODE, [path.join(VIDEOCLIP, "pantallas.js"), r.master, r.audio, r.pantallas,
      o.titulo || r.nombre.titulo, String(r.nombre.bpm || 120)], Object.assign({ BLENDER }, env));
  } else if (paso === "preparar") {
    // Arma la copia de trabajo (.blend con las pantallas y el audio) sin renderizar.
    for (const n of ["visualizador", "monitor-2", "cartel-grande", "cartel-luminoso"]) {
      if (!((await tamano(path.join(r.pantallas, n + ".mp4"))) > 0)) throw new Error("Faltan pantallas: armalas primero.");
    }
    await lanzar(r.v, "preparar", BLENDER, ["-b", MODELO, "-P", path.join(VIDEOCLIP, "videoclip-estudio.py"), "--", "--solo-preparar",
      r.master, r.pantallas, r.h]);
  } else if (paso === "render") {
    for (const n of ["visualizador", "monitor-2", "cartel-grande", "cartel-luminoso"]) {
      if (!((await tamano(path.join(r.pantallas, n + ".mp4"))) > 0)) throw new Error("Faltan pantallas: armalas primero.");
    }
    // renderizar-estudio.ps1 lanza Blender aparte y lo mantiene despierto; acá
    // sólo se anota el pid de Blender para seguirlo.
    const { salida } = await correr("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
      path.join(VIDEOCLIP, "renderizar-estudio.ps1"), "-Cancion", r.carpeta, "-Master", r.master,
      "-Nombre", path.basename(r.h)]);
    const pid = Number((salida.match(/Blender pid (\d+)/) || [])[1]);
    await escribirJson(path.join(r.v, "render.trabajo.json"), { pid, inicio: new Date().toISOString(), log: path.join(r.v, "render.log") });
  } else if (paso === "vertical") {
    if (!((await tamano(r.h)) > 0)) throw new Error("Falta el video horizontal: renderizalo primero.");
    await lanzar(r.v, "vertical", NODE, [path.join(VIDEOCLIP, "vertical.js"), r.h, r.vert], env);
  } else throw new Error("Paso desconocido: " + paso);
  return estadoVideoclip(id);
}

/* ---------------- campaña ----------------
   Paso a paso (13/10/2026, pedido de Agustín): 1 fecha y redes, 2 tapa, 3 clips,
   4 grilla de calendario (como su planilla), 5 programar. Todo queda en
   <canción>\Campaña\campana.json. Nada se publica desde acá. */

async function rutasCampana(id) {
  const r = await rutasVideo(id);
  const c = path.join(r.carpeta, "Campaña");
  return Object.assign(r, { c, json: path.join(c, "campana.json"), tapa: path.join(c, `${r.nombre.titulo} - tapa 3000.jpg`) });
}

const ETIQUETAS = {
  EDM: "#edm #house #electronica #musicaelectronica #productor #flstudio",
  Afrobeats: "#afrobeats #afro #plena #musicanueva #productor #flstudio",
  Reggaeton: "#reggaeton #urbano #musicanueva #productor #flstudio",
  Trap: "#trap #urbano #musicanueva #productor #flstudio",
  House: "#house #edm #musicaelectronica #productor #flstudio",
};

function fechaMas(iso, dias) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Las piezas de la campaña, por red. Cada una es una fila de la grilla; los
// textos son borradores para que Agustín los corrija.
function piezasBase(t, genero, estreno, redes, hora) {
  const tags = ETIQUETAS[genero] || "#musicanueva #productor #flstudio";
  const f = estreno.split("-").reverse().join("/");
  const P = (dias, red, formato, pilar, objetivo, archivo, copy, indicaciones) =>
    ({ dias, red, formato, pilar, objetivo, archivo, copy, indicaciones: indicaciones || "" });
  const todas = [
    P(-21, "Distribuidora", "Tarea", "Lanzamiento", "Que llegue a Spotify y Apple Music", "master.wav + tapa",
      `Subir "${t}" con fecha de salida ${f}. Con 3 semanas llega a tiempo y se puede mandar a las listas editoriales.`, "ISRC lo da la distribuidora. Créditos: Nook."),
    P(-14, "Spotify for Artists", "Tarea", "Lanzamiento", "Listas editoriales", "",
      `Cuando aparezca como "próximo lanzamiento", mandarlo a las listas editoriales (mínimo 7 días antes).`),
    P(-14, "TikTok", "Clip 9:16", "Teaser", "Expectativa", "clip-1.mp4", `Algo nuevo se está cocinando en el estudio 👀🔊 "${t}" sale el ${f}. ${tags}`, "Sin revelar el drop."),
    P(-10, "YouTube", "Short", "Teaser", "Alcance", "clip-1.mp4", `Primer adelanto de "${t}" 🔥 Estreno ${f}. #shorts ${tags}`),
    P(-10, "Instagram", "Reel", "Teaser", "Expectativa", "clip-1.mp4", `Se viene "${t}" 👀 ${f}. ${tags}`),
    P(-7, "TikTok", "Clip 9:16", "Lanzamiento", "Que guarden la tapa", "tapa 3000.jpg", `Esta es la tapa de "${t}" 💿 Faltan 7 días. ${tags}`),
    P(-7, "Instagram", "Post", "Lanzamiento", "Expectativa", "tapa 3000.jpg", `Tapa de "${t}" 💿 ${f}. ${tags}`),
    P(-5, "TikTok", "Clip 9:16", "Teaser", "Expectativa", "clip-2.mp4", `Así suena el drop de "${t}" 🎛️ ${f} en todas las plataformas. ${tags}`),
    P(-3, "YouTube", "Tarea", "Lanzamiento", "Estreno programado", "videoclip 16x9", `Programar el estreno del videoclip de "${t}" para el ${f} a las ${hora}, con la tapa de miniatura.`),
    P(-2, "TikTok", "Clip 9:16", "Teaser", "Expectativa", "clip-3.mp4", `2 días para "${t}" ⏳ ${tags}`),
    P(-1, "Instagram", "Story", "Teaser", "Recordatorio", "clip-1.mp4", `Mañana sale "${t}" 🚀`),
    P(-1, "TikTok", "Clip 9:16", "Teaser", "Recordatorio", "clip-1.mp4", `Mañana sale "${t}" 🚀 Activá la notificación. ${tags}`),
    P(0, "Spotify / Apple Music", "Tarea", "Lanzamiento", "Salida", "", `Sale "${t}" (lo publica la distribuidora). Copiar el link para los posts del día.`),
    P(0, "YouTube", "Video", "Lanzamiento", "Estreno", "videoclip 16x9", `"${t}" — videoclip oficial. Hecho en mi estudio, de la primera nota al último cuadro. Escuchalo en Spotify y Apple Music (link en la descripción). ${tags}`),
    P(0, "TikTok", "Clip 9:16", "Lanzamiento", "Conversión (que lo escuchen)", "videoclip 9x16", `YA SALIÓ "${t}" 🔊 Link en el perfil. ${tags}`),
    P(0, "Instagram", "Reel", "Lanzamiento", "Conversión", "videoclip 9x16", `YA SALIÓ "${t}" 🔊 Link en la bio. ${tags}`),
    P(1, "TikTok", "Clip 9:16", "Detrás de escena", "Comunidad", "captura de FL Studio", `Así armé "${t}" en FL Studio 🎹 ${tags}`),
    P(3, "YouTube", "Short", "Lanzamiento", "Alcance", "clip-2.mp4", `El drop de "${t}" 🔥 Completo en el canal. #shorts ${tags}`),
    P(3, "Instagram", "Reel", "Detrás de escena", "Comunidad", "captura de FL Studio", `Cómo se hizo "${t}" 🎹 ${tags}`),
    P(7, "TikTok", "Clip 9:16", "Comunidad", "Agradecer y mostrar números", "", `Una semana de "${t}" 🙏 Gracias por escucharlo. ${tags}`),
  ];
  const redesOk = new Set(redes.concat(["Distribuidora", "Spotify for Artists", "Spotify / Apple Music"]));
  return todas.filter(p => redesOk.has(p.red));
}

async function estadoCampana(id) {
  const r = await rutasCampana(id);
  const c = await leerJson(r.json, {});
  const clips = [];
  for (let i = 1; i <= 6; i++) if ((await tamano(path.join(r.c, `clip-${i}.mp4`))) > 0) clips.push(`clip-${i}.mp4`);
  return {
    titulo: r.nombre.titulo, genero: path.basename(path.dirname(r.carpeta)), carpeta: r.c,
    estreno: c.estreno || null, hora: c.hora || "18:00", plataformas: c.plataformas || ["YouTube", "TikTok"],
    tapaPedido: c.tapa || null, tapa: (await tamano(r.tapa)) > 0 ? r.tapa : null,
    clipsPedido: c.clipsPedido || null, clips, clipsHechos: c.clips || [],
    grilla: c.grilla || null,
    hayBlend: await existe(r.blend), hayVideo: (await tamano(r.h)) > 0, hayVertical: (await tamano(r.vert)) > 0,
    hayAudio: await existe(r.audio),
  };
}

async function guardarCampana(id, cambios) {
  const r = await rutasCampana(id);
  const c = await leerJson(r.json, {});
  Object.assign(c, cambios);
  await escribirJson(r.json, c);
  return estadoCampana(id);
}

// Paso 1: fecha, hora y redes -> arma la grilla (si ya había una, la guarda como anterior).
async function armarGrilla(id, o) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.estreno || "")) throw new Error("Elegí la fecha de salida.");
  const redes = (o.plataformas || []).filter(x => ["YouTube", "TikTok", "Instagram"].includes(x));
  if (!redes.length) throw new Error("Elegí al menos una red.");
  const hora = /^\d{2}:\d{2}$/.test(o.hora || "") ? o.hora : "18:00";
  const r = await rutasCampana(id);
  const genero = path.basename(path.dirname(r.carpeta));
  const piezas = piezasBase(r.nombre.titulo, genero, o.estreno, redes, hora);
  const primera = Math.min(...piezas.map(p => p.dias));
  const grilla = piezas.map((p, i) => {
    const fecha = fechaMas(o.estreno, p.dias);
    const semana = Math.floor((p.dias - primera) / 7) + 1;
    return Object.assign({ id: "p" + Date.now().toString(36) + i, semana, fecha, hora: p.formato === "Tarea" ? "" : hora,
      link: "", aprobacion: "Pendiente", checklist: "Por armar" }, p);
  });
  const c = await leerJson(r.json, {});
  if (c.grilla) c.grillaAnterior = c.grilla;
  Object.assign(c, { estreno: o.estreno, hora, plataformas: redes, grilla });
  await escribirJson(r.json, c);
  return estadoCampana(id);
}

// Calendario .ics para importarlo donde quiera Agustín.
async function exportarIcs(id) {
  const r = await rutasCampana(id);
  const c = await leerJson(r.json, null);
  if (!c || !c.grilla) throw new Error("Primero armá la grilla.");
  const limpio = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Estudio Nook//Campaña//ES"];
  c.grilla.forEach((p, i) => {
    const f = p.fecha.replace(/-/g, "");
    const inicio = p.hora ? `DTSTART:${f}T${p.hora.replace(":", "")}00` : `DTSTART;VALUE=DATE:${f}`;
    lineas.push("BEGIN:VEVENT", `UID:${f}-${i}@estudio-nook`, inicio,
      `SUMMARY:${limpio(`${p.red} · ${p.formato} — ${r.nombre.titulo}`)}`,
      `DESCRIPTION:${limpio(p.copy + (p.archivo ? `\n\nArchivo: ${p.archivo}` : "") + (p.indicaciones ? `\n\n${p.indicaciones}` : ""))}`, "END:VEVENT");
  });
  lineas.push("END:VCALENDAR");
  const destino = path.join(r.c, `${r.nombre.titulo} - campaña.ics`);
  await fs.mkdir(r.c, { recursive: true });
  await fs.writeFile(destino, lineas.join("\r\n") + "\r\n", "utf8");
  return destino;
}

const FUENTE_FF = "C\\:/Windows/Fonts/bahnschrift.ttf";
const textoFf = s => String(s || "").replace(/\\/g, "\\\\").replace(/'/g, "’").replace(/:/g, "\\:");

// Paso 2: tapa de 3000 × 3000. Foto del estudio (Blender, cámara y cuadro a
// elección) + título y subtítulo. El pedido queda guardado para rehacerla.
async function armarTapa(id, o) {
  const r = await rutasCampana(id);
  if (!(await existe(r.blend))) throw new Error("Falta el .blend del videoclip: en Videoclip, tocá «Preparar».");
  o = Object.assign({ camara: "Detalle", cuadro: 1200, titulo: r.nombre.titulo, subtitulo: "NOOK" }, o || {});
  await fs.mkdir(r.c, { recursive: true });
  const foto = path.join(r.c, "tapa-foto.png");
  await correr(BLENDER, ["-b", r.blend, "-P", path.join(VIDEOCLIP, "tapa.py"), "--", foto, o.camara, String(o.cuadro)]);
  const tam = Math.max(150, Math.min(330, Math.floor(2700 / Math.max(5, String(o.titulo).length))));
  await correr(FFMPEG, ["-v", "error", "-y", "-i", foto, "-vf",
    "format=rgb24,drawbox=x=0:y=ih*0.70:w=iw:h=ih*0.30:color=black@0.55:t=fill," +
    `drawtext=fontfile='${FUENTE_FF}':text='${textoFf(o.titulo)}':expansion=none:fontsize=${tam}:fontcolor=0xff2bd6:x=(w-tw)/2:y=h*0.74,` +
    `drawtext=fontfile='${FUENTE_FF}':text='${textoFf(o.subtitulo)}':expansion=none:fontsize=150:fontcolor=white:x=(w-tw)/2:y=h*0.88`,
    "-q:v", "2", r.tapa]);
  await fs.rm(foto, { force: true });
  return guardarCampana(id, { tapa: o });
}

// Dónde empieza cada parte de la canción, según la energía medida (audio.json).
function partesDe(a) {
  const fps = a.fps, n = a.cuadros, v = 20 * fps;
  const suma = (i, largo) => { let s = 0; for (let k = i; k < Math.min(n, i + largo); k++) s += a.energia[k]; return s / Math.max(1, Math.min(n, i + largo) - i); };
  let mejor = 0, peor = Math.floor(n * 0.3), mMax = -1, mMin = 9;
  for (let i = 0; i + v <= n; i += fps) {
    const s = suma(i, v);
    if (s > mMax) { mMax = s; mejor = i; }
    if (i > n * 0.3 && i < n * 0.8 && s < mMin) { mMin = s; peor = i; }
  }
  return { intro: 0, drop: mejor / fps, "mas-energia": mejor / fps, puente: peor / fps, final: Math.max(0, (n - v) / fps) };
}

// Paso 3: clips a pedido. Cada pedido: {parte|desde, duracion, texto}.
async function armarClips(id, pedidos) {
  const r = await rutasCampana(id);
  const fuente = (await tamano(r.vert)) > 0 ? r.vert : (await tamano(r.h)) > 0 ? r.h : null;
  if (!fuente) throw new Error("Falta el videoclip: renderizalo en Videoclip.");
  const a = await leerJson(r.audio, null);
  if (!a) throw new Error("Falta el análisis del audio (Videoclip → Analizar).");
  const partes = partesDe(a);
  const lista = (pedidos && pedidos.length ? pedidos : [{ parte: "intro" }, { parte: "drop" }, { parte: "puente" }]).slice(0, 6);
  const retraso = INICIO_MUSICA / FPS_MODELO;   // la música arranca a los 13,8 s del video
  const vertical = fuente === r.vert;
  await fs.mkdir(r.c, { recursive: true });
  for (let i = 1; i <= 6; i++) await fs.rm(path.join(r.c, `clip-${i}.mp4`), { force: true });
  const hechos = [];
  for (let n = 0; n < lista.length; n++) {
    const p = lista[n];
    const dur = Math.max(5, Math.min(60, Number(p.duracion) || 20));
    const enCancion = p.desde != null && p.desde !== "" ? Math.max(0, Number(p.desde)) : (partes[p.parte] != null ? partes[p.parte] : partes.drop);
    const desde = retraso + Math.min(enCancion, a.segundos - dur);
    const salida = path.join(r.c, `clip-${n + 1}.mp4`);
    const filtros = [];
    if (!vertical) filtros.push("crop=608:1080:(iw-608)/2:0,scale=1080:1920,setsar=1");
    if (p.texto) {
      // Bahnschrift no tiene emojis: si el texto trae alguno, se usa Segoe UI Emoji.
      const conEmoji = /[🌀-🫿☀-➿]/u.test(p.texto);
      const fuente = conEmoji ? "C\:/Windows/Fonts/seguiemj.ttf" : FUENTE_FF;
      const tam = Math.max(48, Math.min(96, Math.floor(1700 / Math.max(8, String(p.texto).length))));
      filtros.push(`drawtext=fontfile='${fuente}':text='${textoFf(p.texto)}':expansion=none:fontsize=${tam}:fontcolor=white:borderw=4:bordercolor=black@0.7:x=(w-tw)/2:y=h*0.12`);
    }
    const args = ["-v", "error", "-y", "-ss", desde.toFixed(2), "-i", fuente, "-t", String(dur)];
    if (filtros.length) args.push("-vf", filtros.join(","));
    args.push("-af", `afade=t=in:d=0.3,afade=t=out:st=${dur - 1}:d=1`, "-c:v", "libx264", "-crf", "20", "-preset", "medium",
      "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", salida);
    await correr(FFMPEG, args);
    hechos.push({ archivo: path.basename(salida), desde: +enCancion.toFixed(1), duracion: dur, texto: p.texto || "", parte: p.parte || "" });
  }
  return guardarCampana(id, { clipsPedido: lista, clips: hechos });
}

/* ---------------- licencias ----------------
   Lee del .flp (sólo lectura) qué samples y plugins usa la canción. */

function rutasDelFlp(b) {
  let p = 8 + b.readUInt32LE(4) + 8;
  const samples = new Set(), plugins = new Set();
  let enMixer = false;
  while (p < b.length) {
    const id = b[p++];
    let len = 0;
    if (id < 64) len = 1; else if (id < 128) len = 2; else if (id < 192) len = 4;
    else { let sh = 0, c; do { c = b[p++]; len |= (c & 0x7f) << sh; sh += 7; } while (c & 0x80); }
    if (id >= 192) {
      const t = b.subarray(p, p + len).toString("utf16le").replace(/\0+$/, "");
      if (id === 196 && t) samples.add(t);
      if (id === 201 && t) plugins.add((enMixer ? "efecto: " : "") + t);
    }
    if (id === 236) enMixer = true;
    p += len;
  }
  return { samples: [...samples], plugins: [...plugins] };
}

async function licencias(id) {
  const carpeta = carpetaDe(id);
  const flp = (await fs.readdir(carpeta)).find(a => a.toLowerCase().endsWith(".flp"));
  if (!flp) throw new Error("La canción no tiene .flp guardado.");
  const { samples, plugins } = rutasDelFlp(await fs.readFile(path.join(carpeta, flp)));
  const grupos = {};
  for (const s of samples) {
    let clave, origen, aviso;
    const m = s.match(/\\Librerias\\([^\\]+)\\/i);
    if (/\\Fl Studio\\App\\|Image-Line|%FLStudioFactoryData%/i.test(s)) {
      clave = "FL Studio (de fábrica)"; origen = "fl";
      aviso = "Viene con FL Studio. Image-Line permite usar sus sonidos de fábrica en tus canciones.";
    } else if (m) {
      clave = m[1]; origen = "pack";
      const raiz = s.slice(0, s.toLowerCase().indexOf(m[1].toLowerCase()) + m[1].length);
      let marcas = [];
      try { marcas = (await fs.readdir(raiz)).filter(f => /\.(txt|url|nfo)$/i.test(f)); } catch {}
      const sospechoso = marcas.find(f => /@|audiowave|www|download|free/i.test(f));
      aviso = sospechoso ? `Trae "${sospechoso}": parece bajado de un sitio de descargas. Hay que confirmar la licencia o cambiar el sonido.`
        : "Pack de la librería: confirmar que la licencia permite publicar.";
    } else {
      clave = path.dirname(s); origen = "otro";
      aviso = "Sample suelto: confirmar de dónde salió.";
    }
    (grupos[clave] = grupos[clave] || { origen, aviso, samples: [] }).samples.push(path.basename(s));
  }
  return { flp, grupos, plugins };
}

/* ---------------- métricas ---------------- */

async function leerMetricas() { return leerJson(datos("metricas.json"), { entradas: [], videos: [] }); }

async function agregarMetrica(entrada) {
  const m = await leerMetricas();
  const e = Object.assign({ fecha: new Date().toISOString().slice(0, 10) }, entrada);
  if (!e.red || !e.metrica || !isFinite(Number(e.valor))) throw new Error("Faltan datos: red, métrica y valor.");
  e.valor = Number(e.valor);
  m.entradas.push(e);
  await escribirJson(datos("metricas.json"), m);
  return m;
}

async function guardarVideosYoutube(ids) {
  const m = await leerMetricas();
  m.videos = String(ids || "").split(/[\s,]+/).map(x => (x.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [null, x])[1]).filter(x => /^[\w-]{11}$/.test(x));
  await escribirJson(datos("metricas.json"), m);
  return m;
}

// La clave la escribe Agustín en la app; queda sólo en ajustes.json de esta máquina.
async function actualizarYoutube() {
  const a = await leerJson(datos("ajustes.json"), {});
  if (!a.youtubeClave) throw new Error("Falta la clave de la API de YouTube (la escribís vos en Métricas).");
  const m = await leerMetricas();
  if (!m.videos.length) throw new Error("Agregá los links de tus videos de YouTube.");
  const url = "https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=" + m.videos.join(",") + "&key=" + encodeURIComponent(a.youtubeClave);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error("YouTube respondió: " + ((j.error && j.error.message) || r.status));
  const hoy = new Date().toISOString().slice(0, 10);
  for (const v of j.items || []) {
    const s = v.statistics || {};
    for (const [metrica, valor] of [["vistas", s.viewCount], ["me gusta", s.likeCount], ["comentarios", s.commentCount]]) {
      if (valor == null) continue;
      m.entradas = m.entradas.filter(e => !(e.red === "YouTube" && e.id === v.id && e.metrica === metrica && e.fecha === hoy));
      m.entradas.push({ fecha: hoy, red: "YouTube", id: v.id, cancion: v.snippet.title, metrica, valor: Number(valor), fuente: "API" });
    }
  }
  await escribirJson(datos("metricas.json"), m);
  return m;
}

// CSV que exportan Spotify for Artists, TikTok Studio o la distribuidora: la
// primera columna con fechas es la fecha y cada columna con números, una métrica.
async function importarCsv(red) {
  const r = await dialog.showOpenDialog({ title: "Elegí el CSV exportado", properties: ["openFile"], filters: [{ name: "CSV", extensions: ["csv", "txt"] }] });
  if (r.canceled || !r.filePaths.length) return leerMetricas();
  const texto = (await fs.readFile(r.filePaths[0], "utf8")).replace(/^\uFEFF/, "");
  const sep = (texto.split("\n")[0].match(/;/g) || []).length > (texto.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const filas = texto.split(/\r?\n/).filter(Boolean).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, "").trim()));
  const cab = filas.shift();
  const iFecha = cab.findIndex((_, i) => filas.slice(0, 5).every(f => !isNaN(Date.parse(f[i]))));
  if (iFecha < 0) throw new Error("No encontré una columna de fechas en ese CSV.");
  const m = await leerMetricas();
  let n = 0;
  for (const f of filas) {
    const fecha = new Date(f[iFecha]).toISOString().slice(0, 10);
    cab.forEach((nombre, i) => {
      if (i === iFecha) return;
      const v = Number(String(f[i]).replace(/\./g, "").replace(",", "."));
      if (!isFinite(v) || f[i] === "") return;
      m.entradas.push({ fecha, red, metrica: nombre.toLowerCase(), valor: v, fuente: path.basename(r.filePaths[0]) });
      n++;
    });
  }
  await escribirJson(datos("metricas.json"), m);
  return Object.assign(m, { importadas: n });
}

/* ---------------- registro ---------------- */
function registrar(datosEstudio, escanearPlugins) {
  datos = datosEstudio;
  escanear = escanearPlugins;
  ipcMain.handle("lz:canciones", () => listarCanciones());
  ipcMain.handle("lz:mezcla", (_e, id) => estadoMezcla(id));
  ipcMain.handle("lz:medir-master", async (_e, id) => {
    const e = await estadoMezcla(id);
    if (!e.wav) throw new Error("Esta canción todavía no tiene master.");
    return medir(path.join(carpetaDe(id), e.wav));
  });
  ipcMain.handle("lz:elegir-wav", async (_e, id) => {
    const r = await dialog.showOpenDialog({ title: "Elegí el WAV que exportaste de FL Studio",
      defaultPath: carpetaDe(id), properties: ["openFile"], filters: [{ name: "WAV", extensions: ["wav"] }] });
    if (r.canceled || !r.filePaths.length) return null;
    return { ruta: r.filePaths[0], medida: await medir(r.filePaths[0]) };
  });
  ipcMain.handle("lz:usar-master", (_e, id, wav) => usarComoMaster(id, wav));
  ipcMain.handle("lz:mezcla-referencia", (_e, id) => elegirReferenciaMezcla(id));
  ipcMain.handle("lz:mezcla-guardar", (_e, id, cambios) => guardarMezcla(id, cambios || {}));
  ipcMain.handle("lz:mezcla-plugins", () => pluginsMezcla());
  ipcMain.handle("lz:mezcla-brief", (_e, id) => briefMezcla(id));
  ipcMain.handle("lz:mezcla-comparar", async (_e, id) => {
    const carpeta = carpetaDe(id);
    const m = await leerJson(path.join(carpeta, "mezcla.json"), {});
    const archivos = await fs.readdir(carpeta);
    const wav = archivos.find(a => / - master\.wav$/i.test(a));
    const master = wav ? await analizarMezcla(path.join(carpeta, wav)) : null;
    return { master, referencia: m.referencia || null, comparacion: compararMezcla(master, m.referencia) };
  });

  ipcMain.handle("lz:videoclip", (_e, id) => estadoVideoclip(id));
  ipcMain.handle("lz:videoclip-paso", (_e, id, paso, o) => pasoVideoclip(id, paso, o));

  ipcMain.handle("lz:campana", (_e, id) => estadoCampana(id));
  ipcMain.handle("lz:campana-grilla", (_e, id, o) => armarGrilla(id, o || {}));
  ipcMain.handle("lz:campana-guardar", (_e, id, cambios) => {
    // Desde la pantalla sólo se cambian la grilla, el pedido de clips y las licencias.
    const permitido = {};
    if (Array.isArray(cambios.grilla)) permitido.grilla = cambios.grilla.slice(0, 200);
    if (Array.isArray(cambios.clipsPedido)) permitido.clipsPedido = cambios.clipsPedido.slice(0, 6);
    if (cambios.licencias && typeof cambios.licencias === "object") permitido.licencias = cambios.licencias;
    return guardarCampana(id, permitido);
  });
  ipcMain.handle("lz:campana-ics", (_e, id) => exportarIcs(id));
  ipcMain.handle("lz:campana-tapa", (_e, id, o) => armarTapa(id, o));
  ipcMain.handle("lz:campana-clips", (_e, id, pedidos) => armarClips(id, pedidos));
  ipcMain.handle("lz:licencias", (_e, id) => licencias(id));

  ipcMain.handle("lz:metricas", () => leerMetricas());
  ipcMain.handle("lz:metrica-agregar", (_e, entrada) => agregarMetrica(entrada));
  ipcMain.handle("lz:metrica-borrar", async (_e, i) => {
    const m = await leerMetricas(); m.entradas.splice(i, 1); await escribirJson(datos("metricas.json"), m); return m;
  });
  ipcMain.handle("lz:youtube-videos", (_e, ids) => guardarVideosYoutube(ids));
  ipcMain.handle("lz:youtube-clave", async (_e, clave) => {
    const a = await leerJson(datos("ajustes.json"), {});
    if (clave) a.youtubeClave = String(clave).trim(); else delete a.youtubeClave;
    await escribirJson(datos("ajustes.json"), a);
    return !!a.youtubeClave;
  });
  ipcMain.handle("lz:youtube-hay-clave", async () => !!(await leerJson(datos("ajustes.json"), {})).youtubeClave);
  ipcMain.handle("lz:youtube-actualizar", () => actualizarYoutube());
  ipcMain.handle("lz:importar-csv", (_e, red) => importarCsv(red));

  // Abrir un archivo o carpeta de la canción (para ver el video, la tapa…).
  ipcMain.handle("lz:abrir", async (_e, id, rel) => {
    const carpeta = carpetaDe(id);
    const destino = path.resolve(carpeta, rel || ".");
    if (!destino.toLowerCase().startsWith(carpeta.toLowerCase())) throw new Error("Fuera de la canción.");
    return shell.openPath(destino);
  });
}

module.exports = { registrar, medir, rutasDelFlp, leerNombre };
