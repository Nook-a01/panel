// Marcador en vivo por notificación.
//
// QUÉ RESUELVE
// La app ya muestra el marcador en directo, pero hay que abrirla. Lo que se
// pidió era verlo de un vistazo, como una Live Activity de la pantalla de
// bloqueo. Eso, tal cual, una página web no lo puede hacer: las Live Activities
// son de apps nativas de iOS y no hay API web equivalente.
//
// Lo más parecido que sí existe: una notificación que se actualiza sola. El
// service worker ya muestra los avisos con `tag`, y cuando llega otro con el
// MISMO tag el sistema REEMPLAZA el anterior en vez de apilarlo. Así, durante
// todo el partido hay una sola notificación que va cambiando el resultado y el
// minuto — que es el efecto que se buscaba.
//
//   node scripts/vivo.mjs            → manda de verdad
//   node scripts/vivo.mjs --dry-run  → sólo muestra qué mandaría
//
// POR QUÉ NO MOLESTA A CADA RATO
// Cada aviso lleva `silencioso`. Los cambios de minuto van silenciosos: cambian
// el texto de la notificación que ya está, sin sonar ni vibrar. Sólo el
// arranque, el gol y el final suenan, que es cuando vale la pena interrumpir.
// Molestar por cada minuto sería volver a lo de antes, que es lo que se pidió
// sacar.

import webpush from "web-push";
import { readFileSync, existsSync } from "node:fs";
import { CONFIG } from "../config.mjs";

const DRY = process.argv.includes("--dry-run");

const EVENTOS = new URL("../docs/deportes/data/events.json", import.meta.url);
// El estado vive en el Worker, no en el repo: esta tarea corre cada 5 minutos y
// guardarlo en git dejaría decenas de commits por partido.
const WORKER  = "https://plata.hamcqc.workers.dev";
const CLAVE   = process.env.CLAVE_APP || "";
const ESPN    = "https://site.api.espn.com/apis/site/v2/sports";

// Ventana en la que un partido puede seguir en juego. El fútbol con demoras y
// alargue rara vez pasa de 3 h; el rugby y la UFC tampoco.
const VENTANA_MS = 3.5 * 3600e3;

/* ---------- credenciales (igual que send-push.mjs) ---------- */
function credenciales() {
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE)
    return { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  const f = new URL("../.vapid.json", import.meta.url);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  return null;
}
function suscripciones() {
  const crudo = process.env.PUSH_SUBSCRIPTION;
  if (crudo) { const v = JSON.parse(crudo); return Array.isArray(v) ? v : [v]; }
  const f = new URL("../.subscriptions.json", import.meta.url);
  if (existsSync(f)) { const v = JSON.parse(readFileSync(f, "utf8")); return Array.isArray(v) ? v : [v]; }
  return [];
}

const vapid = credenciales();
const subs  = suscripciones();
if (!vapid) { console.error("✗ Faltan las claves VAPID."); process.exit(1); }
if (!subs.length && !DRY) {
  // Salir con éxito y no con error: "nadie se suscribió todavía" es normal, y
  // fallar acá mandaría un mail de workflow roto cada cinco minutos.
  console.log("· Todavía no hay ninguna suscripción.");
  process.exit(0);
}
webpush.setVapidDetails(CONFIG.contacto, vapid.publicKey, vapid.privateKey);

/* ---------- fecha en tu zona ---------- */
const claveDia = ms => new Intl.DateTimeFormat("en-CA", {
  timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(ms));

/* ---------- envío ---------- */
async function enviar(payload) {
  if (DRY) { console.log("   [dry-run] " + payload.title + " — " + payload.body.replace(/\n/g, " | ")); return true; }
  let alguno = false;
  for (const sub of subs) {
    try { await webpush.sendNotification(sub, JSON.stringify(payload)); alguno = true; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410)
        console.warn("   ! suscripción vencida, hay que reactivar los avisos en el celular");
      else console.warn("   ! error al enviar (" + e.statusCode + "): " + e.message);
    }
  }
  return alguno;
}

/* ---------- ESPN ---------- */
async function marcadores(ruta, liga) {
  try {
    const r = await fetch(`${ESPN}/${ruta}/${liga}/scoreboard`, {
      headers: { "user-agent": "Mozilla/5.0 (panel)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return {};
    const d = await r.json();
    const out = {};
    for (const e of (d?.events || [])) {
      const cs = e.competitions?.[0]?.competitors || [];
      const est = e.status?.type?.name || "";
      const estado = e.status?.type?.state || "";
      out[e.id] = {
        enVivo: estado === "in",
        terminado: estado === "post" || /FINAL|FULL_TIME/.test(est),
        // En datos reales de ESPN, `detail` para un partido en curso ES el
        // minuto ("23'"). Verificado contra un partido en vivo el 11/9/2026.
        detalle: e.status?.type?.detail || e.status?.type?.shortDetail || "",
        local:     cs.find(x => x.homeAway === "home")?.team?.shortDisplayName
                || cs.find(x => x.homeAway === "home")?.team?.displayName || "",
        visitante: cs.find(x => x.homeAway === "away")?.team?.shortDisplayName
                || cs.find(x => x.homeAway === "away")?.team?.displayName || "",
        golesLocal:     cs.find(x => x.homeAway === "home")?.score ?? null,
        golesVisitante: cs.find(x => x.homeAway === "away")?.score ?? null,
      };
    }
    return out;
  } catch (e) {
    console.warn("   ! no se pudo consultar " + ruta + "/" + liga + ": " + e.message);
    return {};
  }
}

/* ---------- main ---------- */
const datos = JSON.parse(readFileSync(EVENTOS, "utf8"));
const ahora = Date.now();
const hoy = claveDia(ahora);

// Candidatos: los de hoy que ya arrancaron, dentro de la ventana y sin cerrar.
const candidatos = datos.eventos.filter(e => {
  if (!e.liga || !e.ruta || !e.idEspn) return false;
  if (claveDia(new Date(e.inicio).getTime()) !== hoy) return false;
  const t = new Date(e.inicio).getTime();
  return t <= ahora && ahora - t < VENTANA_MS;
});

if (!candidatos.length) {
  console.log("· Ningún partido en juego ahora.");
  process.exit(0);
}

async function leerEstado() {
  if (!CLAVE) return {};
  try {
    const r = await fetch(WORKER + "/vivos", {
      headers: { authorization: "Bearer " + CLAVE }, signal: AbortSignal.timeout(10000),
    });
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}
async function guardarEstado(e) {
  if (!CLAVE) { console.warn("   ! sin CLAVE_APP no se puede recordar el marcador: cada corrida avisaría de nuevo"); return; }
  try {
    await fetch(WORKER + "/vivos", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + CLAVE },
      body: JSON.stringify(e), signal: AbortSignal.timeout(10000),
    });
  } catch (err) { console.warn("   ! no se pudo guardar el marcador: " + err.message); }
}

let estado = await leerEstado();

const ligas = [...new Map(candidatos.map(e => [e.ruta + "|" + e.liga, e])).values()];
const lotes = await Promise.all(ligas.map(l => marcadores(l.ruta, l.liga)));
const vivos = Object.assign({}, ...lotes);

let mandados = 0;

for (const ev of candidatos) {
  const v = vivos[ev.idEspn];
  if (!v) continue;
  if (!v.enVivo && !v.terminado) continue;

  const marcador = (v.golesLocal != null && v.golesVisitante != null)
    ? `${v.golesLocal} - ${v.golesVisitante}` : "";
  if (!marcador) continue;

  const previo = estado[ev.id] || {};
  const huella = marcador + "|" + (v.terminado ? "fin" : v.detalle);

  // Nada cambió: ni gol, ni minuto, ni final. No se manda nada.
  if (previo.huella === huella) continue;

  // ¿Hubo gol? Se compara sólo el marcador, no el minuto.
  const huboGol = previo.marcador != null && previo.marcador !== marcador;
  const primera = previo.marcador == null;

  const equipos = `${v.local} ${marcador} ${v.visitante}`;
  const payload = {
    title: v.terminado
      ? `${ev.emoji} Terminó · ${equipos}`
      : `${ev.emoji} ${equipos}`,
    body: v.terminado
      ? (ev.competicion || ev.feedLabel || "")
      : `${v.detalle}${ev.competicion ? " · " + ev.competicion : ""}`,
    // El mismo tag durante todo el partido: cada aviso REEMPLAZA al anterior en
    // vez de sumar uno nuevo. Al final del partido queda una sola notificación.
    tag: "vivo-" + ev.id,
    // Suena sólo cuando pasó algo: gol, arranque o final. Los cambios de minuto
    // entran en silencio, actualizando el texto de la que ya está.
    silencioso: !(huboGol || v.terminado || primera),
    url: "./deportes/#/e/" + ev.id,
  };

  console.log((huboGol ? "⚽ GOL " : v.terminado ? "🏁 FIN " : "· ") + payload.title);
  if (await enviar(payload)) {
    mandados++;
    estado[ev.id] = { marcador, huella, al: new Date().toISOString(), terminado: !!v.terminado };
  }
}

/* ---------- guardar estado, limpiando lo viejo ---------- */
if (!DRY) {
  const vigentes = new Set(candidatos.map(e => e.id));
  const limpio = {};
  for (const k of Object.keys(estado)) if (vigentes.has(k)) limpio[k] = estado[k];
  await guardarEstado(limpio);
}

console.log(mandados ? `\n✓ ${mandados} aviso(s) de marcador` : "\n· Sin cambios en el marcador");
