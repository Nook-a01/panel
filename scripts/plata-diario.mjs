// Aviso diario de plata.
//
//   node scripts/plata-diario.mjs            → manda de verdad
//   node scripts/plata-diario.mjs --dry-run  → muestra qué mandaría, sin mandar
//
// QUÉ MANDA
// Un solo aviso por día, y solo si hay algo que decir. La regla es dura a
// propósito: si no pasa nada, no suena. Un aviso que llega todos los días
// diciendo "todo bien" se vuelve ruido y se deja de leer, y el día que sí
// importa tampoco se lee.
//
// DE DÓNDE SALEN LOS NÚMEROS
// Del mismo estado que ves en la app, guardado en el Worker (GET /app). No se
// recalcula nada distinto acá: si el aviso dijera otro número que la pantalla,
// uno de los dos estaría mintiendo.

import webpush from "web-push";
import { readFileSync, existsSync } from "node:fs";
import { CONFIG } from "../config.mjs";

const DRY = process.argv.includes("--dry-run");
const WORKER = "https://plata.hamcqc.workers.dev";

/* ---------- credenciales ---------- */
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

/* ---------- fechas en tu zona, no en la del servidor de GitHub ---------- */
const diaDe = (ms) => new Intl.DateTimeFormat("en-CA", {
  timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(ms));

const plata = (n) => "$" + Math.round(Math.abs(n)).toLocaleString("es-AR");

/* ---------- el mismo cálculo que la app ---------- */
function calcular(S, hoy) {
  const hoyYM = hoy.slice(0, 7);
  const corte = (S.cfg && S.cfg.fechaCorte) || "0000-01-01";
  const esTarjeta = (m) => m.medio === "credito";
  const confirmado = (m) => m.estado !== "pend";

  let saldo = Number(S.cfg?.saldoInicial) || 0;
  for (const m of S.movs || []) {
    if (!confirmado(m) || m.fecha <= corte || m.fecha > hoy || esTarjeta(m)) continue;
    saldo += (m.tipo === "ingreso" ? 1 : -1) * (Number(m.monto) || 0);
  }

  let comprometido = 0, porCobrar = 0, vencido = 0;
  const vencenHoy = [];
  for (const m of S.movs || []) {
    if ((m.fecha || "").slice(0, 7) !== hoyYM || confirmado(m)) continue;
    const v = Number(m.monto) || 0;
    if (m.tipo === "gasto") {
      if (esTarjeta(m)) continue;
      comprometido += v;
      if (m.fecha < hoy) vencido += v;
      if (m.fecha === hoy) vencenHoy.push({ desc: m.desc || "", monto: v });
    } else porCobrar += v;
  }

  const reserva = Number(S.cfg?.reserva) || 0;
  const libre = saldo - comprometido - reserva;

  // ritmo de gasto variable del mes
  const dia = Number(hoy.slice(8, 10));
  const variables = (S.movs || []).filter(m =>
    (m.fecha || "").slice(0, 7) === hoyYM && m.tipo === "gasto" && confirmado(m) &&
    !esTarjeta(m) && m.srcTipo !== "fijo" && m.srcTipo !== "cuota" && m.fecha <= hoy);
  const ritmo = variables.reduce((a, m) => a + (Number(m.monto) || 0), 0) / Math.max(1, dia);

  return { saldo, comprometido, porCobrar, vencido, libre, ritmo, vencenHoy, dia };
}

/* ---------- qué merece interrumpirte ---------- */
//
// Cada regla devuelve un aviso o nada. Si ninguna dispara, no se manda nada.
// El orden importa: manda el primero, no los cinco.
function motivo(c) {
  if (c.saldo < 0)
    return { t: "Estás en rojo",
             b: "Tu saldo es " + plata(c.saldo) + " negativo. Lo primero es cubrir eso." };

  if (c.vencenHoy.length) {
    const total = c.vencenHoy.reduce((a, x) => a + x.monto, 0);
    const cuales = c.vencenHoy.slice(0, 3).map(x => x.desc).filter(Boolean).join(", ");
    return { t: "Hoy vence " + plata(total),
             b: (cuales ? cuales + ". " : "") +
                (c.saldo >= total ? "Te alcanza el saldo." : "Te faltan " + plata(total - c.saldo) + ".") };
  }

  if (c.vencido > 0)
    return { t: plata(c.vencido) + " ya vencido",
             b: "Sigue sin pagarse y arrastra la cuenta de todo el mes. Tocá para revisarlo." };

  if (c.libre < 0)
    return { t: "Te estás pasando por " + plata(c.libre),
             b: "Tenés " + plata(c.saldo) + " y " + plata(c.comprometido) + " por pagar este mes." };

  // Sin nada vencido ni en rojo: solo avisar si el ritmo se va a comer lo que queda.
  const diasQueDura = c.ritmo > 0 ? c.libre / c.ritmo : Infinity;
  if (diasQueDura < 7)
    return { t: "Te queda para " + Math.max(0, Math.floor(diasQueDura)) + " días",
             b: "Al ritmo de " + plata(c.ritmo) + " por día, los " + plata(c.libre) +
                " que te quedan no llegan a fin de mes." };

  return null;   // todo en orden: hoy no se avisa nada
}

/* ---------- main ---------- */
async function principal(){
const vapid = credenciales();
if (!vapid) { console.error("✗ Faltan las claves VAPID."); return 1; }

const clave = process.env.CLAVE_APP;
if (!clave) {
  console.log("· Falta el secreto CLAVE_APP, así que no puedo leer tus datos. No se manda nada.");
  return 0;
}

let S;
try {
  const r = await fetch(WORKER + "/app", { headers: { authorization: "Bearer " + clave } });
  if (r.status === 404) { console.log("· Todavía no hay datos guardados. Nada que avisar."); return 0; }
  if (!r.ok) throw new Error("HTTP " + r.status);
  S = await r.json();
} catch (e) {
  console.error("✗ No se pudo leer el panel: " + e.message);
  return 1;
}

const hoy = diaDe(Date.now());
const c = calcular(S, hoy);
const av = motivo(c);

if (!av) {
  console.log("· Hoy no hay nada que avise. Saldo " + plata(c.saldo) + ", libre " + plata(c.libre) + ".");
  console.log("  (Es a propósito: un aviso diario de 'todo bien' se deja de leer.)");
  return 0;
}

const payload = {
  title: "💰 " + av.t,
  body: av.b,
  tag: "plata-diario",          // el celular reemplaza el anterior en vez de apilar
  url: "https://nook-a01.github.io/panel/plata/",
};

if (DRY) { console.log("[dry-run] " + payload.title + " — " + payload.body); return 0; }

const subs = suscripciones();
if (!subs.length) { console.log("· Nadie suscrito todavía; no hay a quién avisar."); return 0; }

webpush.setVapidDetails(CONFIG.contacto, vapid.publicKey, vapid.privateKey);

let alguno = false;
for (const sub of subs) {
  try { await webpush.sendNotification(sub, JSON.stringify(payload)); alguno = true; }
  catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410)
      console.warn("   ! suscripción vencida; hay que reactivar los avisos en el celular");
    else console.warn("   ! error al enviar (" + e.statusCode + "): " + e.message);
  }
}
console.log(alguno ? "✓ " + payload.title : "· No se pudo entregar a nadie");
return 0;
}

process.exitCode = await principal();
