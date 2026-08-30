// Adaptadores: cada fuente devuelve eventos ya normalizados.
const ESPN = "https://site.api.espn.com/apis/site/v2/sports";
const UA = { "User-Agent": "Mozilla/5.0 (mis-deportes)" };

async function getJSON(url, { retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (r.status === 404 || r.status === 400) return null; // liga inexistente: se ignora
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === retries) { console.warn(`   ! falló ${url.slice(0, 90)} — ${e.message}`); return null; }
      await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
}

const yyyymmdd = d => d.toISOString().slice(0, 10).replace(/-/g, "");

// ESPN limita cuántos eventos devuelve por consulta, así que pedimos mes por mes.
function monthChunks(desde, hasta) {
  const out = [];
  let cur = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1));
  while (cur <= hasta) {
    const fin = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    out.push([new Date(Math.max(cur, desde)), new Date(Math.min(fin, hasta))]);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

// ¿Este evento involucra al equipo que sigo?
function esMiEquipo(ev, feed) {
  const comp = ev.competitions?.[0];
  if (feed.matchTeamId && comp?.competitors?.some(c => String(c.team?.id) === String(feed.matchTeamId)))
    return true;
  if (feed.matchName) {
    if (comp?.competitors?.some(c => feed.matchName.test(c.team?.displayName || "")))
      return true;
    // último recurso: el nombre del evento ("X at Y")
    if (!comp?.competitors?.length) return feed.matchName.test(ev.name || "");
  }
  return false;
}

function normalizarESPN(ev, feed, ligaNombre, liga, ruta) {
  const comp = ev.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find(c => c.homeAway === "home")?.team;
  const away = cs.find(c => c.homeAway === "away")?.team;
  const status = ev.status?.type?.name || comp.status?.type?.name || "";
  const finalizado = /FINAL|FULL_TIME/i.test(status);

  let titulo = ev.name || ev.shortName || "Evento";
  if (home && away) titulo = `${home.displayName} vs ${away.displayName}`;

  let marcador = null;
  if (finalizado && cs.length === 2) {
    const h = cs.find(c => c.homeAway === "home"), a = cs.find(c => c.homeAway === "away");
    if (h?.score != null && a?.score != null) marcador = `${h.score} - ${a.score}`;
  }

  // ¿De qué lado juega mi equipo? Se decide con el id, que no falla,
  // y no comparando nombres, que sí falla cuando se parecen.
  const idMio = String(feed.matchTeamId || "");
  let miLado = null;
  if (idMio) {
    if (String(home?.id) === idMio) miLado = "local";
    else if (String(away?.id) === idMio) miLado = "visitante";
  }
  if (!miLado && feed.matchName) {
    if (home && feed.matchName.test(home.displayName || "")) miLado = "local";
    else if (away && feed.matchName.test(away.displayName || "")) miLado = "visitante";
  }

  return {
    id: `espn-${ev.id}`,
    miLado,
    idEspn: ev.id, liga, ruta,   // para pedir el detalle al tocarlo
    feedId: feed.id, feedLabel: feed.label, sport: feed.sport, emoji: feed.emoji,
    titulo,
    inicio: ev.date,                       // ISO en UTC
    horaConfirmada: !comp.timeValid === false ? true : comp.timeValid !== false,
    competicion: ligaNombre || comp.notes?.[0]?.headline || "",
    sede: comp.venue?.fullName || "",
    local: home?.displayName || null, visitante: away?.displayName || null,
    logoLocal: home?.logo || null, logoVisitante: away?.logo || null,
    finalizado, marcador,
  };
}

// ---------- ESPN: fútbol / rugby / MMA ----------
async function fetchESPN(feed, desde, hasta, deporteRuta, log = console.log) {
  const eventos = [];
  for (const liga of feed.leagues || []) {
    let encontrados = 0;
    for (const [a, b] of monthChunks(desde, hasta)) {
      const url = `${ESPN}/${deporteRuta}/${liga}/scoreboard?dates=${yyyymmdd(a)}-${yyyymmdd(b)}&limit=500`;
      const d = await getJSON(url);
      if (!d?.events) continue;
      const ligaNombre = d.leagues?.[0]?.name || liga;
      for (const ev of d.events) {
        // UFC: nos interesan todos los eventos, no un "equipo"
        // Algunos feeds descartan eventos por su nombre (ver excluirTitulo).
        if (feed.excluirTitulo && feed.excluirTitulo.test(ev.name || "")) continue;

        if (feed.source === "espn-mma" || esMiEquipo(ev, feed)) {
          eventos.push(normalizarESPN(ev, feed, ligaNombre, liga, deporteRuta));
          encontrados++;
        }
      }
    }
    if (encontrados) log(`   · ${liga}: ${encontrados}`);
  }
  return eventos;
}

// ---------- Fórmula 1 (Jolpica, sucesor libre de Ergast) ----------
async function fetchF1(feed, desde, hasta, log = console.log) {
  const eventos = [];
  const anios = [...new Set([desde.getUTCFullYear(), hasta.getUTCFullYear()])];

  for (const anio of anios) {
    const d = await getJSON(`https://api.jolpi.ca/ergast/f1/${anio}/races/?format=json&limit=100`);
    const races = d?.MRData?.RaceTable?.Races || [];
    if (races.length) log(`   · temporada ${anio}: ${races.length} GP`);

    for (const r of races) {
      const gp = r.raceName.replace(/ Grand Prix$/, "");
      const sede = `${r.Circuit?.circuitName || ""}${r.Circuit?.Location?.country ? ", " + r.Circuit.Location.country : ""}`;
      const base = {
        feedId: feed.id, feedLabel: feed.label, sport: feed.sport, emoji: feed.emoji,
        competicion: `Fórmula 1 ${anio} · Ronda ${r.round}`, sede,
        local: null, visitante: null, logoLocal: null, logoVisitante: null,
        finalizado: false, marcador: null, horaConfirmada: true,
      };
      const iso = (fecha, hora) => fecha ? (hora ? `${fecha}T${hora}` : `${fecha}T12:00:00Z`) : null;

      // La carrera siempre; las demás sesiones sólo si están configuradas.
      const sesiones = [["Carrera", r.date, r.time, ""]];
      if (feed.incluirSesiones) {
        if (r.Qualifying) sesiones.push(["Clasificación", r.Qualifying.date, r.Qualifying.time, "-q"]);
        if (r.Sprint)     sesiones.push(["Sprint",        r.Sprint.date,     r.Sprint.time,     "-s"]);
      }

      for (const [nombre, fecha, hora, sufijo] of sesiones) {
        const inicio = iso(fecha, hora);
        if (!inicio) continue;
        const t = new Date(inicio);
        if (isNaN(t) || t < desde || t > hasta) continue;
        eventos.push({
          ...base,
          id: `f1-${anio}-${r.round}${sufijo}`,
          anio, ronda: r.round, sesion: nombre,
          titulo: `GP ${gp}${nombre === "Carrera" ? "" : " · " + nombre}`,
          inicio: t.toISOString(),
          finalizado: t < new Date(),
        });
      }
    }
  }
  return eventos;
}

export async function fetchFeed(feed, desde, hasta, log = console.log) {
  switch (feed.source) {
    case "espn-soccer": return fetchESPN(feed, desde, hasta, "soccer", log);
    case "espn-rugby":  return fetchESPN(feed, desde, hasta, "rugby", log);
    case "espn-mma":    return fetchESPN(feed, desde, hasta, "mma", log);
    case "jolpica-f1":  return fetchF1(feed, desde, hasta, log);
    default:
      console.warn(`   ! fuente desconocida: ${feed.source}`);
      return [];
  }
}
