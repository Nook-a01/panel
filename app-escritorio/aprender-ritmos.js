// Aprender ritmos de la librería de samples.
//
// QUÉ HACE
// Recorre la librería buscando dos cosas hechas por productores de verdad:
//   1. Loops de batería separados por instrumento ("... 140 BPM Kick.wav",
//      "... Snare.wav", "... Hihats.wav"). Sobre un sonido aislado es fácil y
//      confiable detectar dónde cae cada golpe y con qué fuerza.
//   2. MIDI de batería ("..._105_KICKMIDI.mid", "... Hihat Loop - 140 BPM.mid").
// De cada loop saca un "groove": en qué fracción de tiempo cae cada golpe del
// bombo, la caja, el hat y la percusión, con su fuerza y su corrimiento real.
// El compositor usa esos grooves en vez de los dibujos escritos a mano, que
// era lo que hacía sonar todo "cuadrado".
//
// QUÉ NO HACE
// No copia audio ni notas de melodía: sólo tiempos y fuerzas de la batería.
// No escribe en la librería; sólo la lee.
//
// Se usa desde estudio-motor.js, o a mano:
//   node aprender-ritmos.js "D:\Nook\Fl Studio\Librerias" salida.json

const fs = require("node:fs");
const path = require("node:path");

// Cuadrícula de 48 por negra: entran semicorcheas (12), fusas (6) y
// tresillos de corchea (16) y de semicorchea (8), que es lo que usa el trap.
const GRILLA = 48;

/* ---------------- a qué género pertenece, por la carpeta ---------------- */
function generoDe(ruta) {
  const r = ruta.toLowerCase();
  if (/drill|trap/.test(r)) return "trap";
  if (/afro|yoruba/.test(r)) return "afrobeats";
  if (/latin|dancehall|reggaet|dembow/.test(r)) return "reggaeton";
  if (/house/.test(r)) return "house";
  return null;
}

function rolDe(nombre) {
  const n = nombre.toLowerCase();
  if (/kick/.test(n)) return "kick";
  if (/snare|clap|rim/.test(n)) return "caja";
  if (/hi ?hats?|hihat|\bhh\b|hat/.test(n)) return "hat";
  if (/perc|shaker|tamb|agogo|bongo|conga/.test(n)) return "perc";
  return null;
}

function bpmDe(nombre) {
  const m = nombre.match(/(\d{2,3})\s*bpm/i) || nombre.match(/_(\d{2,3})_/);
  const v = m ? Number(m[1]) : null;
  return v && v >= 60 && v <= 200 ? v : null;
}

/* ---------------- WAV ---------------- */
// PCM de 16, 24 o 32 bits y float de 32. Devuelve la señal en mono.
function leerWav(f) {
  const b = fs.readFileSync(f);
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WAVE") return null;
  let p = 12, fmt = null, datos = null;
  while (p + 8 <= b.length) {
    const id = b.toString("latin1", p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === "fmt ") {
      // En el formato "extensible" (0xFFFE) el tipo real va en el subformato.
      const tipo = b.readUInt16LE(p + 8);
      fmt = { tipo: tipo === 0xfffe && len >= 26 ? b.readUInt16LE(p + 32) : tipo, canales: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    }
    if (id === "data") { datos = b.subarray(p + 8, Math.min(b.length, p + 8 + len)); break; }
    p += 8 + len + (len % 2);
  }
  if (!fmt || !datos) return null;
  const bytes = fmt.bits / 8, paso = bytes * fmt.canales, n = Math.floor(datos.length / paso);
  const mono = new Float32Array(n);
  const flotante = fmt.tipo === 3;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.canales; c++) {
      const o = i * paso + c * bytes;
      let v;
      if (flotante && fmt.bits === 32) v = datos.readFloatLE(o);
      else if (fmt.bits === 16) v = datos.readInt16LE(o) / 32768;
      else if (fmt.bits === 24) v = datos.readIntLE(o, 3) / 8388608;
      else if (fmt.bits === 32) v = datos.readInt32LE(o) / 2147483648;
      else return null;
      s += v;
    }
    mono[i] = s / fmt.canales;
  }
  return { sr: fmt.sr, mono };
}

// Golpes de un sonido aislado: donde la energía sube de golpe, medida en
// decibeles. En decibeles, un hat suave que llega mientras todavía suena el
// anterior también se ve como subida; en amplitud lineal quedaba tapado.
// Separación mínima entre golpes según el instrumento: un bombo con 808 sigue
// "subiendo" mientras suena (muchos samples de bombo traen un segundo ataque a ~120 ms) y no
// puede contarse dos veces; un hat en redoble sí
// puede venir a 25 ms del anterior.
const SEPARACION = { kick: 0.18, caja: 0.07, hat: 0.02, perc: 0.04 };
// Cuántos dB tiene que subir la energía para contar un golpe. En los hats es
// menos: dentro de un redoble el golpe nuevo llega con el anterior sonando.
// Comprobado contra los 15 hat loops del Drill Kit que traen su MIDI: se
// detectan las notas audibles con 1,7 ms de error medio; las que se pierden
// son notas fantasma de velocidad ~8/127, que casi no suenan.
const SUBIDA = { kick: 6, caja: 6, hat: 5, perc: 5 };

function golpes(wav, rol) {
  const { sr, mono } = wav, hop = Math.max(1, Math.round(sr * 0.003)), seg = hop / sr;
  // Cuatro cuadros de silencio adelante: el golpe que arranca en la muestra 0 también cuenta.
  const db = [-120, -120, -120, -120];
  for (let i = 0; i < mono.length; i += hop) {
    let e = 0;
    for (let j = i; j < Math.min(mono.length, i + hop); j++) e += mono[j] * mono[j];
    db.push(10 * Math.log10(e / hop + 1e-12));
  }
  const max = Math.max(...db), piso = max - 30;             // lo que está 30 dB abajo del pico no cuenta
  const separacion = Math.round((SEPARACION[rol] || 0.03) / seg);
  const sal = []; let ultimo = -1e9;
  for (let i = 4; i < db.length - 1; i++) {
    const antes = Math.min(db[i - 1], db[i - 2], db[i - 3]);
    if (db[i] > piso && db[i] - antes >= (SUBIDA[rol] || 6) && db[i] >= db[i - 1] && i - ultimo >= separacion) {
      // el golpe empieza donde arranca la subida, no en el pico
      let ini = i;
      while (ini > 1 && db[ini - 1] - antes > 2 && i - ini < 4) ini--;
      let pico = db[i];
      for (let k = i; k < Math.min(db.length, i + 6); k++) pico = Math.max(pico, db[k]);
      sal.push({ seg: Math.max(0, ini - 4) * seg, fuerza: Math.max(0.05, Math.min(1, Math.pow(10, (pico - max) / 20))) });
      ultimo = i;
    }
  }
  return { golpes: sal, seg: mono.length / sr };
}

/* ---------------- MIDI ---------------- */
function leerMidi(f) {
  const b = fs.readFileSync(f);
  let p = 0;
  const u32 = () => (b[p++] << 24 | b[p++] << 16 | b[p++] << 8 | b[p++]) >>> 0, u16 = () => b[p++] << 8 | b[p++];
  const vl = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80 && p < b.length); return v; };
  if (b.toString("latin1", 0, 4) !== "MThd") return null;
  p = 4; const hl = u32(); u16(); const ntr = u16(), ppq = u16(); p = 8 + hl;
  const notas = [];
  for (let t = 0; t < ntr && p < b.length; t++) {
    if (b.toString("latin1", p, p + 4) !== "MTrk") break;
    p += 4; const len = u32(), fin = p + len; let tick = 0, run = 0;
    while (p < fin) {
      tick += vl(); let s = b[p];
      if (s & 0x80) p++; else s = run;
      if (s === 0xff) { p++; p += vl(); continue; }
      if (s === 0xf0 || s === 0xf7) { p += vl(); continue; }
      run = s; const tipo = s & 0xf0, d1 = b[p++]; const d2 = (tipo === 0xc0 || tipo === 0xd0) ? 0 : b[p++];
      if (tipo === 0x90 && d2 > 0) notas.push({ beat: tick / ppq, fuerza: d2 / 127, n: d1 });
    }
    p = fin;
  }
  return notas;
}

/* ---------------- de golpes a groove ---------------- */
// Cada golpe queda como [tiempo en negras, fuerza 0-1]. El tiempo se guarda
// real (con su corrimiento), redondeado a milésimas de negra.
function aBeats(lista, bpm) {
  return lista.map(g => [Math.round(g.seg * bpm / 60 * 1000) / 1000, Math.round(g.fuerza * 100) / 100]);
}

function compasesDe(golpesBeats, largoBeats) {
  const ultimo = golpesBeats.length ? golpesBeats[golpesBeats.length - 1][0] : 0;
  const c = Math.max(1, Math.round(Math.max(largoBeats || 0, ultimo + 0.5) / 4));
  return [1, 2, 4, 8, 16].reduce((a, x) => Math.abs(x - c) < Math.abs(a - c) ? x : a, 1);
}

function aprender(raiz, op) {
  op = op || {};
  const avisar = op.progreso || (() => {});
  const wavs = [], mids = [];
  (function mirar(d, hondo) {
    if (hondo > 8) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) mirar(f, hondo + 1);
      else if (/\.wav$/i.test(e.name) && /bpm/i.test(e.name) && rolDe(e.name) && generoDe(f)) wavs.push(f);
      else if (/\.midi?$/i.test(e.name) && rolDe(e.name) && generoDe(f)) mids.push(f);
    }
  })(raiz, 0);

  // Los stems de un mismo loop se juntan: misma carpeta y mismo nombre sin el instrumento.
  const loops = new Map();
  const clave = (f) => path.dirname(f) + "|" + path.basename(f).replace(/\.(wav|midi?)$/i, "")
    .replace(/(kick|snare|clap|rimshot|rim|hi ?hats?|hihat\s*\d*|hh|hat|percussion\s*\d*|percs?\s*\d*|shaker|tamb\s*\d*|agogo\s*\d*|bongo\s*\d*|conga\s*\d*|midi|drum|loop)/gi, "")
    .replace(/[\s_\-]+/g, " ").trim().toLowerCase();
  const agregar = (f, rol, golpesBeats, bpm, largoBeats, fuente) => {
    const k = clave(f);
    if (!loops.has(k)) loops.set(k, { nombre: path.basename(f).replace(/\.(wav|midi?)$/i, ""), genero: generoDe(f), bpm, largo: 0, kick: [], caja: [], hat: [], perc: [], fuente });
    const L = loops.get(k);
    if (fuente === "midi") L.fuente = "midi";
    L[rol] = L[rol].concat(golpesBeats).sort((a, b) => a[0] - b[0]);
    L.largo = Math.max(L.largo, largoBeats || 0);
  };

  let hechos = 0, fallidos = 0;
  for (const f of wavs) {
    const bpm = bpmDe(path.basename(f));
    try {
      const w = leerWav(f);
      if (!w || !bpm) { fallidos++; continue; }
      const rol = rolDe(path.basename(f)), g = golpes(w, rol);
      agregar(f, rol, aBeats(g.golpes, bpm), bpm, g.seg * bpm / 60, "audio");
      hechos++;
    } catch { fallidos++; }
    if (hechos % 20 === 0) avisar("Leí " + hechos + " de " + wavs.length + " loops de audio…");
  }
  for (const f of mids) {
    try {
      const notas = leerMidi(f);
      if (!notas || !notas.length) { fallidos++; continue; }
      agregar(f, rolDe(path.basename(f)), notas.map(x => [Math.round(x.beat * 1000) / 1000, Math.round(x.fuerza * 100) / 100]), bpmDe(path.basename(f)), 0, "midi");
      hechos++;
    } catch { fallidos++; }
  }

  // El mismo loop puede venir en audio y en MIDI, en carpetas hermanas
  // ("Hihat Loops" y "Hihat MIDI"). Se queda uno solo, y si hay MIDI, el MIDI.
  const unicos = new Map();
  for (const L of loops.values()) {
    const k = L.genero + "|" + L.nombre.toLowerCase();
    const otro = unicos.get(k);
    if (!otro || (otro.fuente !== "midi" && L.fuente === "midi")) unicos.set(k, L);
  }

  const generos = {};
  for (const L of unicos.values()) {
    const todos = [].concat(L.kick, L.caja, L.hat, L.perc).sort((a, b) => a[0] - b[0]);
    if (!todos.length) continue;
    L.compases = compasesDe(todos, L.largo);
    const tope = L.compases * 4;
    ["kick", "caja", "hat", "perc"].forEach(r => { L[r] = L[r].filter(x => x[0] < tope - 1e-3); });
    delete L.largo;
    (generos[L.genero] = generos[L.genero] || []).push(L);
  }
  Object.values(generos).forEach(lista => lista.sort((a, b) => a.nombre.localeCompare(b.nombre)));
  return {
    version: 1,
    creado: new Date().toISOString(),
    raiz,
    archivos: { audio: wavs.length, midi: mids.length, leidos: hechos, fallidos },
    generos,
  };
}

module.exports = { aprender, leerWav, golpes, GRILLA };

if (require.main === module) {
  const raiz = process.argv[2] || "D:\\Nook\\Fl Studio\\Librerias";
  const salida = process.argv[3] || "banco-ritmos.json";
  const banco = aprender(raiz, { progreso: (t) => process.stderr.write(t + "\r") });
  fs.writeFileSync(salida, JSON.stringify(banco));
  const resumen = Object.fromEntries(Object.entries(banco.generos).map(([g, l]) => [g, {
    grooves: l.length,
    conBombo: l.filter(x => x.kick.length).length,
    conCaja: l.filter(x => x.caja.length).length,
    conHat: l.filter(x => x.hat.length).length,
  }]));
  console.log("\narchivos:", JSON.stringify(banco.archivos));
  console.log("por género:", JSON.stringify(resumen, null, 1));
}
