/* Consultas en vivo a ESPN y Jolpica desde el navegador.
   Las tres APIs permiten CORS, así que el detalle de un partido y el
   marcador en directo se piden en el momento, sin esperar a la
   actualización horaria del repositorio. */
"use strict";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const ESPN_WEB = "https://site.web.api.espn.com/apis/common/v3/sports";
const JOLPICA = "https://api.jolpi.ca/ergast/f1";

// Caché en memoria: evita repetir la misma consulta al volver atrás.
// Lo que cambia (marcadores en vivo) vive poco; las fichas, más.
const cache = new Map();

async function pedir(url, segundos = 60) {
  const guardado = cache.get(url);
  if (guardado && Date.now() - guardado.t < segundos * 1000) return guardado.d;

  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    cache.set(url, { t: Date.now(), d });
    return d;
  } catch (e) {
    // Si ya teníamos algo viejo, es mejor que nada.
    if (guardado) return guardado.d;
    throw e;
  }
}

/* ---------- estado en vivo de una liga entera ---------- */
export async function marcadores(ruta, liga) {
  const d = await pedir(`${ESPN}/${ruta}/${liga}/scoreboard`, 45);
  const salida = {};
  for (const e of (d?.events || [])) {
    const c = e.competitions?.[0] || {};
    const cs = c.competitors || [];
    const est = e.status?.type?.name || "";
    salida[e.id] = {
      estado: est,
      enVivo: /IN|HALFTIME|FIRST_HALF|SECOND_HALF|PERIOD|OVERTIME/.test(est) &&
              !/FINAL|FULL_TIME|SCHEDULED|POSTPONED|CANCELED/.test(est),
      terminado: /FINAL|FULL_TIME/.test(est),
      detalle: e.status?.type?.detail || e.status?.type?.shortDetail || "",
      reloj: e.status?.displayClock || "",
      periodo: e.status?.period ?? null,
      local:     cs.find(x => x.homeAway === "home")?.team?.displayName || null,
      visitante: cs.find(x => x.homeAway === "away")?.team?.displayName || null,
      golesLocal:     cs.find(x => x.homeAway === "home")?.score ?? null,
      golesVisitante: cs.find(x => x.homeAway === "away")?.score ?? null,
      logoLocal:     cs.find(x => x.homeAway === "home")?.team?.logo || null,
      logoVisitante: cs.find(x => x.homeAway === "away")?.team?.logo || null,
    };
  }
  return salida;
}

// ESPN suele mandar `athletesInvolved` vacío pero el nombre está dentro
// del texto. Los formatos que usa son, por ejemplo:
//   "Goal! Newell's 0, Boca 1. Santiago Dalmasso (Boca) header from..."
//   "Ayrton Costa (Boca Juniors) is shown the yellow card."
//   "Substitution, Boca Juniors. Milton Delgado replaces Alan Velasco."
function quienEs(texto) {
  if (!texto) return "";

  const cambio = texto.match(/([A-ZÁÉÍÓÚÑ][^.,]{2,40}?)\s+replaces\s+([A-ZÁÉÍÓÚÑ][^.,]{2,40})/);
  if (cambio) {
    const sale = cambio[2].split(" because")[0].split(" due to")[0].trim();
    return `${cambio[1].trim()} ↔ ${sale}`;
  }

  // Nombre seguido del equipo entre paréntesis: es lo más confiable.
  const conEquipo = texto.match(/([A-ZÁÉÍÓÚÑ][A-Za-zÀ-ÿ'’.\- ]{2,40})\s+\(/);
  if (conEquipo) return conEquipo[1].trim();

  return "";
}

/* ---------- detalle de un partido ---------- */
export async function detallePartido(ruta, liga, idEvento) {
  const d = await pedir(`${ESPN}/${ruta}/${liga}/summary?event=${idEvento}`, 45);
  if (!d) return null;

  const cab = d.header?.competitions?.[0] || {};
  const cs = cab.competitors || [];
  const equipo = lado => {
    const c = cs.find(x => x.homeAway === lado);
    return c ? {
      nombre: c.team?.displayName || "", abrev: c.team?.abbreviation || "",
      logo: c.team?.logos?.[0]?.href || c.team?.logo || null,
      goles: c.score ?? null, ganador: !!c.winner,
    } : null;
  };

  // Los eventos clave traen mucho ruido (demoras, comienzos). Nos quedamos
  // con lo que de verdad querés ver.
  const RELEVANTE = /goal|card|substitut|penalty|red|yellow|own goal|try|conversion|drop/i;
  const RUIDO = /delay|kickoff|begins|end of|half.?time.?(begins|ends)?$/i;

  const jugadas = (d.keyEvents || [])
    .filter(k => {
      const t = (k.type?.text || "") + " " + (k.text || "");
      return RELEVANTE.test(t) && !RUIDO.test(k.type?.text || "");
    })
    .map(k => ({
      minuto: k.clock?.displayValue || "",
      tipo: tipoEnEspanol(k.type?.text || ""),
      texto: k.text || "",
      quien: (k.athletesInvolved || []).map(a => a.displayName).join(", ") || quienEs(k.text),
      equipo: k.team?.displayName || "",
      esGol: /goal/i.test(k.type?.text || "") && !/disallowed|missed/i.test(k.text || ""),
      esRoja: /red card/i.test(k.type?.text || ""),
      esAmarilla: /yellow card/i.test(k.type?.text || ""),
      esCambio: /substitut/i.test(k.type?.text || ""),
    }));

  const formaciones = (d.rosters || []).map(r => ({
    equipo: r.team?.displayName || "",
    logo: r.team?.logo || null,
    formacion: r.formation || null,
    jugadores: (r.roster || []).map(p => ({
      nombre: p.athlete?.displayName || "",
      id: p.athlete?.id || null,
      dorsal: p.jersey || null,
      posicion: p.position?.abbreviation || "",
      titular: !!p.starter,
      capitan: !!p.captain,
      entro: !!p.subbedIn,
      salio: !!p.subbedOut,
    })),
  }));

  // ESPN publica clips por jugada en las ligas donde transmite (MLS sí,
  // la liga argentina no). Se los engancha al gol por el apellido del que
  // aparece en el titular del video.
  const videos = (d.videos || []).map(v => ({
    titulo: v.headline || v.title || "",
    link: v.links?.web?.href || v.links?.mobile?.href || null,
    duracion: v.duration || null,
    imagen: v.thumbnail || v.images?.[0]?.url || null,
  })).filter(v => v.link);

  // Enganchar cada clip con su gol. Tres reglas para no equivocarse:
  //  - el titular tiene que hablar de un gol (hay clips de atajadas),
  //  - el mismo clip no puede quedar en dos goles distintos,
  //  - el gol en contra se reconoce por el texto, porque ESPN no le
  //    pone autor y así quedaba sin enlace.
  const usados = new Set();
  const HABLA_DE_GOL = /goal|score|strike|header|penalty|golazo/i;

  for (const jg of jugadas) {
    if (!jg.esGol) continue;

    const enContra = /own goal/i.test(jg.texto || "");
    let clip = null;

    if (enContra) {
      clip = videos.find(v => !usados.has(v.link) && /own goal/i.test(v.titulo));
    } else if (jg.quien) {
      const apellido = jg.quien.split(" ").pop().toLowerCase();
      if (apellido.length >= 4) {
        clip = videos.find(v =>
          !usados.has(v.link) &&
          !/own goal/i.test(v.titulo) &&
          HABLA_DE_GOL.test(v.titulo) &&
          v.titulo.toLowerCase().includes(apellido));
      }
    }

    if (clip) { jg.video = clip.link; usados.add(clip.link); }
  }

  const estadisticas = (d.boxscore?.teams || []).map(t => ({
    equipo: t.team?.displayName || "",
    datos: (t.statistics || []).map(s => ({ nombre: s.name, valor: s.displayValue })),
  }));

  return {
    local: equipo("home"), visitante: equipo("away"),
    estado: d.header?.competitions?.[0]?.status?.type?.description || "",
    detalleEstado: cab.status?.type?.detail || "",
    sede: d.gameInfo?.venue?.fullName || "",
    ciudad: d.gameInfo?.venue?.address?.city || "",
    publico: d.gameInfo?.attendance || null,
    arbitros: (d.gameInfo?.officials || []).map(o => o.displayName || o.fullName).filter(Boolean),
    jugadas, formaciones, estadisticas, videos,
  };
}


// Tipos de jugada tal como los escribe ESPN.
const JUGADAS = {
  "goal": "Gol",
  "own goal": "Gol en contra",
  "goal - header": "Gol de cabeza",
  "goal - free kick": "Gol de tiro libre",
  "goal - penalty": "Gol de penal",
  "penalty - scored": "Penal convertido",
  "penalty - missed": "Penal errado",
  "penalty - saved": "Penal atajado",
  "yellow card": "Amarilla",
  "red card": "Roja",
  "second yellow card": "Doble amarilla",
  "substitution": "Cambio",
  "try": "Try",
  "conversion": "Conversión",
  "penalty goal": "Penal",
  "drop goal": "Drop",
  "player substituted": "Sale",
  "substitute on": "Entra",
};

function tipoEnEspanol(t) {
  if (!t) return "";
  const k = t.toLowerCase().trim();
  if (JUGADAS[k]) return JUGADAS[k];
  // "Goal - Header" y variantes: traducimos la parte conocida.
  const base = k.split(" - ")[0];
  if (JUGADAS[base]) {
    const resto = k.slice(base.length).replace(/^ - /, "");
    const DETALLE = { header: "de cabeza", "free kick": "de tiro libre",
                      penalty: "de penal", "own goal": "en contra",
                      volley: "de volea", "solo run": "en jugada individual" };
    return DETALLE[resto] ? `${JUGADAS[base]} ${DETALLE[resto]}` : JUGADAS[base];
  }
  return t;
}

// Puestos, como los nombra ESPN.
const PUESTOS = {
  "goalkeeper": "Arquero", "defender": "Defensor", "midfielder": "Mediocampista",
  "forward": "Delantero", "striker": "Delantero", "winger": "Extremo",
  "centre-back": "Central", "center back": "Central", "full-back": "Lateral",
  "left back": "Lateral izquierdo", "right back": "Lateral derecho",
  "defensive midfielder": "Volante central", "attacking midfielder": "Enganche",
  "fly-half": "Apertura", "scrum-half": "Medio scrum", "fullback": "Fullback",
  "hooker": "Hooker", "prop": "Pilar", "lock": "Segunda línea",
  "flanker": "Ala", "number 8": "Octavo", "centre": "Centro", "wing": "Wing",
};

function puestoEnEspanol(p) {
  if (!p) return "";
  return PUESTOS[p.toLowerCase().trim()] || p;
}

// Nombres de estadística tal como los manda ESPN, traducidos.
// Los que unen dos valores con guión ("14-4-1") conservan ese formato.
const ESTADISTICAS = {
  "Starts-Substitute Appearances": "Titular / suplente",
  "Saves": "Atajadas",
  "Clean Sheet": "Vallas invictas",
  "Goals Against": "Goles recibidos",
  "Total Goals": "Goles",
  "Assists": "Asistencias",
  "Shots": "Remates",
  "Shots On Target": "Remates al arco",
  "Appearances": "Partidos",
  "Yellow Cards": "Amarillas",
  "Red Cards": "Rojas",
  "Fouls Committed": "Faltas",
  "Minutes": "Minutos",
  "Wins-Losses-Draws": "Ganadas / perdidas / empatadas",
  "Technical Knockout-Technical Knockout Losses": "Nocauts a favor / en contra",
  "Submissions-Submission Losses": "Sumisiones a favor / en contra",
  "Knockouts": "Nocauts",
};

function nombreEstadistica(n) {
  if (!n) return "";
  return ESTADISTICAS[n] || n;
}

/* ---------- ficha de un jugador ---------- */
export async function fichaJugador(ruta, liga, id) {
  const d = await pedir(`${ESPN_WEB}/${ruta}/${liga}/athletes/${id}`, 3600);
  const a = d?.athlete;
  if (!a) return null;
  return {
    nombre: a.displayName || a.fullName || "",
    dorsal: a.jersey || null,
    posicion: puestoEnEspanol(a.position?.displayName || ""),
    equipo: a.team?.displayName || "",
    logoEquipo: a.team?.logos?.[0]?.href || null,
    pais: a.citizenship || a.citizenshipCountry?.name || "",
    bandera: a.flag?.href || a.citizenshipCountry?.flag?.href || null,
    foto: a.headshot?.href || null,
    edad: a.age ?? null,
    nacimiento: a.displayDOB || null,
    altura: a.displayHeight || null,
    peso: a.displayWeight || null,
    activo: a.active !== false,
    estado: a.status?.name || null,
    // "statsSummary" es lo que ESPN publica de la temporada en curso.
    // Los nombres vienen en inglés y con guiones que juntan dos cosas.
    estadisticas: (a.statsSummary?.statistics || [])
      .map(s => ({ nombre: nombreEstadistica(s.displayName), valor: s.displayValue })),
    // Récord acumulado (lo usa MMA)
    record: (a.records || []).map(r => ({ nombre: r.name, valor: r.summary })),
  };
}

/* ---------- Fórmula 1 ---------- */
export async function detalleGP(anio, ronda) {
  const [res, cla] = await Promise.all([
    pedir(`${JOLPICA}/${anio}/${ronda}/results/?format=json&limit=100`, 600).catch(() => null),
    pedir(`${JOLPICA}/${anio}/${ronda}/qualifying/?format=json&limit=100`, 600).catch(() => null),
  ]);

  const carrera = res?.MRData?.RaceTable?.Races?.[0] || cla?.MRData?.RaceTable?.Races?.[0];
  if (!carrera) return null;

  return {
    nombre: carrera.raceName,
    circuito: carrera.Circuit?.circuitName || "",
    lugar: [carrera.Circuit?.Location?.locality, carrera.Circuit?.Location?.country]
             .filter(Boolean).join(", "),
    fecha: carrera.date,
    resultados: (carrera.Results || []).map(r => ({
      pos: r.position, piloto: `${r.Driver.givenName} ${r.Driver.familyName}`,
      codigo: r.Driver.code || "", nacionalidad: r.Driver.nationality || "",
      equipo: r.Constructor?.name || "", grilla: r.grid,
      vueltas: r.laps, tiempo: r.Time?.time || r.status,
      puntos: r.points, vueltaRapida: r.FastestLap?.rank === "1",
    })),
    clasificacion: (cla?.MRData?.RaceTable?.Races?.[0]?.QualifyingResults || []).map(q => ({
      pos: q.position, piloto: `${q.Driver.givenName} ${q.Driver.familyName}`,
      equipo: q.Constructor?.name || "",
      q1: q.Q1 || null, q2: q.Q2 || null, q3: q.Q3 || null,
    })),
  };
}

/* ---------- UFC: cartelera de un evento ---------- */
export async function carteleraUFC(idEvento) {
  // El scoreboard de MMA ya trae cada pelea dentro del evento.
  const d = await pedir(`${ESPN}/mma/ufc/scoreboard?dates=${idEvento.fecha}`, 60);
  const ev = (d?.events || []).find(e => String(e.id) === String(idEvento.id));
  if (!ev) return null;

  const peleas = (ev.competitions || []).map((c, i) => {
    const cs = c.competitors || [];
    const metodo = (c.details || []).find(x => /Winner|Decision|Submission|Knockout/i.test(x.type?.text || ""));
    return {
      orden: i,
      categoria: c.type?.abbreviation || c.type?.text || "",
      rounds: c.format?.regulation?.periods || null,
      estado: c.status?.type?.description || "",
      terminado: /final/i.test(c.status?.type?.name || ""),
      peleadores: cs.map(x => ({
        id: x.athlete?.id || x.id,
        nombre: x.athlete?.displayName || "",
        bandera: x.athlete?.flag?.href || null,
        gana: !!x.winner,
        record: (x.records || [])[0]?.summary || "",
      })),
      metodo: (metodo?.type?.text || "")
        .replace(/^Unofficial Winner\s*/i, "")
        .replace(/\bKotko\b/i, "KO/TKO")
        .replace(/^Submission Attempt$/i, "")
        .trim(),
    };
  });

  // La cartelera viene de la pelea menos importante a la más importante.
  // La damos vuelta: arriba el evento principal.
  peleas.reverse().forEach((p, i) => { p.orden = i; });
  return { nombre: ev.name, sede: ev.competitions?.[0]?.venue?.fullName || "", peleas };
}

/* ---------- información de un torneo ----------
   Devuelve todos los grupos de la tabla. En copas de eliminación
   directa la tabla viene vacía: ahí quien llama muestra el fixture. */
export async function infoTorneo(ruta, liga) {
  const anio = new Date().getUTCFullYear();
  const d = await pedir(
    `https://site.web.api.espn.com/apis/v2/sports/${ruta}/${liga}/standings?season=${anio}`, 900
  ).catch(() => null);

  const crudos = d?.children?.length ? d.children
               : d?.standings ? [{ name: d.name, standings: d.standings }]
               : [];

  const stat = (fila, nombre) => {
    const x = (fila.stats || []).find(y => y.name === nombre);
    return x ? (x.displayValue ?? x.value) : null;
  };

  const grupos = crudos.map(g => ({
    nombre: g.name || "Tabla",
    filas: (g.standings?.entries || []).map(e => ({
      equipo: e.team?.displayName || "",
      logo: e.team?.logos?.[0]?.href || null,
      id: e.team?.id || null,
      pj: stat(e, "gamesPlayed"), pts: stat(e, "points"),
      g: stat(e, "wins"), emp: stat(e, "ties"), p: stat(e, "losses"),
      dg: stat(e, "pointDifferential"),
    })),
  })).filter(g => g.filas.length);

  for (const g of grupos) {
    g.filas.sort((a, b) => (+b.pts || 0) - (+a.pts || 0) || (+b.dg || 0) - (+a.dg || 0));
    g.filas.forEach((f, i) => f.pos = i + 1);
  }

  return { nombre: d?.name || liga, grupos };
}

/* ---------- historial de un peleador ----------
   ESPN lo esconde en `eventsMap` dentro de la ficha del atleta: una
   entrada por pelea, con rival, resultado y si fue por el título. */
export async function historialPeleador(id) {
  const d = await pedir(`${ESPN_WEB}/mma/ufc/athletes/${id}`, 3600).catch(() => null);
  const mapa = d?.eventsMap || {};

  const peleas = Object.values(mapa)
    .map(e => ({
      fecha: e.gameDate || null,
      resultado: e.gameResult || null,        // W / L / D
      rival: e.opponent?.displayName || "",
      rivalId: e.opponent?.id || null,
      evento: e.shortName || e.name || "",
      porTitulo: !!e.titleFight,
    }))
    .filter(p => p.rival)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const cuenta = { W: 0, L: 0, D: 0 };
  for (const p of peleas) if (cuenta[p.resultado] != null) cuenta[p.resultado]++;

  return {
    nombre: d?.athlete?.displayName || "",
    peleas,
    resumen: `${cuenta.W}-${cuenta.L}${cuenta.D ? "-" + cuenta.D : ""}`,
    porTitulo: peleas.filter(p => p.porTitulo).length,
  };
}

/* ---------- jugadas de rugby ----------
   ESPN no las pone en el `summary` (por eso parecía que no existían),
   sino en la API núcleo. Cada jugada referencia al jugador por URL; en
   vez de resolver 48 referencias una por una, se arma un mapa con la
   alineación —que ya tenemos— y se traducen ahí mismo. */
const NOMBRE_JUGADA = {
  "try": "Try",
  "conversion": "Conversión",
  "penalty goal": "Penal",
  "drop goal": "Drop",
  "player substituted": "Sale",
  "substitute on": "Entra",
  "yellow card": "Amarilla",
  "red card": "Roja",
};

export async function jugadasRugby(liga, idEvento, mapaJugadores) {
  const base = `https://sports.core.api.espn.com/v2/sports/rugby/leagues/${liga}` +
               `/events/${idEvento}/competitions/${idEvento}/plays`;

  // Vienen de a 25; con dos páginas alcanza para un partido entero.
  const paginas = await Promise.all([1, 2].map(p =>
    pedir(`${base}?limit=25&page=${p}`, 60).catch(() => null)));

  const crudas = paginas.flatMap(p => p?.items || []);
  if (!crudas.length) return [];

  return crudas.map(p => {
    const ref = p.participants?.[0]?.athlete?.$ref || "";
    const id = (ref.match(/athletes\/(\d+)/) || [])[1];
    const jug = mapaJugadores[id];
    const tipo = (p.type?.text || "").toLowerCase();

    return {
      minuto: p.clock?.displayValue || "",
      tipo: NOMBRE_JUGADA[tipo] || p.type?.text || "",
      quien: jug?.nombre || "",
      equipo: jug?.equipo || "",
      marcador: (p.homeScore != null && p.awayScore != null)
        ? `${p.homeScore}-${p.awayScore}` : null,
      esGol: /try|penalty goal|drop goal|conversion/.test(tipo),
      esTry: tipo === "try",
      esRoja: tipo === "red card",
      esAmarilla: tipo === "yellow card",
      esCambio: /substitut/.test(tipo),
    };
  });
}

/* ---------- forma reciente de los dos equipos ---------- */
export async function formaReciente(ruta, liga, idEvento) {
  const d = await pedir(`${ESPN}/${ruta}/${liga}/summary?event=${idEvento}`, 300).catch(() => null);
  return (d?.lastFiveGames || []).map(g => ({
    equipo: g.team?.displayName || "",
    logo: g.team?.logo || g.team?.logos?.[0]?.href || null,
    partidos: (g.events || []).map(e => ({
      fecha: e.gameDate || null,
      rival: e.opponent?.displayName || "",
      marcador: e.score || "",
      resultado: e.gameResult || "",
    })),
  })).filter(g => g.partidos.length);
}

/* ---------- ficha de un piloto de F1 ---------- */
export async function fichaPiloto(anio, driverId) {
  const [bio, res] = await Promise.all([
    pedir(`${JOLPICA}/drivers/${driverId}/?format=json`, 86400).catch(() => null),
    pedir(`${JOLPICA}/${anio}/drivers/${driverId}/results/?format=json&limit=100`, 600).catch(() => null),
  ]);

  const d = bio?.MRData?.DriverTable?.Drivers?.[0];
  if (!d) return null;

  const carreras = (res?.MRData?.RaceTable?.Races || []).map(r => {
    const x = r.Results?.[0] || {};
    return {
      ronda: r.round, gp: r.raceName.replace(/ Grand Prix$/, ""),
      fecha: r.date,
      grilla: x.grid, posicion: x.position, puntos: x.points,
      estado: x.status || "", tiempo: x.Time?.time || null,
      vueltas: x.laps, equipo: x.Constructor?.name || "",
      abandono: !/finished|\+\d+ lap/i.test(x.status || ""),
    };
  });

  const puntos = carreras.reduce((s, c) => s + (+c.puntos || 0), 0);
  const podios = carreras.filter(c => +c.posicion <= 3).length;
  const victorias = carreras.filter(c => +c.posicion === 1).length;
  const abandonos = carreras.filter(c => c.abandono).length;

  return {
    id: driverId,
    nombre: `${d.givenName} ${d.familyName}`,
    numero: d.permanentNumber || null,
    codigo: d.code || "",
    nacimiento: d.dateOfBirth || null,
    nacionalidad: d.nationality || "",
    equipo: carreras[carreras.length - 1]?.equipo || "",
    carreras, puntos, podios, victorias, abandonos,
  };
}

/* ---------- acciones dentro de una pelea ----------
   ESPN no publica las tarjetas de los jueces (el 10-9 de cada asalto).
   Lo que sí hay es el registro de acciones: derribos, intentos de
   sumisión y el corte de cada asalto. */
export async function accionesPelea(idEvento, idPelea) {
  const d = await pedir(
    `https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/${idEvento}` +
    `/competitions/${idPelea}/plays?limit=40`, 600
  ).catch(() => null);

  const items = d?.items || [];
  if (!items.length) return [];

  const detalles = await Promise.all(items.map(it => pedir(it.$ref, 3600).catch(() => null)));

  const RUIDO = /fight open|walkout|tale of the tape|staredown|introduction/i;
  return detalles.filter(Boolean)
    .filter(p => !RUIDO.test(p.type?.text || ""))
    .map(p => ({
      asalto: p.period?.number ?? null,
      reloj: p.clock?.displayValue || "",
      tipo: p.type?.text || "",
      esInicio: /round start/i.test(p.type?.text || ""),
      esFin: /round end|fight over/i.test(p.type?.text || ""),
    }));
}
