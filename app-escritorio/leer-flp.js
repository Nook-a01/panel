// Leer un proyecto de FL Studio (.flp) en sólo lectura, para aprender de él:
// tempo, canales y sus plugins, mixer con la cadena de efectos de cada insert,
// patrones con sus notas y el arreglo del playlist. El formato no es público:
// los eventos siguen la documentación de la comunidad (p. ej. PyFLP). En FL 21
// cada item del playlist ocupa 60 bytes; en FL 2025, 80.
// Uso: node leer-flp.js archivo.flp salida.json [60|80]
const fs = require("fs");
const [, , f, salida, tamArg] = process.argv;
const b = fs.readFileSync(f);
const ppq = b.readUInt16LE(12);
let p = 8 + b.readUInt32LE(4) + 8; const ev = [];
while (p < b.length) {
  const id = b[p++]; let len = 0, val;
  if (id < 64) { val = b[p]; len = 1; } else if (id < 128) { val = b.readUInt16LE(p); len = 2; } else if (id < 192) { val = b.readUInt32LE(p); len = 4; }
  else { let sh = 0, c; do { c = b[p++]; len |= (c & 0x7f) << sh; sh += 7; } while (c & 0x80); val = b.subarray(p, p + len); }
  ev.push([id, val]); p += len;
}
const txt = v => v.toString("utf16le").replace(/\0+$/, "");
const R = { archivo: f, ppq, tempo: null, version: null, canales: [], inserts: [], patrones: {}, playlist: [] };
let canal = null, patron = null, enMixer = false, insert = null, nombrePend = null;
for (const [id, v] of ev) {
  if (id === 199) R.version = v.toString("latin1").replace(/\0+$/, "");
  if (id === 156) R.tempo = v / 1000;
  if (!enMixer) {
    if (id === 64) { canal = { i: v, nombre: null, plugin: null, sample: null }; R.canales.push(canal); continue; }
    if (canal && id === 201) canal.plugin = txt(v) || canal.plugin;
    if (canal && id === 203) canal.nombre = txt(v);
    if (canal && id === 192 && !canal.nombre) canal.nombre = txt(v);
    if (canal && id === 196) canal.sample = txt(v);
    if (id === 65) { patron = R.patrones[v] = R.patrones[v] || { nombre: null, notas: [] }; }
    if (id === 193 && patron) patron.nombre = txt(v);
    if (id === 224 && patron) for (let o = 0; o + 24 <= v.length; o += 24) patron.notas.push({
      t: v.readUInt32LE(o) / ppq, canal: v.readUInt16LE(o + 6), largo: v.readUInt32LE(o + 8) / ppq, tecla: v.readUInt16LE(o + 12), vel: v[o + 21],
    });
    if (id === 233) {
      const tam = Number(tamArg || 60);
      for (let o = 0; o + tam <= v.length; o += tam) {
        const base = v.readUInt16LE(o + 4), idx = v.readUInt16LE(o + 6);
        R.playlist.push({ t: v.readUInt32LE(o) / ppq, patron: idx >= base ? idx - base : null, canal: idx < base ? idx : null, largo: v.readUInt32LE(o + 8) / ppq, pista: 500 - v.readUInt16LE(o + 12) });
      }
    }
    if (id === 236) enMixer = true;
  }
  if (enMixer) {
    if (id === 204) { nombrePend = txt(v); continue; }
    if (id === 236) { insert = { n: R.inserts.length, nombre: nombrePend || (R.inserts.length ? null : "Master"), efectos: [] }; R.inserts.push(insert); nombrePend = null; continue; }
    if (id === 201 && insert && txt(v)) insert.efectos.push(txt(v));
  }
}
fs.writeFileSync(salida, JSON.stringify(R));

/* ---------------- informe ---------------- */
const nom = i => { const c = R.canales.find(x => x.i === i); return c ? (c.nombre || c.plugin || "canal " + i) : "canal " + i; };
console.log("Versión FL:", R.version, "| tempo", R.tempo, "| PPQ", ppq);
const gens = {}; R.canales.forEach(c => { const k = c.sample ? "Sampler/audio" : (c.plugin || "(sin plugin: audio/automatización)"); gens[k] = (gens[k] || 0) + 1; });
console.log("\nCANALES:", R.canales.length, "| por tipo:", JSON.stringify(gens));
const conNotas = new Set(); Object.values(R.patrones).forEach(pt => pt.notas.forEach(n => conNotas.add(n.canal)));
console.log("Canales que tocan notas en patrones:");
[...conNotas].sort((a, b) => a - b).forEach(i => { const c = R.canales.find(x => x.i === i) || {}; console.log("  " + String(i).padStart(3), (c.nombre || "").padEnd(32), (c.plugin || "").padEnd(20), (c.sample || "").split(/[\\/]/).pop()); });
console.log("\nMIXER:", R.inserts.length, "inserts con nombre o efectos:");
const usoFx = {};
R.inserts.forEach(ins => { ins.efectos.forEach(e => usoFx[e] = (usoFx[e] || 0) + 1); if (ins.nombre || ins.efectos.length) console.log("  " + String(ins.n).padStart(3), (ins.nombre || "").padEnd(26), ins.efectos.join(" → ")); });
console.log("\nEfectos más usados:", Object.entries(usoFx).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " x" + v).join(", "));
console.log("\nPATRONES:");
Object.entries(R.patrones).forEach(([k, pt]) => {
  if (!pt.notas.length) return;
  const porC = {}; pt.notas.forEach(n => (porC[nom(n.canal)] = porC[nom(n.canal)] || []).push(n));
  const largo = Math.max(...pt.notas.map(n => n.t + n.largo));
  console.log("  P" + k, JSON.stringify(pt.nombre), "| " + Math.ceil(largo / 4) + " compases |", Object.entries(porC).map(([c, v]) => c + " " + v.length + "n vel " + Math.min(...v.map(x => x.vel)) + "-" + Math.max(...v.map(x => x.vel))).join("; "));
});
const fin = Math.max(...R.playlist.filter(x => x.t < 1e5).map(x => x.t + x.largo));
console.log("\nARREGLO: largo", Math.ceil(fin / 4), "compases,", R.playlist.length, "clips,", new Set(R.playlist.map(x => x.pista)).size, "pistas del playlist");
