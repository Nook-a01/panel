// Revisa el calendario y manda las notificaciones que corresponden AHORA.
// Pensado para correr cada 15 minutos (GitHub Actions o el Programador de Windows).
//
//   node scripts/send-push.mjs            → manda de verdad
//   node scripts/send-push.mjs --dry-run  → sólo muestra qué mandaría
//   node scripts/send-push.mjs --test     → manda una notificación de prueba
//   node scripts/send-push.mjs --semanal  → manda el resumen de la semana
//   node scripts/send-push.mjs --diario   → manda los partidos de hoy

import webpush from "web-push";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { CONFIG } from "../config.mjs";

const DRY  = process.argv.includes("--dry-run");
const TEST = process.argv.includes("--test");

const EVENTOS = new URL("../docs/deportes/data/events.json", import.meta.url);
const ESTADO  = new URL("../estado/enviados.json", import.meta.url);

/* ---------- credenciales ---------- */
function credenciales() {
  // En GitHub Actions vienen por variables de entorno; en la PC, del archivo local.
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE)
    return { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  const f = new URL("../.vapid.json", import.meta.url);
  if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  return null;
}

function suscripciones() {
  const crudo = process.env.PUSH_SUBSCRIPTION;
  if (crudo) {
    const v = JSON.parse(crudo);
    return Array.isArray(v) ? v : [v];
  }
  const f = new URL("../.subscriptions.json", import.meta.url);
  if (existsSync(f)) {
    const v = JSON.parse(readFileSync(f, "utf8"));
    return Array.isArray(v) ? v : [v];
  }
  return [];
}

const vapid = credenciales();
const subs  = suscripciones();

if (!vapid) { console.error("✗ Faltan las claves VAPID. Ejecutá: npm run keys"); process.exit(1); }
if (!subs.length && !DRY) {
  // Salimos con éxito, no con error: "todavía nadie se suscribió" es un
  // estado normal. Si saliéramos con error, GitHub mandaría un mail de
  // workflow fallido cada 15 minutos hasta que se configure.
  console.log("· Todavía no hay ninguna suscripción, así que no hay a quién avisar.");
  console.log("  Abrí la app en el celular, tocá 🔔 y pegá lo que copia en el");
  console.log("  secreto PUSH_SUBSCRIPTION (o en .subscriptions.json para probar local).");
  process.exit(0);
}

webpush.setVapidDetails(CONFIG.contacto, vapid.publicKey, vapid.privateKey);

/* ---------- formato de fecha en tu zona ---------- */
const soloHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: CONFIG.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
});

/* ---------- envío ---------- */
async function enviar(payload) {
  if (DRY) { console.log("   [dry-run] " + payload.title + " — " + payload.body); return true; }
  let alguno = false;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      alguno = true;
    } catch (e) {
      // 404/410 = la suscripción ya no existe (borraste la app o revocaste permisos)
      if (e.statusCode === 404 || e.statusCode === 410)
        console.warn("   ! suscripción vencida, hay que volver a activar los avisos en el celular");
      else
        console.warn("   ! error al enviar (" + e.statusCode + "): " + e.message);
    }
  }
  return alguno;
}

/* ---------- resumen del día ----------
   Es el aviso más confiable de los tres: no depende de que GitHub corra
   la tarea a una hora exacta. Si sale a las 8 o a las 10, sirve igual. */
if (process.argv.includes("--diario")) {
  const datos = JSON.parse(readFileSync(EVENTOS, "utf8"));
  const ahora = Date.now();

  // "Hoy" en tu zona horaria, no en la del servidor de GitHub.
  const diaDe = ms => new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
  const hoy = diaDe(ahora);

  const delDia = datos.eventos
    .filter(e => diaDe(new Date(e.inicio)) === hoy)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  if (!delDia.length) {
    console.log("· Hoy no hay nada: no mando el resumen diario.");
    process.exit(0);
  }

  // Se programa dos veces al día por si GitHub saltea la primera. Para
  // que no lleguen dos avisos iguales, queda registro del día enviado.
  const clave = "diario#" + hoy;
  let yaEnviados = {};
  if (existsSync(ESTADO)) {
    try { yaEnviados = JSON.parse(readFileSync(ESTADO, "utf8")); } catch {}
  }
  if (yaEnviados[clave] && !DRY) {
    console.log("· El resumen de hoy ya se mandó (" + yaEnviados[clave] + ").");
    process.exit(0);
  }

  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone: CONFIG.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const lineas = delDia.slice(0, 8).map(e => {
    const nombre = e.titulo.length > 36 ? e.titulo.slice(0, 35) + "…" : e.titulo;
    const yaPaso = new Date(e.inicio).getTime() < ahora;
    return `${hora.format(new Date(e.inicio))}  ${e.emoji} ${nombre}${yaPaso ? " ✓" : ""}`;
  });
  if (delDia.length > 8) lineas.push(`…y ${delDia.length - 8} más`);

  const porJugarse = delDia.filter(e => new Date(e.inicio).getTime() > ahora).length;
  const titulo = porJugarse
    ? `☀️ Hoy: ${porJugarse} evento${porJugarse === 1 ? "" : "s"}`
    : `☀️ Hoy ya se jugó todo`;

  const ok = await enviar({ title: titulo, body: lineas.join(String.fromCharCode(10)), tag: "diario", url: "./deportes/" });
  console.log(lineas.join(String.fromCharCode(10)));
  if (ok && !DRY) {
    yaEnviados[clave] = new Date().toISOString();
    mkdirSync(new URL("../estado/", import.meta.url), { recursive: true });
    writeFileSync(ESTADO, JSON.stringify(yaEnviados, null, 1));
  }
  console.log(ok ? String.fromCharCode(10) + "✓ Resumen del día enviado"
                 : String.fromCharCode(10) + "✗ No se pudo enviar");
  process.exit(ok ? 0 : 1);
}

/* ---------- resumen semanal (domingos) ---------- */
if (process.argv.includes("--semanal")) {
  const datos = JSON.parse(readFileSync(EVENTOS, "utf8"));
  const ahora = Date.now();
  const finSemana = ahora + 7 * 86400e3;

  const semana = datos.eventos
    .filter(e => {
      const t = new Date(e.inicio).getTime();
      return t > ahora && t <= finSemana;
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  if (!semana.length) {
    console.log("· Semana sin eventos: no mando resumen.");
    process.exit(0);
  }

  const diaHora = new Intl.DateTimeFormat("es-AR", {
    timeZone: CONFIG.timezone, weekday: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  // El cuerpo de una notificación se corta: mostramos hasta 7 y avisamos del resto.
  const MAX = 7;
  const lineas = semana.slice(0, MAX).map(e => {
    const p = {}; for (const x of diaHora.formatToParts(new Date(e.inicio))) p[x.type] = x.value;
    const nombre = e.titulo.length > 34 ? e.titulo.slice(0, 33) + "…" : e.titulo;
    return `${p.weekday} ${p.day} ${p.hour}:${p.minute}  ${e.emoji} ${nombre}`;
  });
  if (semana.length > MAX) lineas.push(`…y ${semana.length - MAX} más`);

  const ok = await enviar({
    title: `📅 Tu semana: ${semana.length} evento${semana.length === 1 ? "" : "s"}`,
    body: lineas.join("\n"),
    tag: "semanal",
    url: "./deportes/",
  });

  console.log(lineas.join("\n"));
  console.log(ok ? "\n✓ Resumen semanal enviado" : "\n✗ No se pudo enviar");
  process.exit(ok ? 0 : 1);
}

/* ---------- modo prueba ---------- */
if (TEST) {
  const ok = await enviar({
    title: "🔔 Prueba — Panel",
    body: "Si ves esto, las notificaciones funcionan.",
    tag: "prueba",
  });
  console.log(ok ? "✓ Notificación de prueba enviada" : "✗ No se pudo enviar");
  process.exit(ok ? 0 : 1);
}

/* ---------- lógica principal ---------- */
const datos = JSON.parse(readFileSync(EVENTOS, "utf8"));
const ahora = Date.now();

let enviados = {};
if (existsSync(ESTADO)) {
  try { enviados = JSON.parse(readFileSync(ESTADO, "utf8")); } catch {}
}

// Si el momento del aviso ya pasó hace mucho (por ejemplo recién configurás la app),
// lo damos por hecho en vez de disparar una avalancha de avisos viejos.
const GRACIA_MS = 6 * 3600e3;

let mandados = 0, marcados = 0;

for (const ev of datos.eventos) {
  const inicio = new Date(ev.inicio).getTime();
  if (inicio <= ahora) continue;              // ya empezó o terminó

  for (const aviso of CONFIG.avisos) {
    const clave = ev.id + "#" + aviso.hours;
    if (enviados[clave]) continue;

    const momento = inicio - aviso.hours * 3600e3;
    if (ahora < momento) continue;            // todavía no toca

    if (ahora - momento > GRACIA_MS) {        // se pasó demasiado: no molestar
      enviados[clave] = "omitido";
      marcados++;
      continue;
    }

    // Cuánto falta de verdad (no la etiqueta teórica)
    const faltanMin = Math.round((inicio - ahora) / 60000);
    const cuando = faltanMin >= 1380 ? "Mañana"
                 : faltanMin >= 120  ? "En " + Math.round(faltanMin / 60) + " horas"
                 : faltanMin >= 60   ? "En 1 hora"
                 : "En " + faltanMin + " min";

    const detalle = [ev.competicion, ev.sede].filter(Boolean).join(" · ");
    const payload = {
      title: ev.emoji + " " + ev.titulo,
      body: cuando + " · " + soloHora.format(inicio) + (detalle ? "\n" + detalle : ""),
      tag: clave,
      url: "./deportes/",
    };

    console.log("→ " + payload.title);
    console.log("   " + payload.body.replace(/\n/g, " | "));
    if (await enviar(payload)) { enviados[clave] = new Date().toISOString(); mandados++; }
  }
}

/* ---------- guardar estado (limpiando lo viejo) ---------- */
if (!DRY) {
  const vigentes = new Set(
    datos.eventos.filter(e => new Date(e.inicio).getTime() > ahora - 7 * 86400e3)
                 .flatMap(e => CONFIG.avisos.map(a => e.id + "#" + a.hours))
  );
  const limpio = {};
  for (const k of Object.keys(enviados)) if (vigentes.has(k)) limpio[k] = enviados[k];

  mkdirSync(new URL("../estado/", import.meta.url), { recursive: true });
  writeFileSync(ESTADO, JSON.stringify(limpio, null, 1));
}

console.log(
  mandados ? "\n✓ " + mandados + " notificación(es) enviada(s)"
           : "\n· Nada que avisar en este momento" +
             (marcados ? " (" + marcados + " aviso[s] vencido[s] omitido[s])" : "")
);
