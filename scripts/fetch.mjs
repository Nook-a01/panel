// Baja todos los eventos y los guarda en docs/deportes/data/events.json
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { CONFIG } from "../config.mjs";
import { fetchFeed } from "./sources.mjs";
import { fetchExtras } from "./extras.mjs";

const OUT = new URL("../docs/deportes/data/events.json", import.meta.url);
const OUT_EXTRAS = new URL("../docs/deportes/data/extras.json", import.meta.url);

const ahora = new Date();
const desde = new Date(ahora); desde.setUTCMonth(desde.getUTCMonth() - 1);
const hasta = new Date(ahora); hasta.setUTCMonth(hasta.getUTCMonth() + CONFIG.monthsAhead);

console.log(`\n📅 Buscando eventos ${desde.toISOString().slice(0,10)} → ${hasta.toISOString().slice(0,10)}\n`);

const activos = CONFIG.feeds.filter(f => f.activo);

// Las descargas van en paralelo, pero cada una junta su propio log
// para que la salida no se entremezcle.
const resultados = await Promise.all(activos.map(async feed => {
  const lineas = [`▶ ${feed.emoji} ${feed.label}`];
  try {
    const ev = await fetchFeed(feed, desde, hasta, l => lineas.push(l));
    lineas.push(ev.length ? `   = ${ev.length} eventos` : `   = sin eventos programados todavía`);
    return { feed, ev, ok: true, lineas };
  } catch (e) {
    lineas.push(`   ✗ ERROR: ${e.message}`);
    return { feed, ev: [], ok: false, lineas };
  }
}));
for (const r of resultados) console.log(r.lineas.join("\n") + "\n");

// Deduplicar: un mismo partido puede aparecer en dos ligas (o dos equipos míos se enfrentan).
const porId = new Map();
for (const { ev } of resultados) {
  for (const e of ev) {
    const previo = porId.get(e.id);
    if (!previo) { porId.set(e.id, e); continue; }
    if (previo.feedId !== e.feedId)
      previo.tambienEn = [...new Set([...(previo.tambienEn || []), e.feedLabel])];
  }
}

const eventos = [...porId.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));

// Conservar eventos ya guardados que la API dejó de devolver (memoria del calendario).
let previos = [];
if (existsSync(OUT)) {
  try { previos = JSON.parse(readFileSync(OUT, "utf8")).eventos || []; } catch {}
}
const idsNuevos = new Set(eventos.map(e => e.id));

// Un evento excluido por configuración no debe volver por esta puerta:
// si no, los que ya estaban guardados sobreviven para siempre.
const excluido = e => {
  const f = activos.find(x => x.id === e.feedId);
  return f?.excluirTitulo?.test(e.titulo || "") ?? false;
};

const rescatados = previos.filter(e =>
  !idsNuevos.has(e.id) && !excluido(e) &&
  new Date(e.inicio) > desde && new Date(e.inicio) < hasta
);
if (rescatados.length) console.log(`↻ ${rescatados.length} eventos conservados de la carga anterior`);

const todos = [...eventos, ...rescatados].sort((a, b) => a.inicio.localeCompare(b.inicio));
const futuros = todos.filter(e => new Date(e.inicio) > ahora);

const salida = {
  actualizado: ahora.toISOString(),
  timezone: CONFIG.timezone,
  feeds: activos.map(f => ({
    id: f.id, label: f.label, sport: f.sport, emoji: f.emoji, escudo: f.escudo || null,
    color: f.color || null,
    // Necesarios para abrir la ficha de un jugador aunque el equipo no
    // tenga ningún partido en el calendario (le pasa a la Selección).
    ruta: f.source === "espn-rugby" ? "rugby"
        : f.source === "espn-mma"   ? "mma"
        : f.source === "jolpica-f1" ? null : "soccer",
    liga: f.leagues?.[0] || null,
    total: todos.filter(e => e.feedId === f.id).length,
    proximos: futuros.filter(e => e.feedId === f.id).length,
  })),
  eventos: todos,
};

// Escribe sólo si cambió algo de verdad. Compara ignorando "actualizado",
// que cambiaría en cada corrida y ensuciaría el historial con commits vacíos.
function guardarSiCambio(destino, contenido, etiqueta) {
  const sinFecha = o => { const c = { ...o }; delete c.actualizado; return JSON.stringify(c); };
  if (existsSync(destino)) {
    try {
      const previo = JSON.parse(readFileSync(destino, "utf8"));
      if (sinFecha(previo) === sinFecha(contenido)) {
        console.log(`· ${etiqueta}: sin cambios`);
        return false;
      }
    } catch {}
  }
  writeFileSync(destino, JSON.stringify(contenido, null, 1));
  console.log(`✓ ${etiqueta}: actualizado`);
  return true;
}

mkdirSync(new URL("../docs/deportes/data/", import.meta.url), { recursive: true });
guardarSiCambio(OUT, salida, "calendario");

// --- posiciones, planteles, noticias ---
console.log("\n📊 Trayendo posiciones, planteles y noticias\n");

const lotes = await Promise.all(activos.map(async feed => {
  const lineas = [`▶ ${feed.emoji} ${feed.label}`];
  let datos;
  try {
    datos = await fetchExtras(feed, todos, l => lineas.push(l));
  } catch (e) {
    lineas.push(`   ✗ ${e.message}`);
    datos = { compitiendo: [], posiciones: null, plantel: null, noticias: null, resultados: null };
  }
  return { feed, datos, lineas };
}));
for (const l of lotes) console.log(l.lineas.join("\n"));

// Se arma en el orden de la configuración, no en el orden en que fueron
// llegando las respuestas: si no, las claves quedan en distinto orden cada
// vez y el archivo parece haber cambiado aunque los datos sean idénticos.
const extras = {};
for (const feed of activos) {
  const r = lotes.find(l => l.feed.id === feed.id);
  if (r) extras[feed.id] = r.datos;
}

guardarSiCambio(OUT_EXTRAS, { actualizado: ahora.toISOString(), feeds: extras }, "posiciones/planteles/noticias");


console.log("─".repeat(52));
for (const f of salida.feeds)
  console.log(` ${f.emoji} ${f.label.padEnd(22)} ${String(f.proximos).padStart(3)} próximos / ${f.total} total`);
console.log("─".repeat(52));
console.log(`✓ ${todos.length} eventos (${futuros.length} por jugarse) → docs/deportes/data/events.json\n`);

if (!futuros.length) { console.error("⚠ No hay eventos futuros. Revisá conexión o config."); process.exit(1); }
