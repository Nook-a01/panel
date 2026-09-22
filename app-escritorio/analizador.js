// Analizador — mide una canción de referencia y devuelve su "ficha".
//
// QUÉ MIDE
// Tempo, tonalidad, dónde caen el bombo/la caja/el hi-hat dentro del compás,
// cuánto swing tiene, qué acordes hacen la vuelta, cómo se parte la canción
// en secciones y cuánta energía tiene cada una, y cómo se reparte el grave y
// el agudo. Todo con números; no copia ninguna melodía.
//
// QUÉ NO HACE
// No separa la voz de la mezcla y no transcribe notas. Es una medición de
// estilo, no una copia.
//
// Recibe audio ya decodificado (Float32Array mono) y la frecuencia de muestreo.
// Corre igual en el programa y en Node, para poder probarlo contra material
// con respuesta conocida.

(function (raiz) {
  "use strict";

  var SR = 22050;              // se trabaja siempre a esta frecuencia
  var N = 1024, HOP = 256;     // ventana del análisis de ritmo (11,6 ms por paso)
  var NC = 4096, HOPC = 2048;  // ventana del análisis de notas (más larga, más fina en graves)
  var FR = SR / HOP;           // pasos por segundo del análisis de ritmo

  /* ---------------- FFT ---------------- */
  var cache = {};
  function preparar(n) {
    if (cache[n]) return cache[n];
    var rev = new Uint32Array(n), bits = Math.round(Math.log(n) / Math.LN2);
    for (var i = 0; i < n; i++) {
      var r = 0, x = i;
      for (var b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    var cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (var k = 0; k < n / 2; k++) { cos[k] = Math.cos(2 * Math.PI * k / n); sin[k] = -Math.sin(2 * Math.PI * k / n); }
    var hann = new Float32Array(n);
    for (var j = 0; j < n; j++) hann[j] = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / (n - 1));
    return (cache[n] = { rev: rev, cos: cos, sin: sin, hann: hann });
  }
  function fft(re, im, p) {
    var n = re.length, rev = p.rev;
    for (var i = 0; i < n; i++) {
      var j = rev[i];
      if (j > i) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var size = 2; size <= n; size <<= 1) {
      var half = size >> 1, paso = n / size;
      for (var s = 0; s < n; s += size) {
        for (var k = 0, w = 0; k < half; k++, w += paso) {
          var a = s + k, b = a + half;
          var tr = re[b] * p.cos[w] - im[b] * p.sin[w];
          var ti = re[b] * p.sin[w] + im[b] * p.cos[w];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  // Cede el turno de vez en cuando para que la pantalla no se congele.
  var pausa = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

  async function recorrer(x, n, hop, alFrame) {
    var p = preparar(n), re = new Float32Array(n), im = new Float32Array(n), mag = new Float32Array(n / 2 + 1);
    var frames = Math.max(0, Math.floor((x.length - n) / hop) + 1);
    for (var f = 0; f < frames; f++) {
      var o = f * hop;
      for (var i = 0; i < n; i++) { re[i] = x[o + i] * p.hann[i]; im[i] = 0; }
      fft(re, im, p);
      for (var k = 0; k <= n / 2; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      alFrame(mag, f);
      if (f % 300 === 299) await pausa();
    }
    return frames;
  }

  /* ---------------- utilidades ---------------- */
  var hzABin = function (hz, n) { return Math.round(hz * n / SR); };
  function media(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function desvio(a, m) { var s = 0; m = m == null ? media(a) : m; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length ? Math.sqrt(s / a.length) : 0; }
  function mediana(a) { if (!a.length) return 0; var b = Array.prototype.slice.call(a).sort(function (u, v) { return u - v; }); return b[b.length >> 1]; }
  function percentil(a, p) { var b = Array.prototype.slice.call(a).sort(function (u, v) { return u - v; }); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : 0; }
  var db = function (v) { return 10 * Math.log(Math.max(v, 1e-12)) / Math.LN10; };
  var redondear = function (v, d) { var k = Math.pow(10, d || 0); return Math.round(v * k) / k; };

  // Interpola linealmente en un arreglo con posición fraccionaria.
  function en(a, pos) {
    if (pos < 0 || pos > a.length - 1) return 0;
    var i = Math.floor(pos), f = pos - i;
    return i + 1 < a.length ? a[i] * (1 - f) + a[i + 1] * f : a[i];
  }

  // Le resta a cada punto el promedio de su entorno (0,5 s) y deja sólo lo
  // que sube: así el "golpe" resalta y el volumen de fondo no cuenta.
  function realce(f) {
    var n = f.length, pre = new Float64Array(n + 1), w = Math.round(FR * 0.25), o = new Float32Array(n);
    for (var i = 0; i < n; i++) pre[i + 1] = pre[i] + f[i];
    for (var t = 0; t < n; t++) {
      var a = Math.max(0, t - w), b = Math.min(n, t + w + 1);
      var m = (pre[b] - pre[a]) / (b - a);
      o[t] = Math.max(0, f[t] - m);
    }
    return o;
  }

  /* ---------------- 1. espectro y golpes ---------------- */
  async function medirRitmo(x) {
    var half = N / 2 + 1;
    // La "caja" se mira entre 1,5 y 5 kHz: ahí vive el ruido de una caja o un clap,
    // y se dejan afuera las guitarras y los acordes, que están más abajo.
    var bL = [hzABin(30, N), hzABin(150, N)], bM = [hzABin(1500, N), hzABin(5000, N)], bH = [hzABin(5000, N), hzABin(10000, N)];
    // Bandas para el reparto de energía: sub/bajo, cuerpo, medio, presencia, brillo.
    var cortes = [30, 150, 500, 2000, 5000, 10000].map(function (h) { return hzABin(h, N); });
    var frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
    var fL = new Float32Array(frames), fM = new Float32Array(frames), fH = new Float32Array(frames);
    var e = [0, 1, 2, 3, 4].map(function () { return new Float32Array(frames); });
    var total = new Float32Array(frames), prev = new Float32Array(half), medio = new Float64Array(5);
    await recorrer(x, N, HOP, function (mag, f) {
      var lg = 0, k, v, d;
      var s1 = 0, s2 = 0, s3 = 0;
      for (k = bL[0]; k < bL[1]; k++) { v = Math.log(1 + 10 * mag[k]); d = v - prev[k]; if (d > 0) s1 += d; prev[k] = v; }
      for (k = bM[0]; k < bM[1]; k++) { v = Math.log(1 + 10 * mag[k]); d = v - prev[k]; if (d > 0) s2 += d; prev[k] = v; }
      for (k = bH[0]; k < bH[1]; k++) { v = Math.log(1 + 10 * mag[k]); d = v - prev[k]; if (d > 0) s3 += d; prev[k] = v; }
      fL[f] = s1; fM[f] = s2 / 12; fH[f] = s3 / 12;            // se emparejan los rangos entre bandas
      var t = 0;
      for (var b = 0; b < 5; b++) {
        var s = 0;
        for (k = cortes[b]; k < cortes[b + 1]; k++) s += mag[k] * mag[k];
        e[b][f] = s; t += s; medio[b] += s;
      }
      total[f] = t;
    });
    return { frames: frames, fL: fL, fM: fM, fH: fH, e: e, total: total, medio: medio };
  }

  /* ---------------- 2. tempo ---------------- */
  function autocorrelacion(o, maxLag) {
    var r = new Float32Array(maxLag + 1), n = o.length;
    for (var lag = 1; lag <= maxLag; lag++) {
      var s = 0;
      for (var i = 0; i + lag < n; i++) s += o[i] * o[i + lag];
      r[lag] = s / (n - lag);
    }
    var r0 = 0; for (var j = 0; j < n; j++) r0 += o[j] * o[j];
    r0 /= n;
    if (r0 > 0) for (var l = 1; l <= maxLag; l++) r[l] /= r0;
    return r;
  }

  function buscarTempo(o) {
    var maxLag = Math.round(FR * 4.2), A = autocorrelacion(o, maxLag), cand = [];
    for (var bpm = 60; bpm <= 200; bpm += 0.25) {
      var lag = FR * 60 / bpm;
      // El pulso se repite al doble y al cuádruple: se suman para no quedarse con un múltiplo.
      var s = en(A, lag) + 0.5 * en(A, lag * 2) + 0.25 * en(A, lag * 4);
      // Preferencia suave por lo que la gente baila: alrededor de 105.
      var prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 105) / Math.LN2 / 0.55, 2));
      cand.push({ bpm: bpm, score: s * (0.55 + 0.45 * prior) });
    }
    var picos = [];
    for (var i = 1; i < cand.length - 1; i++) {
      if (cand[i].score > cand[i - 1].score && cand[i].score >= cand[i + 1].score) picos.push(cand[i]);
    }
    picos.sort(function (a, b) { return b.score - a.score; });
    var sal = [];
    picos.forEach(function (p) {
      if (sal.length < 4 && sal.every(function (q) { return Math.abs(q.bpm - p.bpm) / q.bpm > 0.04; })) sal.push(p);
    });
    return sal;
  }

  // Afina el tempo mirando toda la canción: con el pulso aproximado, prueba
  // tempos y fases muy cercanos y se queda con el que hace coincidir más golpes.
  function afinarTempo(o, aprox) {
    var mejor = { s: -1, bpm: aprox, fase: 0 };
    for (var bpm = aprox * 0.97; bpm <= aprox * 1.03; bpm += 0.05) {
      var beat = FR * 60 / bpm;
      for (var fase = 0; fase < beat; fase += 0.5) {
        var s = 0, n = 0;
        for (var p = fase; p < o.length - 1; p += beat) { s += en(o, p); n++; }
        s /= Math.max(1, n);
        if (s > mejor.s) mejor = { s: s, bpm: bpm, fase: fase };
      }
    }
    return mejor;
  }

  /* ---------------- 3. tonalidad y acordes ---------------- */
  var PERFIL_MAYOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var PERFIL_MENOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var NOTAS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var ESC_MAYOR = [0, 2, 4, 5, 7, 9, 11], ESC_MENOR = [0, 2, 3, 5, 7, 8, 10];

  function correlacion(a, b) {
    var ma = media(a), mb = media(b), s = 0, sa = 0, sb = 0;
    for (var i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) * (a[i] - ma); sb += (b[i] - mb) * (b[i] - mb); }
    return s / Math.sqrt((sa * sb) || 1);
  }
  function rotar(v, k) { var r = []; for (var i = 0; i < 12; i++) r.push(v[(i - k + 12) % 12]); return r; }

  async function medirNotas(x) {
    var frames = Math.max(0, Math.floor((x.length - NC) / HOPC) + 1);
    var chroma = [], k0 = hzABin(65, NC), k1 = hzABin(1800, NC);
    var mapa = new Int8Array(NC / 2 + 1);
    for (var k = k0; k <= k1; k++) {
      var f = k * SR / NC;
      mapa[k] = ((Math.round(12 * Math.log(f / 440) / Math.LN2 + 69) % 12) + 12) % 12;
    }
    await recorrer(x, NC, HOPC, function (mag, fr) {
      var c = new Float32Array(12);
      for (var k = k0; k <= k1; k++) c[mapa[k]] += Math.sqrt(mag[k]);
      chroma.push(c);
    });
    return chroma;
  }

  function buscarTonalidad(chroma) {
    var suma = new Array(12).fill(0);
    chroma.forEach(function (c) { for (var i = 0; i < 12; i++) suma[i] += c[i]; });
    var res = [];
    for (var t = 0; t < 12; t++) {
      res.push({ raiz: t, menor: false, r: correlacion(suma, rotar(PERFIL_MAYOR, t)) });
      res.push({ raiz: t, menor: true, r: correlacion(suma, rotar(PERFIL_MENOR, t)) });
    }
    res.sort(function (a, b) { return b.r - a.r; });
    return res.map(function (c) {
      return { nombre: NOTAS[c.raiz] + (c.menor ? "m" : ""), raiz: c.raiz, menor: c.menor, r: redondear(c.r, 3) };
    });
  }

  // El perfil global de notas suele confundir la tónica con su dominante
  // (dice C en un tema en F). Los acordes desempatan: la tónica es el acorde
  // al que la canción vuelve, y casi todo lo demás cae dentro de su escala.
  function elegirTonalidad(ranking, acordes) {
    var vistos = acordes.filter(Boolean), n = vistos.length || 1;
    var puntuados = ranking.slice(0, 8).map(function (c) {
      var esc = c.menor ? ESC_MENOR : ESC_MAYOR, enEsc = {};
      esc.forEach(function (g) { enEsc[(c.raiz + g) % 12] = 1; });
      var tonica = 0, diat = 0;
      vistos.forEach(function (a) {
        if (a.raiz === c.raiz && a.menor === c.menor) tonica++;
        var pcs = [a.raiz, (a.raiz + (a.menor ? 3 : 4)) % 12, (a.raiz + 7) % 12];
        if (pcs.every(function (pc) { return enEsc[pc]; })) diat++;
      });
      return { c: c, puntos: c.r + 0.6 * tonica / n + 0.2 * diat / n };
    });
    puntuados.sort(function (a, b) { return b.puntos - a.puntos; });
    return puntuados.map(function (p) { return p.c; });
  }

  // Acorde de cada compás: se compara el perfil de notas del compás con las 24 tríadas.
  function acordesPorCompas(chroma, t0, barSec, compases, ton) {
    var dtC = HOPC / SR, esc = ton.menor ? ESC_MENOR : ESC_MAYOR;
    var enEscala = {};
    esc.forEach(function (g) { enEscala[(ton.raiz + g) % 12] = 1; });
    var plantillas = [];
    for (var r = 0; r < 12; r++) {
      plantillas.push({ raiz: r, menor: false, pcs: [r, (r + 4) % 12, (r + 7) % 12] });
      plantillas.push({ raiz: r, menor: true, pcs: [r, (r + 3) % 12, (r + 7) % 12] });
    }
    var sal = [];
    for (var b = 0; b < compases; b++) {
      var a = t0 + b * barSec, z = a + barSec, v = new Array(12).fill(0), n = 0;
      for (var i = 0; i < chroma.length; i++) {
        var tc = i * dtC + NC / 2 / SR;
        if (tc >= a && tc < z) { for (var k = 0; k < 12; k++) v[k] += chroma[i][k]; n++; }
      }
      if (!n) { sal.push(null); continue; }
      var norma = Math.sqrt(v.reduce(function (s, u) { return s + u * u; }, 0)) || 1;
      var mejor = null;
      plantillas.forEach(function (p) {
        var s = 0;
        p.pcs.forEach(function (pc) { s += v[pc] / norma; });
        s /= Math.sqrt(3);
        if (p.pcs.every(function (pc) { return enEscala[pc]; })) s += 0.06;   // lo diatónico es más probable
        if (!mejor || s > mejor.s) mejor = { s: s, raiz: p.raiz, menor: p.menor };
      });
      sal.push({ raiz: mejor.raiz, menor: mejor.menor, nombre: NOTAS[mejor.raiz] + (mejor.menor ? "m" : "") });
    }
    return sal;
  }

  // Busca la vuelta que se repite (1, 2, 4 u 8 compases) y la pasa a grados
  // de la escala, que es como la usa el compositor.
  function buscarVuelta(acordes, ton) {
    var esc = ton.menor ? ESC_MENOR : ESC_MAYOR, vistos = acordes.filter(Boolean);
    if (vistos.length < 4) return { largo: 0, grados: [], nombres: [], acuerdo: 0 };
    var clave = function (a) { return a ? a.nombre : "-"; };
    var mejor = null;
    [2, 4, 8].forEach(function (L) {
      var votos = [], i;
      for (i = 0; i < L; i++) votos.push({});
      acordes.forEach(function (a, b) { var c = clave(a); votos[b % L][c] = (votos[b % L][c] || 0) + 1; });
      var gana = votos.map(function (v) { return Object.keys(v).sort(function (p, q) { return v[q] - v[p]; })[0]; });
      var ok = 0;
      acordes.forEach(function (a, b) { if (clave(a) === gana[b % L]) ok++; });
      var acuerdo = ok / acordes.length;
      // Se prefiere el largo más corto que ya explique bien la canción.
      if (!mejor || acuerdo > mejor.acuerdo + 0.06) mejor = { largo: L, gana: gana, acuerdo: acuerdo };
    });
    var porNombre = {};
    acordes.forEach(function (a) { if (a) porNombre[a.nombre] = a; });
    var grados = mejor.gana.map(function (n) {
      var a = porNombre[n]; if (!a) return 0;
      var iv = ((a.raiz - ton.raiz) % 12 + 12) % 12, mejorG = 0, dist = 99;
      esc.forEach(function (s, g) { var d = Math.min(Math.abs(s - iv), 12 - Math.abs(s - iv)); if (d < dist) { dist = d; mejorG = g; } });
      return mejorG;
    });
    return { largo: mejor.largo, grados: grados, nombres: mejor.gana, acuerdo: redondear(mejor.acuerdo, 2) };
  }

  /* ---------------- 4. compás, patrones y swing ---------------- */
  function cimas(o, umbral, sepMin) {
    var res = [];
    for (var i = 1; i < o.length - 1; i++) {
      if (o[i] > umbral && o[i] > o[i - 1] && o[i] >= o[i + 1]) {
        if (res.length && i - res[res.length - 1].i < sepMin) { if (o[i] > res[res.length - 1].v) res[res.length - 1] = { i: i, v: o[i] }; continue; }
        // Se refina a fracción de paso con una parábola.
        var a = o[i - 1], b = o[i], c = o[i + 1], den = a - 2 * b + c;
        res.push({ i: i + (den ? 0.5 * (a - c) / den : 0), v: b });
      }
    }
    return res;
  }

  function medirCompas(r, oL, oM, oH, oAll, beat, fase) {
    var frames = r.frames, nBeats = Math.floor((frames - fase) / beat);
    // Fuerza de cada pulso: grave y subida de volumen. El "1" del compás es el que más pega.
    var low = [], subida = [], k;
    for (k = 0; k < nBeats; k++) {
      var p = fase + k * beat, s = 0, m = 0, w = Math.round(beat * 0.12);
      for (var d = -w; d <= w; d++) { var q = Math.round(p) + d; if (q >= 0 && q < frames) s = Math.max(s, oL[q] + 0.5 * oAll[q]); }
      var antes = 0, despues = 0, na = 0, nd = 0;
      for (var u = 1; u <= Math.round(beat); u++) {
        var a = Math.round(p) - u, z = Math.round(p) + u;
        if (a >= 0) { antes += r.total[a]; na++; }
        if (z < frames) { despues += r.total[z]; nd++; }
      }
      m = na && nd ? db(despues / nd) - db(antes / na) : 0;
      low.push(s); subida.push(m);
    }
    var zs = function (v) { var mu = media(v), sd = desvio(v, mu) || 1; return v.map(function (u) { return (u - mu) / sd; }); };
    var zl = zs(low), zr = zs(subida), tiempo = [0, 0, 0, 0], cuenta = [0, 0, 0, 0];
    for (k = 0; k < nBeats; k++) { tiempo[k % 4] += zl[k] + zr[k]; cuenta[k % 4]++; }
    var tiempos = tiempo.map(function (s, i) { return s / Math.max(1, cuenta[i]); });
    var j = tiempos.indexOf(Math.max.apply(null, tiempos));
    return { primerPulso: j, compases: Math.floor((nBeats - j) / 4) };
  }

  function medirPatrones(r, oL, oM, oH, beat, fase, j, compases, dbBarra) {
    // Sólo se miran los compases "llenos" (no la intro ni el final desnudo).
    var umbralDb = mediana(dbBarra) - 2, usar = [];
    for (var b = 0; b < compases; b++) if (dbBarra[b] >= umbralDb) usar.push(b);
    if (!usar.length) for (var b2 = 0; b2 < compases; b2++) usar.push(b2);
    var norm = function (o) { return percentil(o, 0.95) || 1; };
    var bandas = { kick: [oL, norm(oL)], caja: [oM, norm(oM)], hat: [oH, norm(oH)] };
    var sal = {}, paso = beat / 4, w = Math.max(1, Math.round(paso / 2));
    Object.keys(bandas).forEach(function (nombre) {
      var o = bandas[nombre][0], nr = bandas[nombre][1], acum = new Array(16).fill(0);
      usar.forEach(function (b) {
        var ini = fase + (j + 4 * b) * beat;
        for (var s = 0; s < 16; s++) {
          var c = Math.round(ini + s * paso), m = 0;
          for (var d = -w; d <= w; d++) { var q = c + d; if (q >= 0 && q < o.length) m = Math.max(m, o[q]); }
          acum[s] += Math.min(1, m / nr);
        }
      });
      var mx = Math.max.apply(null, acum) || 1;
      sal[nombre] = acum.map(function (v) { return redondear(v / mx, 2); });
    });
    return sal;
  }

  function medirSwing(oAll, oH, beat, fase) {
    var paso = beat / 4;
    var umbral = media(oAll) + 1.0 * desvio(oAll);
    var pk = cimas(oAll, umbral, 3);
    var pares = [], impares = [], corcheas = [], sobre = [];
    pk.forEach(function (p) {
      var sf = (p.i - fase) / paso, n = Math.round(sf), d = sf - n;
      if (n < 0) return;
      if (n % 4 === 0) sobre.push(d);
      else if (n % 4 === 2) corcheas.push(d);
      if (n % 2 === 1) impares.push(d);
      else pares.push(d);
    });
    var sesgo = sobre.length >= 8 ? mediana(sobre) : 0;
    var swing16 = impares.length >= 8 ? mediana(impares) - sesgo : 0;
    var swing8 = corcheas.length >= 8 ? mediana(corcheas) - sesgo : 0;
    var flojo = sobre.length >= 8 ? desvio(sobre.map(function (d) { return d - sesgo; })) * paso / FR * 1000 : 0;
    var pkH = cimas(oH, media(oH) + 0.8 * desvio(oH), 2).map(function (p) { return p.v; });
    var variacion = pkH.length > 8 ? desvio(pkH) / (media(pkH) || 1) : 0;
    return {
      s16: redondear(swing16, 3), s8: redondear(swing8, 3),
      microMs: redondear(flojo, 1), velCV: redondear(variacion, 2),
    };
  }

  /* ---------------- 5. forma ---------------- */
  function medirForma(r, beat, fase, j, compases, oAll) {
    var dbBarra = [], bandas = [[], [], [], [], []], dens = [], b;
    var pk = cimas(oAll, media(oAll) + 0.8 * desvio(oAll), 3);
    for (b = 0; b < compases; b++) {
      var a = Math.round(fase + (j + 4 * b) * beat), z = Math.round(fase + (j + 4 * b + 4) * beat), s = 0, n = 0, sb = [0, 0, 0, 0, 0];
      for (var i = a; i < z && i < r.frames; i++) {
        if (i < 0) continue;
        s += r.total[i]; n++;
        for (var q = 0; q < 5; q++) sb[q] += r.e[q][i];
      }
      dbBarra.push(db(s / Math.max(1, n)));
      // Cada banda por separado: así se nota cuando entra la caja o el clap aunque el grave no cambie.
      for (var q2 = 0; q2 < 5; q2++) bandas[q2].push(db(sb[q2] / Math.max(1, n)));
      dens.push(pk.filter(function (p) { return p.i >= a && p.i < z; }).length);
    }
    var z1 = function (v) { var mu = media(v), sd = desvio(v, mu) || 1; return v.map(function (u) { return (u - mu) / sd; }); };
    var F = bandas.map(z1).concat([z1(dbBarra), z1(dens)]), NF = F.length;
    var vec = function (i) { return F.map(function (f) { return f[i]; }); };
    var prom = function (a, z) {
      var m = new Array(NF).fill(0), n = 0;
      for (var i = a; i < z; i++) { var v = vec(i); for (var k = 0; k < NF; k++) m[k] += v[k]; n++; }
      return m.map(function (u) { return u / Math.max(1, n); });
    };
    var novedad = new Array(compases).fill(0);
    for (b = 2; b <= compases - 2; b++) {
      var w = Math.min(4, b, compases - b), A = prom(b - w, b), B = prom(b, b + w), d = 0;
      for (var k = 0; k < NF; k++) d += (A[k] - B[k]) * (A[k] - B[k]);
      novedad[b] = Math.sqrt(d);
    }
    // Las secciones se cuentan de a 4 compases: se elige el desfase donde más cambian las cosas.
    var mejorO = 0, mejorS = -1;
    for (var o = 0; o < 4; o++) {
      var sum = 0; for (b = o; b < compases; b += 4) sum += novedad[b];
      if (sum > mejorS) { mejorS = sum; mejorO = o; }
    }
    var cand = []; for (b = mejorO; b < compases; b += 4) if (b > 0) cand.push(b);
    var nv = cand.map(function (c) { return novedad[c]; });
    var lim = Math.max(0.6 * mediana(nv), media(nv) - 0.2 * desvio(nv));    var cortes = [0];
    cand.forEach(function (c) { if (novedad[c] >= lim && c - cortes[cortes.length - 1] >= 4) cortes.push(c); });
    if (compases - cortes[cortes.length - 1] < 4 && cortes.length > 1) cortes.pop();
    cortes.push(compases);
    // Un corte flojo que deja una sección de menos de 8 compases casi siempre es
    // un falso aviso (un loop que reinicia), no una parte nueva.
    var cambio = true;
    while (cambio) {
      cambio = false;
      for (var ci = 1; ci < cortes.length - 1; ci++) {
        var izq = cortes[ci] - cortes[ci - 1], der = cortes[ci + 1] - cortes[ci];
        if (novedad[cortes[ci]] < 1.2 && (izq < 8 || der < 8)) { cortes.splice(ci, 1); cambio = true; break; }
      }
    }
    // Secciones larguísimas se parten en bloques de 16 (así se escribe la música popular).
    var fin = [0];
    for (var i2 = 1; i2 < cortes.length; i2++) {
      var ini = fin[fin.length - 1], largo = cortes[i2] - ini;
      while (largo > 24) { ini += 16; fin.push(ini); largo = cortes[i2] - ini; }
      fin.push(cortes[i2]);
    }
    var sec = [];
    for (var s2 = 0; s2 + 1 < fin.length; s2++) {
      var a2 = fin[s2], z2 = fin[s2 + 1], suma = 0;
      for (b = a2; b < z2; b++) suma += dbBarra[b];
      sec.push({ desdeCompas: a2 + 1, compases: z2 - a2, db: suma / Math.max(1, z2 - a2) });
    }
    // Niveles de energía: se agrupan las secciones de volumen parecido cortando
    // en los saltos más grandes (de 1,2 dB para arriba), y cada grupo es un nivel.
    var orden = sec.map(function (s) { return s.db; }).sort(function (a, b) { return a - b; });
    var saltos = [];
    for (var g = 1; g < orden.length; g++) if (orden[g] - orden[g - 1] >= 1.2) saltos.push({ en: orden[g], tam: orden[g] - orden[g - 1] });
    saltos.sort(function (a, b) { return b.tam - a.tam; });
    var corta = saltos.slice(0, 3).map(function (s) { return s.en; }).sort(function (a, b) { return a - b; });
    var tabla = { 1: [3], 2: [3, 5], 3: [2, 3, 5], 4: [1, 2, 4, 5] }[corta.length + 1];
    sec.forEach(function (s) {
      var nivel = 0; corta.forEach(function (c) { if (s.db >= c) nivel++; });
      s.nivel = nivel; s.energia = tabla[nivel]; s.db = redondear(s.db, 1);
    });
    var cima = corta.length, cuenta = {}, bajo = cima >= 3 ? 1 : 0;
    sec.forEach(function (s, i) {
      var nombre;
      if (cima === 0) nombre = "Parte";
      else if (s.nivel === cima) nombre = "Estribillo";
      else if (s.nivel <= bajo && i === 0) nombre = "Intro";
      else if (s.nivel <= bajo && i === sec.length - 1) nombre = "Outro";
      else if (s.nivel <= bajo) nombre = "Puente";
      else if (i < sec.length - 1 && sec[i + 1].nivel === cima && s.compases <= 8) nombre = "Pre";
      else nombre = "Verso";
      cuenta[nombre] = (cuenta[nombre] || 0) + 1;
      s.nombre = nombre;
      s._n = cuenta[nombre];
    });
    sec.forEach(function (s) { if (cuenta[s.nombre] > 1) s.nombre += " " + s._n; delete s._n; });
    return { secciones: sec, dbBarra: dbBarra.map(function (v) { return redondear(v, 1); }) };
  }

  /* ---------------- ficha completa ---------------- */
  // Baja el audio a SR (mezcla a mono y remuestrea por promedio de bloques
  // cuando la frecuencia origen es un múltiplo; si no, interpola).
  function aMono(canales, srOrigen) {
    var n = canales[0].length, mono = new Float32Array(n), c, i;
    for (i = 0; i < n; i++) { var s = 0; for (c = 0; c < canales.length; c++) s += canales[c][i]; mono[i] = s / canales.length; }
    if (srOrigen === SR) return mono;
    var largo = Math.floor(n * SR / srOrigen), sal = new Float32Array(largo), razon = srOrigen / SR;
    for (i = 0; i < largo; i++) {
      var a = i * razon, b = (i + 1) * razon, acc = 0, cnt = 0;
      for (var k = Math.floor(a); k < Math.min(n, Math.ceil(b)); k++) { acc += mono[k]; cnt++; }
      sal[i] = cnt ? acc / cnt : 0;
    }
    return sal;
  }

  async function analizar(x, opciones) {
    opciones = opciones || {};
    var progreso = opciones.progreso || function () {};
    if (x.length < SR * 8) throw new Error("El audio es demasiado corto para analizarlo (menos de 8 segundos).");
    progreso("Midiendo golpes y volumen…");
    var r = await medirRitmo(x);
    var oL = realce(r.fL), oM = realce(r.fM), oH = realce(r.fH);
    var oAll = new Float32Array(r.frames);
    for (var i = 0; i < r.frames; i++) oAll[i] = oL[i] + oM[i] + oH[i];

    progreso("Buscando el tempo…");
    var tempos = buscarTempo(oAll);
    if (!tempos.length) throw new Error("No encontré un pulso claro.");
    var fino = afinarTempo(oAll, opciones.bpm || tempos[0].bpm);
    var beat = FR * 60 / fino.bpm, fase = fino.fase;
    var confianza = tempos.length > 1 ? tempos[0].score / (tempos[0].score + tempos[1].score) : 1;

    progreso("Ubicando los compases…");
    var comp = medirCompas(r, oL, oM, oH, oAll, beat, fase);
    var j = comp.primerPulso, compases = comp.compases;
    if (compases < 4) throw new Error("Muy pocos compases para armar una ficha.");
    var barSec = 4 * beat / FR, t0 = (fase + j * beat) / FR + N / 2 / SR;

    progreso("Leyendo la forma…");
    var forma = medirForma(r, beat, fase, j, compases, oAll);

    progreso("Leyendo notas y acordes…");
    var chroma = await medirNotas(x);
    var ranking = buscarTonalidad(chroma);
    var acordes = acordesPorCompas(chroma, t0, barSec, compases, ranking[0]);
    var tonalidades = elegirTonalidad(ranking, acordes), ton = tonalidades[0];
    acordes = acordesPorCompas(chroma, t0, barSec, compases, ton);
    var vuelta = buscarVuelta(acordes, ton);

    progreso("Midiendo groove…");
    var patrones = medirPatrones(r, oL, oM, oH, beat, fase, j, compases, forma.dbBarra);
    var swing = medirSwing(oAll, oH, beat, fase);

    var tot = r.medio.reduce(function (a, b) { return a + b; }, 0) || 1;
    var nombres = ["sub", "cuerpo", "medio", "presencia", "brillo"], balance = {};
    r.medio.forEach(function (v, k) { balance[nombres[k]] = redondear(100 * v / tot, 1); });
    var pico = 0; for (var q = 0; q < x.length; q++) { var a = Math.abs(x[q]); if (a > pico) pico = a; }
    var rms = 0; for (var q2 = 0; q2 < x.length; q2++) rms += x[q2] * x[q2];
    rms = Math.sqrt(rms / x.length);

    return {
      duracion: redondear(x.length / SR, 1),
      tempo: { bpm: redondear(fino.bpm, 1), aprox: redondear(tempos[0].bpm, 1), confianza: redondear(confianza, 2),
        candidatos: tempos.map(function (t) { return redondear(t.bpm, 1); }) },
      tonalidad: { nombre: ton.nombre, raiz: ton.raiz, menor: ton.menor, r: ton.r,
        candidatos: tonalidades.slice(0, 4).map(function (t) { return t.nombre + " (" + t.r + ")"; }) },
      compas: { t0: redondear(t0, 3), segundos: redondear(barSec, 3), compases: compases },
      swing: swing,
      patrones: patrones,
      acordes: { porCompas: acordes.map(function (a) { return a ? a.nombre : "-"; }), vuelta: vuelta },
      forma: forma.secciones.map(function (s) { return { nombre: s.nombre, desdeCompas: s.desdeCompas, compases: s.compases, energia: s.energia, db: s.db }; }),
      curva: forma.dbBarra,
      balance: balance,
      nivel: { rmsDb: redondear(db(rms * rms), 1), picoDb: redondear(db(pico * pico), 1) },
    };
  }

  // Pasa la ficha a lo que entiende el compositor.
  function aCompositor(f, opc) {
    opc = opc || {};
    // Toma los golpes más fuertes del dibujo, sin dejar dos demasiado pegados
    // (un bombo no repite a la semicorchea): cuando compiten, gana el más fuerte.
    var pos = function (arr, minimo, tope, sepMin) {
      var lista = arr.map(function (v, s) { return { s: s, v: v }; }).filter(function (p) { return p.v >= minimo; });
      lista.sort(function (a, b) { return b.v - a.v; });
      var sel = [];
      lista.forEach(function (p) {
        if (sel.length < tope && sel.every(function (q) { return Math.abs(q.s - p.s) / 4 >= (sepMin || 0); })) sel.push(p);
      });
      return sel.map(function (p) { return p.s / 4; }).sort(function (a, b) { return a - b; });
    };
    // La vuelta de acordes es lo menos confiable del análisis en música densa
    // (voces, capas, bajos largos). Sólo se usa si hay al menos dos acordes
    // distintos y la canción los repite de forma clara; si no, el compositor
    // usa la vuelta típica del género en la tonalidad de la referencia.
    var vu = f.acordes.vuelta, distintos = {};
    vu.grados.forEach(function (g) { distintos[g] = 1; });
    var vueltaClara = vu.grados.length >= 2 && Object.keys(distintos).length >= 2 && vu.acuerdo >= 0.7;
    return {
      bpm: Math.round(opc.bpm || f.tempo.bpm),
      tonalidad: opc.tonalidad || f.tonalidad.nombre,
      swing: Math.max(0, Math.min(0.35, f.swing.s16)),
      microMs: Math.max(2, Math.min(25, f.swing.microMs || 8)),
      velCV: f.swing.velCV,
      vuelta: vueltaClara ? vu.grados : null,
      forma: f.forma.map(function (s) { return { nombre: s.nombre, compases: s.compases, energia: s.energia }; }),
      patrones: { kick: pos(f.patrones.kick, 0.55, 5, 0.5), caja: pos(f.patrones.caja, 0.65, 3, 0.75), hat: pos(f.patrones.hat, 0.3, 16, 0) },
      origen: f.archivo || "",
    };
  }

  raiz.Analizador = { analizar: analizar, aMono: aMono, aCompositor: aCompositor, SR: SR };

})(typeof module !== "undefined" && module.exports ? module.exports : window);
