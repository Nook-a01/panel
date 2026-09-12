// Estudio — la parte que toca tu máquina.
//
// POR QUÉ ESTO NO PUEDE SER UNA PÁGINA WEB
// Una página en el navegador no puede leer tus plugins ni tus samples: el
// navegador se lo prohíbe, y con razón. Por eso el Estudio es un programa.
// Este archivo es la única parte con permiso para mirar el disco, y sólo mira
// lo que pediste: las carpetas de plugins y las que vos elijas.
//
// QUÉ NO HACE
// No abre nada fuera de esas carpetas, no escribe en ellas y no manda nada a
// internet. Las piezas se guardan en tu carpeta de datos del programa.

const { ipcMain, dialog, app, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

// Donde Windows y FL Studio dejan los plugins. Se miran todas y se saltean
// las que no existan, que es lo normal: nadie tiene las cinco.
const CARPETAS_PLUGINS = [
  { ruta: "C:\\Program Files\\Common Files\\VST3", clase: "VST3" },
  { ruta: "C:\\Program Files\\VSTPlugins", clase: "VST2" },
  { ruta: "C:\\Program Files\\Steinberg\\VSTPlugins", clase: "VST2" },
  { ruta: "C:\\Program Files (x86)\\VSTPlugins", clase: "VST2 (32 bits)" },
  { ruta: "C:\\Program Files\\Common Files\\VST2", clase: "VST2" },
];

const AUDIO = new Set([".wav", ".mp3", ".flac", ".aiff", ".aif", ".ogg", ".m4a"]);
const TECHO = 20000;   // freno duro: una librería de samples puede tener cientos de miles

function datos(...p) { return path.join(app.getPath("userData"), "estudio", ...p); }

async function existe(p) { try { await fs.access(p); return true; } catch { return false; } }

async function leerJson(p, porDefecto) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return porDefecto; }
}
async function escribirJson(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/* ---------------- plugins ---------------- */
//
// Un .vst3 en Windows puede ser un archivo O una carpeta con el plugin adentro.
// Si sólo se buscaran archivos, faltaría la mitad.
async function pluginsDe(carpeta, clase) {
  const salida = [];
  async function mirar(dir, hondo) {
    if (hondo > 3) return;
    let entradas;
    try { entradas = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (salida.length >= 2000) return;
      const completo = path.join(dir, e.name);
      const ext = path.extname(e.name).toLowerCase();
      if (ext === ".vst3") { salida.push({ nombre: path.basename(e.name, ext), clase, ruta: completo }); continue; }
      if (e.isDirectory()) { await mirar(completo, hondo + 1); continue; }
      if (ext === ".dll") salida.push({ nombre: path.basename(e.name, ext), clase, ruta: completo });
    }
  }
  await mirar(carpeta, 0);
  return salida;
}

async function escanearPlugins() {
  const carpetas = [];
  for (const c of CARPETAS_PLUGINS) {
    if (!(await existe(c.ruta))) continue;
    const lista = await pluginsDe(c.ruta, c.clase);
    if (lista.length) carpetas.push({ ruta: c.ruta, clase: c.clase, plugins: lista.sort((a, b) => a.nombre.localeCompare(b.nombre)) });
  }
  const total = carpetas.reduce((a, c) => a + c.plugins.length, 0);
  return { carpetas, total };
}

/* ---------------- samples ---------------- */
async function escanearSamples(raiz) {
  const porExt = {};
  const porCarpeta = {};
  let total = 0, cortado = false;

  async function mirar(dir, hondo) {
    if (total >= TECHO) { cortado = true; return; }
    if (hondo > 6) return;
    let entradas;
    try { entradas = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (total >= TECHO) { cortado = true; return; }
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) { await mirar(completo, hondo + 1); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!AUDIO.has(ext)) continue;
      total++;
      porExt[ext] = (porExt[ext] || 0) + 1;
      // Se agrupa por la primera carpeta bajo la raíz: así ves "Kicks 340,
      // Snares 210" en vez de una lista de diez mil nombres.
      const rel = path.relative(raiz, dir);
      const grupo = rel ? rel.split(path.sep)[0] : "(sueltos)";
      porCarpeta[grupo] = (porCarpeta[grupo] || 0) + 1;
    }
  }

  await mirar(raiz, 0);
  const grupos = Object.entries(porCarpeta).map(([nombre, cuantos]) => ({ nombre, cuantos }))
    .sort((a, b) => b.cuantos - a.cuantos).slice(0, 40);
  return { ruta: raiz, total, cortado, porExt, grupos };
}

/* ---------------- versiones ----------------
   Una idea no es un archivo, son varios intentos. Cada versión es su propio
   archivo con su nombre y su fecha, y el índice dice cuál estás escuchando.

   Nunca se pisa una versión al crear otra: probar algo no puede costarte lo
   anterior. Por eso "duplicar" es la operación normal y no hay "guardar como"
   que reemplace. */

function idNuevo() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function leerIndice() {
  const i = await leerJson(datos("versiones.json"), null);
  if (i && Array.isArray(i.versiones)) return i;
  return { actual: null, versiones: [] };
}

async function escribirIndice(i) { await escribirJson(datos("versiones.json"), i); }

// La primera vez no hay nada: entra la pieza que viene con el programa, o la
// que hubiera quedado guardada por la versión anterior del Estudio.
async function asegurarIndice() {
  const i = await leerIndice();
  if (i.versiones.length) return i;
  const vieja = await leerJson(datos("pieza.json"), null);
  const inicial = vieja || await leerJson(path.join(__dirname, "pieza-inicial.json"), null);
  if (!inicial) return i;
  const id = idNuevo();
  await escribirJson(datos("versiones", id + ".json"), inicial);
  i.versiones = [{ id, nombre: inicial.titulo || "Primera idea", creada: new Date().toISOString() }];
  i.actual = id;
  await escribirIndice(i);
  return i;
}

async function listarVersiones() {
  const i = await asegurarIndice();
  return { actual: i.actual, versiones: i.versiones };
}

async function abrirVersion(id) {
  const i = await asegurarIndice();
  if (!i.versiones.some(v => v.id === id)) return null;
  i.actual = id;
  await escribirIndice(i);
  return leerJson(datos("versiones", id + ".json"), null);
}

async function piezaActual() {
  const i = await asegurarIndice();
  if (!i.actual) return null;
  return leerJson(datos("versiones", i.actual + ".json"), null);
}

async function guardarActual(pieza) {
  const i = await asegurarIndice();
  if (!i.actual) return false;
  await escribirJson(datos("versiones", i.actual + ".json"), pieza);
  // El nombre de la versión sigue al título, salvo que le hayas puesto uno propio.
  const v = i.versiones.find(x => x.id === i.actual);
  if (v && !v.propio && pieza.titulo) { v.nombre = pieza.titulo; await escribirIndice(i); }
  return true;
}

async function duplicarVersion(desdeId, nombre) {
  const i = await asegurarIndice();
  const base = await leerJson(datos("versiones", (desdeId || i.actual) + ".json"), null);
  if (!base) return null;
  const id = idNuevo();
  const copia = JSON.parse(JSON.stringify(base));
  copia.titulo = nombre || ((base.titulo || "Idea") + " (otra vuelta)");
  await escribirJson(datos("versiones", id + ".json"), copia);
  i.versiones.push({ id, nombre: copia.titulo, creada: new Date().toISOString(), vieneDe: desdeId || i.actual });
  i.actual = id;
  await escribirIndice(i);
  return { id, pieza: copia };
}

async function renombrarVersion(id, nombre) {
  const i = await asegurarIndice();
  const v = i.versiones.find(x => x.id === id);
  if (!v) return false;
  v.nombre = nombre;
  v.propio = true;              // a partir de acá el nombre es tuyo, no del título
  await escribirIndice(i);
  return true;
}

async function borrarVersion(id) {
  const i = await asegurarIndice();
  // No se borra la última: quedarías sin nada que escuchar.
  if (i.versiones.length <= 1) return { ok: false, porque: "Es la única versión que queda." };
  i.versiones = i.versiones.filter(v => v.id !== id);
  if (i.actual === id) i.actual = i.versiones[0].id;
  await escribirIndice(i);
  try { await fs.unlink(datos("versiones", id + ".json")); } catch {}
  return { ok: true, actual: i.actual };
}

/* ---------------- registro ---------------- */
function registrar() {
  ipcMain.handle("estudio:plugins", () => escanearPlugins());

  ipcMain.handle("estudio:carpetas", () => leerJson(datos("carpetas.json"), []));

  ipcMain.handle("estudio:elegir-carpeta", async () => {
    const r = await dialog.showOpenDialog({
      title: "Elegí una carpeta de samples",
      properties: ["openDirectory"],
    });
    if (r.canceled || !r.filePaths.length) return null;
    const ruta = r.filePaths[0];
    const guardadas = await leerJson(datos("carpetas.json"), []);
    if (!guardadas.includes(ruta)) {
      guardadas.push(ruta);
      await escribirJson(datos("carpetas.json"), guardadas);
    }
    return ruta;
  });

  ipcMain.handle("estudio:olvidar-carpeta", async (_e, ruta) => {
    const guardadas = await leerJson(datos("carpetas.json"), []);
    await escribirJson(datos("carpetas.json"), guardadas.filter(x => x !== ruta));
    return true;
  });

  ipcMain.handle("estudio:samples", (_e, ruta) => escanearSamples(ruta));

  ipcMain.handle("estudio:leer-pieza", () => piezaActual());
  ipcMain.handle("estudio:guardar-pieza", (_e, pieza) => guardarActual(pieza));

  ipcMain.handle("estudio:versiones", () => listarVersiones());
  ipcMain.handle("estudio:abrir-version", (_e, id) => abrirVersion(id));
  ipcMain.handle("estudio:duplicar-version", (_e, desde, nombre) => duplicarVersion(desde, nombre));
  ipcMain.handle("estudio:renombrar-version", (_e, id, nombre) => renombrarVersion(id, nombre));
  ipcMain.handle("estudio:borrar-version", (_e, id) => borrarVersion(id));

  // Guardar el .mid donde vos quieras, con el diálogo de Windows.
  ipcMain.handle("estudio:guardar-midi", async (_e, nombre, bytes) => {
    const r = await dialog.showSaveDialog({
      title: "Guardar el MIDI",
      defaultPath: nombre,
      filters: [{ name: "Archivo MIDI", extensions: ["mid"] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fs.writeFile(r.filePath, Buffer.from(bytes));
    return r.filePath;
  });

  // Para que sepas dónde quedan tus cosas y las puedas abrir a mano.
  ipcMain.handle("estudio:donde", () => datos());
  ipcMain.handle("estudio:abrir-carpeta", async () => {
    await fs.mkdir(datos(), { recursive: true });
    shell.openPath(datos());
    return true;
  });
}

module.exports = { registrar, escanearPlugins, escanearSamples, datos };
