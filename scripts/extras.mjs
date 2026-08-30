// Trae lo que NO es calendario: posiciones, planteles, noticias y
// resultados recientes. Cada función devuelve null si la fuente no
// tiene ese dato, y quien llama decide qué mostrar.

import { banderaDePiloto, colorDeEscuderia } from "../docs/deportes/f1-datos.js";
import { completarFotos } from "./fotos.mjs";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_WEB = "https://site.web.api.espn.com/apis/v2/sports";
const UA = { "User-Agent": "Mozilla/5.0 (mis-deportes)" };

async function getJSON(url) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

const stat = (fila, nombre) => {
  const s = (fila.stats || []).find(x => x.name === nombre);
  return s ? (s.displayValue ?? s.value) : null;
};

/* ---------- posiciones (fútbol) ---------- */
async function posicionesFutbol(feed, deporte = "soccer") {
  const liga = feed.leagues?.[0];
  if (!liga) return null;

  const d = await getJSON(`${ESPN_WEB}/${deporte}/${liga}/standings?season=${new Date().getUTCFullYear()}`);
  const grupos = d?.children?.length ? d.children
               : d?.standings ? [{ name: d.name, standings: d.standings }]
               : null;
  if (!grupos) return null;

  // De todos los grupos nos quedamos con el que contiene a mi equipo.
  let elegido = null;
  for (const g of grupos) {
    const filas = g.standings?.entries || [];
    if (filas.some(e => String(e.team?.id) === String(feed.matchTeamId))) { elegido = g; break; }
  }
  if (!elegido) elegido = grupos[0];

  const filas = (elegido.standings?.entries || []).map(e => ({
    equipo: e.team?.displayName || "",
    abrev: e.team?.abbreviation || "",
    logo: e.team?.logos?.[0]?.href || null,
    pj: stat(e, "gamesPlayed"), pts: stat(e, "points"),
    g: stat(e, "wins"), e: stat(e, "ties"), p: stat(e, "losses"),
    dg: stat(e, "pointDifferential"),
    mio: String(e.team?.id) === String(feed.matchTeamId),
  }));

  // ESPN a veces no ordena; ordenamos por puntos y diferencia de gol.
  filas.sort((a, b) => (+b.pts || 0) - (+a.pts || 0) || (+b.dg || 0) - (+a.dg || 0));
  filas.forEach((f, i) => f.pos = i + 1);

  if (!filas.length) return null;
  return { titulo: elegido.name || d?.name || "Posiciones", tipo: "tabla", filas };
}


/* ---------- fotos de los pilotos ----------
   Jolpica no trae fotos. ESPN sí, pero con sus propios identificadores,
   así que hay que cruzar por nombre. Tiene 16 de 33: los veteranos sí,
   los debutantes no. Para los que faltan queda el dorsal. */
async function fotosPilotos() {
  const anio = new Date().getUTCFullYear();
  const lista = await getJSON(
    `https://sports.core.api.espn.com/v2/sports/racing/leagues/f1/seasons/${anio}/athletes?limit=100`);
  if (!lista?.items?.length) return {};

  const fichas = await Promise.all(
    lista.items.map(it => getJSON(it.$ref).catch(() => null)));

  const mapa = {};
  for (const a of fichas) {
    if (!a?.displayName) continue;
    // La clave es el apellido en minúsculas y sin tildes: Jolpica y ESPN
    // escriben distinto los nombres de pila ("Kimi" vs "Andrea Kimi").
    const clave = a.displayName.split(" ").pop()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (a.headshot?.href) mapa[clave] = a.headshot.href;
  }
  return mapa;
}

/* ---------- posiciones (Fórmula 1) ---------- */
async function posicionesF1() {
  const anio = new Date().getUTCFullYear();
  const fotos = await fotosPilotos();
  const apellido = n => n.split(" ").pop()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const dp = await getJSON(`https://api.jolpi.ca/ergast/f1/${anio}/driverstandings/?format=json&limit=100`);
  const lp = dp?.MRData?.StandingsTable?.StandingsLists?.[0];
  const pilotos = (lp?.DriverStandings || []).map(p => {
    const escuderia = p.Constructors?.[0]?.name || "";
    return {
      pos: +p.position,
      equipo: `${p.Driver.givenName} ${p.Driver.familyName}`,
      abrev: p.Driver.code || "",
      detalle: escuderia,
      pts: p.points, g: p.wins,
      // Jolpica da la nacionalidad como adjetivo; el mapa la traduce a bandera.
      bandera: banderaDePiloto(p.Driver.nationality),
      nacionalidad: p.Driver.nationality || "",
      // ESPN no publica logos de escudería, pero sí su color oficial.
      color: colorDeEscuderia(escuderia),
      numero: p.Driver.permanentNumber || null,
      driverId: p.Driver.driverId || null,   // para abrir su ficha
      foto: fotos[apellido(p.Driver.familyName)] || null,
      logo: null, mio: false,
    };
  });

  const dc = await getJSON(`https://api.jolpi.ca/ergast/f1/${anio}/constructorstandings/?format=json&limit=100`);
  const lc = dc?.MRData?.StandingsTable?.StandingsLists?.[0];
  const escuderias = (lc?.ConstructorStandings || []).map(c => ({
    pos: +c.position,
    equipo: c.Constructor?.name || "",
    detalle: c.Constructor?.nationality || "",
    pts: c.points, g: c.wins,
    color: colorDeEscuderia(c.Constructor?.name),
    bandera: banderaDePiloto(c.Constructor?.nationality),
    logo: null, mio: false,
  }));

  // ESPN tiene 15 de 23; Wikipedia cubre casi todo el resto.
  await completarFotos(pilotos, "piloto de Fórmula 1");

  if (!pilotos.length && !escuderias.length) return null;
  return {
    titulo: `Temporada ${anio} · tras ${lp?.round || "?"} carreras`,
    tipo: "f1", filas: pilotos, escuderias,
  };
}

/* ---------- plantel ---------- */
async function plantel(feed, deporte = "soccer") {
  const liga = feed.leagues?.[0];
  if (!liga || !feed.matchTeamId) return null;

  const d = await getJSON(`${ESPN}/${deporte}/${liga}/teams/${feed.matchTeamId}/roster`);
  const lista = d?.athletes;
  if (!Array.isArray(lista) || !lista.length) return null;

  // A veces vienen agrupados por posición, a veces planos.
  const jugadores = lista[0]?.items ? lista.flatMap(g => g.items || []) : lista;

  const salida = jugadores.map(a => ({
    id: a.id || null,                       // para poder abrir su ficha
    bandera: a.flag?.href || null,          // de dónde es
    nombre: a.displayName || a.fullName || "",
    dorsal: a.jersey || null,
    posicion: a.position?.displayName || a.position?.abbreviation || "",
    posCorta: a.position?.abbreviation || "",
    edad: a.age ?? null,
    pais: a.citizenship || a.birthPlace?.country || "",
    foto: a.headshot?.href || null,
    lesionado: (a.injuries || []).length > 0,
  })).filter(j => j.nombre);

  if (!salida.length) return null;

  // ESPN publica muy pocas fotos de futbolistas (2 de 49 en Boca).
  // Primero con el club (desambigua a los homónimos), después genérico.
  await completarFotos(salida, [
    feed.label,
    deporte === "rugby" ? "jugador de rugby" : "futbolista",
  ]);

  const orden = { G: 0, D: 1, M: 2, F: 3 };
  salida.sort((a, b) =>
    (orden[a.posCorta] ?? 9) - (orden[b.posCorta] ?? 9) ||
    (+a.dorsal || 999) - (+b.dorsal || 999));

  return salida;
}

/* ---------- noticias ---------- */
async function noticias(feed, deporte = "soccer") {
  const vistas = new Set();
  const salida = [];

  for (const liga of (feed.leagues || []).slice(0, 2)) {
    const d = await getJSON(`${ESPN}/${deporte}/${liga}/news`);
    for (const a of (d?.articles || [])) {
      const link = a.links?.web?.href;
      if (!link || vistas.has(link)) continue;
      vistas.add(link);
      // Algunas notas (rugby sobre todo) vienen sin ninguna fecha:
      // se guardan igual, y la interfaz simplemente no muestra el dato.
      const fecha = a.published || a.lastModified || null;
      salida.push({
        titulo: a.headline || "",
        resumen: a.description || "",
        fecha: (typeof fecha === "string" && fecha) ? fecha : null,
        imagen: a.images?.[0]?.url || null,
        link,
      });
    }
  }

  if (!salida.length) return null;
  // Las que no tienen fecha van al final, no al principio.
  salida.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return salida.slice(0, 12);
}


/* ---------- peleadores de UFC ----------
   ESPN publica un ranking libra por libra, pero está congelado alrededor
   de 2021: da a Usman y Ngannou como campeones y no trae fecha. Mostrarlo
   sería mostrar algo falso. En su lugar se arma la lista con los
   peleadores que de verdad aparecen en las carteleras del año, con el
   récord que ESPN publica para cada uno. */
async function peleadores(feed) {
  const anio = new Date().getUTCFullYear();
  const d = await getJSON(
    `${ESPN}/mma/ufc/scoreboard?dates=${anio}0101-${anio}1231&limit=200`);

  const porId = new Map();
  for (const ev of (d?.events || [])) {
    if (feed.excluirTitulo?.test(ev.name || "")) continue;
    for (const c of (ev.competitions || [])) {
      for (const x of (c.competitors || [])) {
        const a = x.athlete;
        if (!a?.displayName) continue;
        const id = x.id || a.id;
        const previo = porId.get(id);
        const record = (x.records || [])[0]?.summary || previo?.record || "";
        porId.set(id, {
          id,
          nombre: a.displayName,
          bandera: a.flag?.href || previo?.bandera || null,
          categoria: c.type?.abbreviation || previo?.categoria || "",
          record,
          peleas: (previo?.peleas || 0) + 1,
          gano: (previo?.gano || 0) + (x.winner ? 1 : 0),
        });
      }
    }
  }

  const lista = [...porId.values()];
  if (!lista.length) return null;

  // Orden: primero los que más ganaron este año, después por récord.
  const victorias = r => +(String(r || "0-0").split("-")[0]) || 0;
  lista.sort((a, b) => b.gano - a.gano || victorias(b.record) - victorias(a.record));
  return lista.slice(0, 40);
}

/* ---------- resultados recientes (para UFC) ---------- */
async function resultadosRecientes(feed, deporte, eventos) {
  const ahora = Date.now();
  const pasados = eventos
    .filter(e => e.feedId === feed.id && new Date(e.inicio).getTime() < ahora)
    .slice(-8).reverse();

  if (!pasados.length) return null;
  return pasados.map(e => ({
    titulo: e.titulo, fecha: e.inicio,
    marcador: e.marcador || null, sede: e.sede || "",
  }));
}

/* ---------- orquestador por feed ---------- */
export async function fetchExtras(feed, eventos, log = console.log) {
  const salida = { compitiendo: [], posiciones: null, plantel: null, noticias: null,
                   resultados: null, peleadores: null };

  // En qué competencias aparece este año, deducido del calendario real.
  // Le sacamos el sufijo de ronda ("· Ronda 12"), si no F1 parece estar
  // compitiendo en 23 campeonatos distintos.
  // Se guarda también la liga y el deporte de cada una, para poder abrir
  // después la tabla o el fixture de ese torneo en particular.
  const vistas = new Map();
  for (const e of eventos) {
    if (e.feedId !== feed.id || !e.competicion) continue;
    const nombre = e.competicion.replace(/\s*·\s*Ronda\s*\d+\s*$/i, "").trim();
    if (!nombre || vistas.has(nombre)) continue;
    vistas.set(nombre, { nombre, liga: e.liga || null, ruta: e.ruta || null });
  }
  salida.compitiendo = [...vistas.values()].slice(0, 6);

  const deporte = feed.source === "espn-rugby" ? "rugby"
                : feed.source === "espn-mma"   ? "mma"
                : "soccer";

  if (feed.source === "jolpica-f1") {
    salida.posiciones = await posicionesF1();
    salida.noticias   = await noticias({ leagues: ["f1"] }, "racing");
  } else if (feed.source === "espn-mma") {
    // Los rankings de ESPN para MMA están congelados en ~2021 (sin fecha ni
    // temporada en la respuesta), así que mostramos resultados reales.
    salida.resultados  = await resultadosRecientes(feed, deporte, eventos);
    salida.peleadores  = await peleadores(feed);
    salida.noticias    = await noticias(feed, deporte);
  } else if (feed.source === "espn-rugby") {
    // ESPN no publica tabla ni plantel para Test Matches. Sólo calendario.
    salida.noticias = await noticias(feed, deporte);
  } else {
    salida.posiciones = await posicionesFutbol(feed, deporte);
    salida.plantel    = await plantel(feed, deporte);
    salida.noticias   = await noticias(feed, deporte);
  }

  const tiene = [
    salida.posiciones && "posiciones",
    salida.plantel && `plantel(${salida.plantel.length})`,
    salida.noticias && `noticias(${salida.noticias.length})`,
    salida.resultados && `resultados(${salida.resultados.length})`,
    salida.peleadores && `peleadores(${salida.peleadores.length})`,
  ].filter(Boolean);
  log(`   · ${tiene.length ? tiene.join(", ") : "sólo calendario"}`);

  return salida;
}
