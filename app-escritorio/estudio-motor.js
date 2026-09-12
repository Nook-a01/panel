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

  // La primera vez no hay nada guardado: se copia la pieza que viene con el
  // programa, así el Estudio nunca abre vacío.
  ipcMain.handle("estudio:leer-pieza", async () => {
    const guardada = await leerJson(datos("pieza.json"), null);
    if (guardada) return guardada;
    const inicial = await leerJson(path.join(__dirname, "pieza-inicial.json"), null);
    if (inicial) await escribirJson(datos("pieza.json"), inicial);
    return inicial;
  });

  ipcMain.handle("estudio:guardar-pieza", async (_e, pieza) => {
    await escribirJson(datos("pieza.json"), pieza);
    return true;
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
