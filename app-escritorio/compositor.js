// Compositor — arma una canción entera, no un loop de ocho compases.
//
// QUÉ HACE
// Devuelve una pieza con la misma forma que las demás (pistas con notas en
// tiempos), pero con estructura completa: intro, versos, pre, estribillos,
// puente y outro, cada sección con su propia densidad y con remates al final.
//
// DE DÓNDE SALE LA CANCIÓN
// Con un género (afrobeats, reggaetón, trap, house) usa valores típicos. Con una
// referencia analizada (op.ref, que sale del Analizador) toma de ella el tempo,
// la tonalidad, la vuelta de acordes, la forma, dónde caen el bombo, la caja y
// el hi-hat, y cuánto swing tiene. La melodía no se copia: se inventa encima.
//
// POR QUÉ NO ESCRIBE UN .flp
// Image-Line nunca publicó el formato del proyecto de FL Studio. Es binario y
// cerrado. Un MIDI multipista, en cambio, FL Studio lo importa y te crea un
// canal y un patrón por pista, que es el 80% del trabajo de armado.
//
// POR QUÉ ES REPETIBLE
// El azar va por una semilla. La misma semilla da la misma canción: si algo te
// gustó, vuelve a salir igual, y si no, cambiás la semilla y sale otra. Un
// generador que no se puede repetir no sirve para trabajar.
//
// POR QUÉ NO SUENA A REGLA
// Una máquina toca todo en la grilla, con la misma fuerza y el mismo dibujo en
// cada compás. Acá el swing corre los contratiempos, cada golpe tiembla unos
// milisegundos y cambia de fuerza, hay notas fantasma, los rellenos varían, se
// cortan el bombo y el bajo antes de un estribillo y los acordes cambian de
// posición en vez de repetir siempre la misma.

(function (raiz) {
  "use strict";

  /* ---------------- azar con semilla ---------------- */
  function Azar(semilla) {
    var s = semilla >>> 0 || 1;
    this.siguiente = function () {           // xorshift32: corto y repetible
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
    this.entre = function (a, b) { return a + Math.floor(this.siguiente() * (b - a + 1)); };
    this.suerte = function (p) { return this.siguiente() < p; };
    this.deA = function (lista) { return lista[Math.floor(this.siguiente() * lista.length)]; };
    this.tri = function () { return this.siguiente() + this.siguiente() - 1; };   // entre -1 y 1, casi siempre cerca de 0
  }

  /* ---------------- notas ---------------- */
  var NOMBRES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function nombreDe(n) { return NOMBRES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1); }

  // "Am" o "F#m" o "C" -> { raiz: 9, menor: true }
  function leerTonalidad(t) {
    var m = String(t || "Am").match(/^([A-G])([#b]?)(m?)/i);
    if (!m) return { raiz: 9, menor: true };
    var r = BASE[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    return { raiz: ((r % 12) + 12) % 12, menor: m[3].toLowerCase() === "m" };
  }

  var MENOR = [0, 2, 3, 5, 7, 8, 10];     // menor natural
  var MAYOR = [0, 2, 4, 5, 7, 9, 11];

  /* ---------------- géneros ----------------
     Cada género trae: la vuelta de acordes (en grados), el patrón de batería,
     cómo camina el bajo y cuánto swing lleva. Los grados son índices de la
     escala, así la misma vuelta sirve en cualquier tonalidad. El swing es la
     fracción de semicorchea que se retrasan los contratiempos. */
  var GENEROS = {
    afrobeats: {
      nombre: "Afrobeats / plena",
      bpm: 102,
      swing: 0.14,
      vuelta: [0, 5, 3, 4],                  // i - VI - IV - V
      kick:  [0, 1.5, 2.5, 3.5],
      clap:  [1, 3],
      hat:   [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      perc:  [0.75, 1.25, 2.75, 3.25],       // el shaker corrido, que es lo que lo hace caminar
      bajo:  [0, 1.5, 2.5, 3.5],
      acorde: "picado",
    },
    reggaeton: {
      nombre: "Reggaetón",
      bpm: 92,
      swing: 0.06,
      vuelta: [0, 5, 2, 4],                  // i - VI - III - V
      kick:  [0, 2],
      clap:  [0.75, 1.5, 2.75, 3.5],         // el dembow 3+3+2
      hat:   [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      perc:  [1, 3],
      bajo:  [0, 2, 3.5],
      acorde: "sostenido",
    },
    // Plena, con las técnicas medidas en el proyecto "LA PLENA (N H Remake)"
    // que pasó Agustín (05/10/2026). Lo que le da vida no es el azar:
    //  - diez capas de batería que se entrelazan sobre el tresillo 3-3-2,
    //  - el 3-3-2 doblado en dos sonidos (side stick + perc),
    //  - el clap 16 ms adelantado a propósito,
    //  - un mismo dibujo que se repite (34 de 44 compases) y sólo cambia en las
    //    transiciones, y cortes de batería enteros para que el tema respire,
    //  - bajo largo y acordes rasgueados que también siguen el 3-3-2.
    plena: {
      nombre: "Plena (estilo LA PLENA)",
      bpm: 99,
      swing: 0,
      vuelta: [0, 5, 3, 4],
      kick:  [0, 1, 2, 3],
      clap:  [0.75, 2.75],
      hat:   [0, 2],
      perc:  [0, 0.75, 1.5, 2, 2.75, 3.5],
      bajo:  [0, 1.5],
      acorde: "plena",
      capas: [
        // pista, golpes (en negras), fuerza, energía mínima, corrimiento en ms
        { pista: "Kick",       golpes: [0, 1, 2, 3],                  vel: 112, desde: 2 },
        { pista: "Side Stick", golpes: [0, 0.75, 1.5, 2, 2.75, 3.5],  vel: 92,  desde: 2 },
        { pista: "Perc",       golpes: [0, 0.75, 1.5, 2, 2.75, 3.5],  vel: 80,  desde: 2 },
        { pista: "Snare",      golpes: [1.5, 3.5],                    vel: 100, desde: 2 },
        { pista: "Hats",       golpes: [0, 2],                        vel: 70,  desde: 2 },
        { pista: "Clap",       golpes: [0.75, 2.75],                  vel: 108, desde: 3, ms: -16 },
        { pista: "Conga",      golpes: [0.5, 2.5],                    vel: 86,  desde: 3 },
        { pista: "Shaker",     golpes: [0.5, 0.75, 2.5, 2.75],        vel: 72,  desde: 3 },
        { pista: "Tamb",       golpes: [0, 1.5, 2, 3.5],              vel: 78,  desde: 4 },
      ],
    },
    // EDM / house con las técnicas de "I'm Awake" (Bombs Away, demo de FL),
    // medidas el 05/10/2026: bombo en negras, clap en 2 y 4, hats en corcheas,
    // hat abierto en el contratiempo y, sobre todo, transiciones en cada
    // sección: crash al arrancar, riser antes del drop, impacto en el drop y un
    // redoble de varios compases que se acelera y sube de fuerza. En el puente
    // (breakdown) no hay bombo.
    edm: {
      nombre: "EDM (estilo I'm Awake)",
      bpm: 124,
      swing: 0,
      vuelta: [0, 5, 3, 4],
      kick:  [0, 1, 2, 3],
      clap:  [1, 3],
      hat:   [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      perc:  [],
      bajo:  [0.5, 1.5, 2.5, 3.5],
      acorde: "sostenido",
      transiciones: true,
    },
    // Trap al estilo Travis Scott (BUTTERFLY EFFECT 141 BPM, SICKO MODE 155):
    // caja en el 3 (medio tiempo), hats que hacen redobles, un 808 largo que
    // sigue al bombo y un bombo que cambia de dibujo cada dos compases.
    trap: {
      nombre: "Trap",
      bpm: 141,
      swing: 0,
      vuelta: [0, 5, 4, 4],
      kick:  [0, 1.75, 2.5],
      kicks: [                               // se elige uno cada dos compases
        [0, 1.75, 2.5],
        [0, 0.75, 2.5, 3.25],
        [0, 2.25, 2.75],
        [0, 1.5, 2.75, 3.5],
        [0, 0.5, 2.5],
      ],
      clap:  [2],
      hat:   [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      redobles: true,                        // tresillos y fusas en los hats
      perc:  [],
      bajo:  [0, 1.75, 2.5],
      bajo808: true,                         // el 808 suena hasta el próximo bombo
      acorde: "sostenido",
    },
    house: {
      nombre: "House",
      bpm: 124,
      swing: 0.08,
      vuelta: [0, 3, 5, 4],
      kick:  [0, 1, 2, 3],                   // los cuatro en el piso
      clap:  [1, 3],
      hat:   [0.5, 1.5, 2.5, 3.5],           // el hat entre medio, no encima
      perc:  [0.25, 1.25, 2.25, 3.25],
      bajo:  [0.5, 1.5, 2.5, 3.5],
      acorde: "picado",
    },
  };

  // La batería NO va por el mapa General MIDI, y es a propósito.
  //
  // Cada golpe sale en su propia pista, así que el número de nota ya no tiene
  // que distinguir un bombo de un clap: eso lo dice la pista. Y como en FL
  // Studio el muestreador toca su sample sin tocarle la altura cuando la nota
  // es la 60, poner todo ahí hace que arrastrar un .wav a cada canal suene tal
  // cual es. Con el mapa General MIDI (C1, D1, F#1...) el mismo sample entraba
  // tres octavas abajo y el bombo quedaba en un retumbe.
  var GOLPE = "C4";   // = nota MIDI 60, la que FL Studio muestra como C5

  /* ---------------- la forma de la canción ----------------
     Los largos no son caprichosos: de a 4, 8 y 16 compases, que es como está
     escrita la música popular y como la espera el oído. La "energía" de cada
     sección decide cuántas pistas entran. Esta es la forma de un tema de tres
     minutos; con op.duracion se estira o se acorta. */
  var FORMA = [
    { nombre: "Intro",        compases: 8,  energia: 1 },
    { nombre: "Verso 1",      compases: 16, energia: 2 },
    { nombre: "Pre",          compases: 8,  energia: 3 },
    { nombre: "Estribillo 1", compases: 16, energia: 4 },
    { nombre: "Verso 2",      compases: 16, energia: 2 },
    { nombre: "Pre 2",        compases: 8,  energia: 3 },
    { nombre: "Estribillo 2", compases: 16, energia: 4 },
    { nombre: "Puente",       compases: 8,  energia: 1 },
    { nombre: "Estribillo 3", compases: 16, energia: 5 },
    { nombre: "Outro",        compases: 8,  energia: 1 },
  ];

  // Ajusta los largos de la forma para que la canción dure unos `seg` segundos,
  // siempre de a 4 compases y sin que ninguna parte desaparezca.
  function escalar(forma, bpm, seg) {
    var meta = Math.max(16, Math.round(seg * bpm / 240 / 4) * 4);
    var total = forma.reduce(function (a, s) { return a + s.compases; }, 0), f = meta / total;
    var sal = forma.map(function (s) {
      return { nombre: s.nombre, energia: s.energia, compases: Math.max(4, Math.round(s.compases * f / 4) * 4) };
    });
    var suma = function () { return sal.reduce(function (a, s) { return a + s.compases; }, 0); }, guardia = 0;
    while (suma() > meta + 2 && guardia++ < 60) {
      var i = 0; sal.forEach(function (s, k) { if (s.compases > sal[i].compases) i = k; });
      if (sal[i].compases <= 4) break;
      sal[i].compases -= 4;
    }
    while (suma() < meta - 2 && guardia++ < 120) {
      var j = 0; sal.forEach(function (s, k) { if (s.energia > sal[j].energia || (s.energia === sal[j].energia && s.compases < sal[j].compases)) j = k; });
      sal[j].compases += 4;
    }
    return sal;
  }

  /* ---------------- dibujos que se repiten con variación ---------------- */
  var RITMOS_PICADO = [
    [0, 1.5, 2.5, 3.5],
    [0, 0.75, 1.5, 2.5, 3.25],
    [0, 1, 1.5, 2.75, 3.5],
    [0.5, 1.5, 2.5, 3.5],
  ];
  // Motivos cortos, en grados relativos al acorde.
  var MOTIVOS = [
    [{ g: 0, t: 0, l: 0.75 }, { g: 2, t: 1, l: 0.5 }, { g: 4, t: 2, l: 1 }],
    [{ g: 4, t: 0.5, l: 0.5 }, { g: 2, t: 1.5, l: 0.5 }, { g: 0, t: 2.5, l: 1.2 }],
    [{ g: 0, t: 0, l: 0.5 }, { g: 0, t: 0.75, l: 0.5 }, { g: 2, t: 1.5, l: 1 }, { g: 4, t: 3, l: 0.8 }],
    [{ g: 2, t: 0, l: 1.5 }, { g: 0, t: 2, l: 2 }],
    [{ g: 4, t: 0, l: 0.5 }, { g: 5, t: 0.75, l: 0.5 }, { g: 4, t: 1.5, l: 0.5 }, { g: 2, t: 2.5, l: 1 }],
    [{ g: 2, t: 0.5, l: 0.75 }, { g: 4, t: 1.5, l: 0.5 }, { g: 5, t: 2, l: 0.5 }, { g: 4, t: 3, l: 0.75 }],
  ];

  // Cuánto tiembla cada instrumento, en milisegundos. El bombo y la caja son
  // los más firmes; los acordes y la melodía, los más sueltos.
  var TEMBLOR = { k: 3, s: 4, h: 7, p: 6, b: 5, a: 9, m: 12 };

  function esContratiempo16(x) {
    var k = Math.round(x * 4);
    return Math.abs(x * 4 - k) < 1e-6 && k % 2 === 1;
  }

  function componer(op) {
    op = op || {};
    var ref = op.ref || null;
    var gen = GENEROS[op.genero] || GENEROS.afrobeats;
    var ton = leerTonalidad((ref && ref.tonalidad) || op.tonalidad || "Am");
    var escala = ton.menor ? MENOR : MAYOR;
    var semilla = op.semilla || 12345;
    var az = new Azar(semilla);
    var bpm = op.bpm || (ref && ref.bpm) || gen.bpm;
    var humano = op.humano == null ? 1 : op.humano;

    var swing = (ref ? ref.swing : gen.swing) * humano;
    var factorTemblor = ref && ref.microMs ? Math.max(0.5, Math.min(2, ref.microMs / 10)) : 1;
    var factorVel = ref && ref.velCV ? Math.max(0.7, Math.min(1.8, ref.velCV / 0.4)) : 1;
    var vuelta = (ref && ref.vuelta && ref.vuelta.length) ? ref.vuelta : gen.vuelta;
    var pKick = (ref && ref.patrones && ref.patrones.kick.length >= 2) ? ref.patrones.kick : gen.kick;
    var pCaja = (ref && ref.patrones && ref.patrones.caja.length >= 1) ? ref.patrones.caja : gen.clap;
    var pHat  = (ref && ref.patrones && ref.patrones.hat.length >= 4) ? ref.patrones.hat : gen.hat;
    var pBajo = ref ? pKick : gen.bajo;
    var pPerc = gen.perc;

    var forma = (ref && ref.forma && ref.forma.length) ? ref.forma.map(function (s) { return { nombre: s.nombre, compases: s.compases, energia: s.energia }; }) : FORMA;
    var duracion = op.duracion || (ref ? null : 180);
    if (duracion) forma = escalar(forma, bpm, duracion);

    // Grado de la escala -> número MIDI, en la octava que se le pida.
    function nota(grado, octava) {
      var o = Math.floor(grado / 7), g = ((grado % 7) + 7) % 7;
      return 12 * (octava + 1 + o) + ton.raiz + escala[g];
    }

    // Una nota "tocada por una persona": corrida por el swing, con un temblor
    // de milisegundos y una fuerza que nunca es exactamente la misma.
    function n(nombre, inicio, largo, vel, tipo) {
      var x = inicio;
      if (swing && esContratiempo16(x)) x += swing * 0.25;
      var t = (TEMBLOR[tipo || "m"] || 8) * factorTemblor * humano;
      if (t) x += az.tri() * t * bpm / 60000;
      if (x < 0) x = 0;
      var v = Math.max(1, Math.min(127, vel + Math.round(az.tri() * 7 * humano * factorVel)));
      return { nota: nombre, inicio: Math.round(x * 1000) / 1000, largo: largo, vel: v };
    }

    // Una pista por sonido: el clap no comparte canal con el redoblante ni el
    // hat abierto con el cerrado. En FL Studio cada canal lleva un sample, así
    // que dos sonidos en una misma pista serían uno solo.
    var pistas = {
      Kick:      [], Snare: [], Clap: [], Hats: [], "Hat abierto": [], Perc: [],
      "Side Stick": [], Conga: [], Shaker: [], Tamb: [],
      Crash: [], Riser: [], Impacto: [], Redoble: [],
      Bajo:      [], Acordes: [], Melodía: [], Contramelodía: [],
    };
    var mapa = [];
    // Si la referencia trae su propio dibujo de bombo, manda la referencia.
    var kicksGen = gen.kicks && !(ref && ref.patrones && ref.patrones.kick.length >= 2) ? gen.kicks : null;
    var kickC = pKick;

    // Banco de ritmos: grooves de batería sacados de loops y MIDI de la
    // librería (aprender-ritmos.js). Si hay, el bombo, la caja, los hats y la
    // percusión salen de ahí en vez de los dibujos de GENEROS. Si la canción
    // sale de una referencia, manda la referencia.
    var delBanco = (!ref && op.banco && op.banco.generos && op.banco.generos[op.genero || "afrobeats"]) || [];
    var grooves = delBanco.filter(function (g) { return g.kick.length && (g.caja.length || g.hat.length); });
    var soloHats = delBanco.filter(function (g) { return g.hat.length >= 4; });
    var grooveAct = null, hatAct = null;
    // Los golpes de un compás del groove, con el tiempo relativo al compás.
    function delCompas(g, rol, c) {
      if (!g || !g[rol]) return [];
      var desde = (c % g.compases) * 4;
      return g[rol].filter(function (x) { return x[0] >= desde - 0.02 && x[0] < desde + 3.98; })
        .map(function (x) { return [Math.max(0, x[0] - desde), x[1]]; });
    }
    // Un golpe real: el tiempo ya trae el swing y el corrimiento del productor,
    // así que no se le agrega ni swing ni temblor.
    function golpeReal(lista, x, largo, fuerza, piso, techo) {
      var v = Math.round(piso + (techo - piso) * fuerza);
      lista.push({ nota: GOLPE, inicio: Math.round(x * 1000) / 1000, largo: largo, vel: Math.max(1, Math.min(127, v)) });
    }
    var t = 0;      // tiempo en negras, corrido desde el principio
    var voz = null; // la posición anterior de los acordes, para que se muevan poco

    // Elige la inversión del acorde más cercana a la anterior: lo que hace una
    // persona sin pensarlo, y lo que evita que los acordes salten de a octava.
    function voicing(grado, sept) {
      var base = [nota(grado, 3), nota(grado + 2, 3), nota(grado + 4, 3)];
      if (sept) base.push(nota(grado + 6, 3));
      var cand = [];
      [-12, 0].forEach(function (oct) {
        for (var inv = 0; inv < base.length; inv++) {
          var v = base.slice(inv).concat(base.slice(0, inv).map(function (x) { return x + 12; }));
          cand.push(v.map(function (x) { return x + oct; }));
        }
      });
      var centro = function (v) { return v.reduce(function (a, b) { return a + b; }, 0) / v.length; };
      var meta = voz ? centro(voz) : 58, mejor = null, mejorD = 1e9;
      cand.forEach(function (v) {
        var d = Math.abs(centro(v) - meta) + 0.25 * Math.abs(centro(v) - 58);
        if (d < mejorD) { mejorD = d; mejor = v; }
      });
      voz = mejor;
      return mejor;
    }

    forma.forEach(function (sec, iSec) {
      var sig = forma[iSec + 1] || null;
      mapa.push({ nombre: sec.nombre, desdeCompas: t / 4 + 1, compases: sec.compases });
      var e = sec.energia;
      var patronAcorde = 0;

      for (var c = 0; c < sec.compases; c++) {
        var base = t + c * 4;
        var ultimo = c === sec.compases - 1;          // el compás del remate
        var grado = vuelta[c % vuelta.length];
        var gradoSig = vuelta[(c + 1) % vuelta.length];
        // Antes de un estribillo se corta el grave en el último pulso: el "respiro" que hace explotar la entrada.
        var respiro = ultimo && sig && sig.energia >= e + 1 && sig.energia >= 4 && az.suerte(0.7);
        var vivo = function (x) { return !(respiro && x >= 3); };
        var relleno = ultimo && e >= 2;

        // Con banco: cada 4 compases (y al empezar cada sección) se elige otro groove real.
        var real = null;
        if (grooves.length) {
          if (!grooveAct || c % 4 === 0) {
            grooveAct = az.deA(grooves);
            hatAct = grooveAct.hat.length >= 4 ? grooveAct : (soloHats.length ? az.deA(soloHats) : null);
          }
          real = { kick: delCompas(grooveAct, "kick", c), caja: delCompas(grooveAct, "caja", c),
                   hat: delCompas(hatAct, "hat", c), perc: delCompas(grooveAct, "perc", c) };
        }

        /* --- transiciones (edm): lo que anuncia y hace explotar cada parte --- */
        if (gen.transiciones) {
          var fijoT = function (pista, x, largo, vel) {
            pistas[pista].push({ nota: GOLPE, inicio: Math.round(x * 1000) / 1000, largo: largo, vel: Math.max(1, Math.min(127, Math.round(vel))) });
          };
          var drop = sig && sig.energia >= 4 && sig.energia > e;      // la sección que viene es un drop
          if (c === 0 && e >= 2) fijoT("Crash", base, 2, e >= 4 ? 118 : 96);   // crash al arrancar cada parte
          if (c === 0 && e >= 4) fijoT("Impacto", base, 2, 120);               // impacto en el golpe del drop
          // Riser: arranca dos compases antes del drop y termina justo en él.
          if (drop && c === sec.compases - 2) fijoT("Riser", base, 8, 104);
          // Redoble que se acelera en los últimos compases antes del drop:
          // negras, corcheas, semicorcheas y fusas, con la fuerza subiendo de 64 a 127.
          var largoRed = Math.min(4, sec.compases);
          var desdeRed = sec.compases - largoRed;
          if (drop && c >= desdeRed) {
            var tramo = c - desdeRed, paso = [1, 0.5, 0.25, 0.125][Math.min(3, Math.floor(tramo * 4 / largoRed))];
            for (var yr = 0; yr < 4 - 1e-6; yr += paso) {
              var avance = (tramo * 4 + yr) / (largoRed * 4);
              fijoT("Redoble", base + yr, Math.min(0.2, paso * 0.8), 64 + 63 * avance);
            }
          }
        }

        /* --- batería en capas (plena): el mismo dibujo cada compás, sin temblor --- */
        if (gen.capas && e >= 2) {
          // En el compás de transición se van las capas finas en la segunda mitad.
          var transicion = ultimo && sig && sig.energia !== e;
          gen.capas.forEach(function (cp) {
            if (e < cp.desde) return;
            cp.golpes.forEach(function (x) {
              if (!vivo(x)) return;
              if (transicion && cp.desde >= 3 && x >= 2) return;
              var corr = (cp.ms || 0) * bpm / 60000;
              pistas[cp.pista].push({ nota: GOLPE, inicio: Math.max(0, Math.round((base + x + corr) * 1000) / 1000),
                largo: 0.2, vel: Math.max(1, Math.min(127, cp.vel - 3 + az.entre(0, 6))) });
            });
          });
          if (transicion) for (var rp = 0; rp < 4; rp++) pistas.Snare.push({ nota: GOLPE, inicio: base + 3 + rp * 0.25, largo: 0.2, vel: 72 + rp * 12 });
        }

        /* --- bombo --- */
        if (gen.capas) {
          kickC = [0, 1.5];
        } else if (real) {
          kickC = real.kick.length ? real.kick.map(function (x) { return x[0]; }) : [0];
          if (e >= 2) real.kick.forEach(function (x) { if (vivo(x[0])) golpeReal(pistas.Kick, base + x[0], 0.25, x[1], 70, 120); });
        } else {
        if (kicksGen && c % 2 === 0) kickC = az.deA(kicksGen);
        if (e >= 2) {
          kickC.forEach(function (x, i) {
            if (!vivo(x)) return;
            // Cada tanto un golpe del dibujo se cae y, más raro, aparece uno de más: así el dibujo respira.
            if (i > 0 && e >= 3 && az.suerte(0.07)) return;
            pistas.Kick.push(n(GOLPE, base + x, 0.25, x === 0 ? 114 : 98 + az.entre(0, 6), "k"));
          });
          if (e >= 3 && c % 4 === 3 && vivo(3.5) && az.suerte(0.45)) pistas.Kick.push(n(GOLPE, base + 3.5, 0.2, 88, "k"));
        }
        }

        /* --- caja: del estribillo para arriba la lleva el clap, que suena más ancho --- */
        if (gen.capas) {
          // ya la puso la batería en capas
        } else if (real) {
          if (e >= 2) {
            var cajaR = e >= 4 ? pistas.Clap : pistas.Snare;
            real.caja.forEach(function (x) {
              if (relleno && x[0] >= 3) return;   // el relleno se queda con el final
              golpeReal(cajaR, base + x[0], 0.25, x[1], 60, 118);
            });
          }
        } else if (e >= 2) {
          var caja = e >= 4 ? pistas.Clap : pistas.Snare;
          pCaja.forEach(function (x) {
            if (relleno && x >= 3 && az.suerte(0.5)) return;   // el relleno se queda con el final
            caja.push(n(GOLPE, base + x, 0.25, 104, "s"));
          });
          // Notas fantasma: golpes muy suaves entre los fuertes, lo que hace que la caja "respire".
          if (e >= 3 && az.suerte(0.35)) {
            var f = az.deA([0.75, 1.75, 2.25, 2.75, 3.75]);
            if (pCaja.indexOf(f) < 0) pistas.Snare.push(n(GOLPE, base + f, 0.12, 34 + az.entre(0, 12), "s"));
          }
        }

        /* --- hi-hat: los tiempos pesan más que los contratiempos --- */
        if (gen.capas) {
          // ya los puso la batería en capas
        } else if (real && real.hat.length) {
          // Los hats del groove real, con sus redobles y sus fuerzas tal cual.
          if (e >= 1) real.hat.forEach(function (x) { golpeReal(pistas.Hats, base + x[0], 0.12, x[1], 34, 104); });
          if (e >= 3 && (c % 4 === 3 || (c % 4 === 1 && az.suerte(0.3)))) pistas["Hat abierto"].push(n(GOLPE, base + az.deA([1.5, 3.5]), 0.4, 80, "h"));
        } else if (e >= 1) {
          // Redoble de trap: en uno o dos tiempos del compás, el hat se parte en
          // tresillos o en fusas que suben de fuerza. Es lo que más saca lo cuadrado.
          // Cada redoble ocupa medio tiempo: [desde, desde + 0.5).
          var redobles = [];
          if (gen.redobles && e >= 2) {
            var cuantos = e >= 4 ? az.deA([1, 1, 2]) : az.deA([0, 1, 1]);
            for (var rr = 0; rr < cuantos; rr++) {
              redobles.push({ desde: az.deA([1, 1.5, 2.5, 3, 3.5]), paso: az.deA([1 / 6, 1 / 6, 0.125]) });
            }
          }
          var enRedoble = function (x) {
            return redobles.some(function (r) { return x >= r.desde - 1e-6 && x < r.desde + 0.5 - 1e-6; });
          };
          redobles.forEach(function (r) {
            for (var y = r.desde, z = 0; y < r.desde + 0.5 - 1e-6; y += r.paso, z++) {
              pistas.Hats.push(n(GOLPE, base + y, r.paso * 0.8, 48 + z * 7, "h"));
            }
          });
          pHat.forEach(function (x) {
            if (enRedoble(x)) return;   // ese medio tiempo ya lo llena el redoble
            var acento = x % 1 === 0 ? 82 : (x * 2) % 1 === 0 ? 66 : 50;
            if (e >= 3 && x % 1 !== 0 && az.suerte(0.1)) return;   // un hat que falta también es groove
            if (e >= 4 && az.suerte(0.16)) {
              pistas.Hats.push(n(GOLPE, base + x, 0.12, acento - 8, "h"));
              pistas.Hats.push(n(GOLPE, base + x + 0.25, 0.1, acento - 22, "h"));
            } else {
              pistas.Hats.push(n(GOLPE, base + x, 0.2, acento, "h"));
            }
          });
          if (e >= 3 && (c % 4 === 3 || (c % 4 === 1 && az.suerte(0.3)))) pistas["Hat abierto"].push(n(GOLPE, base + az.deA([1.5, 3.5]), 0.4, 84, "h"));
        }

        /* --- percusión --- */
        if (gen.capas) {
          // ya la puso la batería en capas
        } else if (real && real.perc.length) {
          if (e >= 3) real.perc.forEach(function (x) { golpeReal(pistas.Perc, base + x[0], 0.2, x[1], 50, 100); });
        } else if (e >= 3 && pPerc.length) {
          pPerc.forEach(function (x) {
            if (az.suerte(0.15)) return;
            pistas.Perc.push(n(GOLPE, base + x, 0.2, 68 + az.entre(0, 10), "p"));
          });
        }

        /* --- relleno del último compás: cada vez uno distinto --- */
        if (relleno && !gen.capas) {
          var tipo = az.entre(0, 2);
          if (tipo === 0) {                              // redoblante en crescendo
            for (var r = 0; r < 4; r++) pistas.Snare.push(n(GOLPE, base + 3 + r * 0.25, 0.2, 70 + r * 12, "s"));
          } else if (tipo === 1) {                       // tresillo de caja
            for (var q = 0; q < 3; q++) pistas.Snare.push(n(GOLPE, base + 2.5 + q * 0.5, 0.3, 76 + q * 10, "s"));
          } else {                                       // pocos golpes, bombo y percusión
            pistas.Snare.push(n(GOLPE, base + 3.5, 0.2, 92, "s"));
            pistas.Snare.push(n(GOLPE, base + 3.75, 0.2, 108, "s"));
            if (pPerc.length) pistas.Perc.push(n(GOLPE, base + 3.25, 0.2, 80, "p"));
          }
        }

        /* --- bajo de trap: un 808 por bombo, largo hasta el próximo golpe --- */
        if (gen.bajo808 && e >= 2) {
          kickC.forEach(function (x, i) {
            if (!vivo(x)) return;
            var hasta = i + 1 < kickC.length ? kickC[i + 1] : 4;
            var alto;
            if (i === kickC.length - 1 && gradoSig !== grado && az.suerte(0.4)) alto = nota(gradoSig, 1);   // anticipa el acorde que viene
            else if (i > 0 && az.suerte(0.25)) alto = nota(grado, 2);                                       // el salto de octava del 808
            else alto = nota(grado, 1);
            pistas.Bajo.push(n(nombreDe(alto), base + x, Math.max(0.25, hasta - x - 0.05), i === 0 ? 110 : 96 + az.entre(0, 8), "b"));
          });
        }

        /* --- bajo: la tónica, pero con quinta, octava y una nota de paso hacia el próximo acorde --- */
        /* --- bajo de plena: dos notas largas por compás, sobre el 3-3-2 --- */
        if (gen.capas && e >= 2) {
          pistas.Bajo.push(n(nombreDe(nota(grado, 1)), base, 1.4, 106, "b"));
          if (vivo(1.5)) {
            var bajo2 = gradoSig !== grado && az.suerte(0.35) ? nota(gradoSig, 1) : nota(grado, 1);
            pistas.Bajo.push(n(nombreDe(bajo2), base + 1.5, respiro ? 1.4 : 2.4, 96, "b"));
          }
        }
        if (!gen.bajo808 && !gen.capas && e >= 2) {
          pBajo.forEach(function (x, i) {
            if (!vivo(x)) return;
            var esUlt = i === pBajo.length - 1, nombre;
            if (i === 0) nombre = nombreDe(nota(grado, 1));
            else if (esUlt && gradoSig !== grado && az.suerte(0.5)) {
              // nota de paso: un semitono o un grado antes del próximo acorde
              nombre = nombreDe(nota(gradoSig, 1) + az.deA([-1, 1, -2]));
            } else {
              var d = az.siguiente();
              nombre = nombreDe(d < 0.6 ? nota(grado, 1) : d < 0.8 ? nota(grado + 4, 1) : nota(grado, 2));
            }
            pistas.Bajo.push(n(nombre, base + x, i === 0 ? 1.2 : 0.35 + az.siguiente() * 0.3, i === 0 ? 108 : 84 + az.entre(0, 12), "b"));
          });
          if (e >= 3 && az.suerte(0.2)) pistas.Bajo.push(n(nombreDe(nota(grado, 1)), base + az.deA([0.75, 2.25, 3.25]), 0.15, 58, "b"));   // nota fantasma
        }

        /* --- acordes: posiciones que se mueven poco, ritmo que cambia cada dos compases --- */
        if (e >= 1) {
          if (c % 2 === 0) patronAcorde = az.entre(0, RITMOS_PICADO.length - 1);
          var vz = voicing(grado, e >= 4);
          if (gen.acorde === "plena") {
            // Golpes de acorde en 0, 1.5, 2.5 y 3 (el 3-3-2 otra vez), rasgueados de a 4 ms.
            var pg = e < 3 ? [[0, 3.6]] : [[0, 1.4], [1.5, 0.95], [2.5, 0.45], [3, 0.95]];
            var vzP = voicing(grado, true);
            pg.forEach(function (gp, j) {
              if (!vivo(gp[0])) return;
              vzP.forEach(function (m, i) {
                pistas.Acordes.push(n(nombreDe(m), base + gp[0] + i * 0.007 * bpm / 60, gp[1], (j === 0 ? 92 : 80) - i * 3, "a"));
              });
            });
          } else if (gen.acorde === "sostenido") {
            var reata = e >= 4 && c % 2 === 1 && az.suerte(0.5);
            vz.forEach(function (m, i) {
              pistas.Acordes.push(n(nombreDe(m), base + i * 0.02, reata ? 2 : 3.6, 76 - i * 4, "a"));
              if (reata) pistas.Acordes.push(n(nombreDe(m), base + 2 + i * 0.02, 1.7, 68 - i * 4, "a"));
            });
          } else {
            var golpes = e < 3 ? [0] : RITMOS_PICADO[patronAcorde];
            golpes.forEach(function (x, j) {
              if (!vivo(x)) return;
              vz.forEach(function (m, i) {
                // el "rasgueo": cada voz entra apenas después de la anterior
                pistas.Acordes.push(n(nombreDe(m), base + x + i * 0.02, 0.45, (j === 0 ? 74 : 62) - i * 3, "a"));
              });
            });
          }
        }

        /* --- melodía: una frase de cuatro compases que vuelve con cambios, y silencios --- */
        // Lo que no se repite no se recuerda, pero lo que se repite igual cansa:
        // cada vuelta cambia una nota. Y hay compases sin melodía, que es donde
        // respira la canción y donde contesta la contramelodía.
        var hayMelodia = false;
        if (e >= 3) {
          var pos = c % 4, frase = Math.floor(c / 4), b0 = (iSec + frase) % 5;
          var silencio = (e === 3 && pos < 2) || (pos === 2 && az.suerte(0.25));
          if (!silencio) {
            var motivo = pos === 3 ? MOTIVOS[3] : MOTIVOS[pos === 1 ? (b0 + 1) % 5 : b0];
            var cambio = pos === 2 || frase % 2 === 1 ? az.entre(0, motivo.length - 1) : -1;
            motivo.forEach(function (m, k) {
              var g = m.g + (k === cambio ? az.deA([-2, -1, 1, 2]) : 0);
              pistas.Melodía.push(n(nombreDe(nota(grado + g, 4)), base + m.t, m.l * (0.85 + az.siguiente() * 0.2), 86 - (e === 3 ? 8 : 0), "m"));
            });
            hayMelodia = true;
          }
        }
        if (e >= 4 && !hayMelodia && az.suerte(0.7)) {
          // contramelodía: contesta en el silencio de la melodía
          pistas["Contramelodía"].push(n(nombreDe(nota(grado + 4, 3)), base + 1, 0.75, 64, "m"));
          pistas["Contramelodía"].push(n(nombreDe(nota(grado + 2, 3)), base + 2.5, 1.25, 60, "m"));
        } else if (e >= 4 && c % 2 === 1) {
          pistas["Contramelodía"].push(n(nombreDe(nota(grado + 4, 3)), base + 2, 1.5, 62, "m"));
        }
      }
      t += sec.compases * 4;
    });

    // Dos notas iguales no pueden pisarse: la segunda cortaría a la primera y en
    // FL Studio una nota de más quedaría sonando.
    function limpiar(lista) {
      lista.sort(function (a, b) { return a.inicio - b.inicio; });
      var ultima = {}, sal = [];
      lista.forEach(function (x) {
        var p = ultima[x.nota];
        if (p && x.inicio - p.inicio < 0.06) {
          // Dos golpes casi simultáneos son uno solo: se queda el más fuerte.
          if (x.vel > p.vel) { sal[sal.indexOf(p)] = x; ultima[x.nota] = x; }
          return;
        }
        if (p && p.inicio + p.largo > x.inicio) p.largo = Math.round((x.inicio - p.inicio - 0.01) * 1000) / 1000;
        ultima[x.nota] = x;
        sal.push(x);
      });
      return sal;
    }

    var total = t / 4;
    var instrumentos = {
      Kick: "un kick o un 808", Snare: "redoblante", Clap: "clap o palmas",
      Hats: "hi-hat cerrado", "Hat abierto": "hi-hat abierto",
      Perc: "shaker, conga o percusión", Bajo: "808 o sub", Acordes: "piano, pad o pluck",
      "Side Stick": "side stick o rim", Conga: "conga", Shaker: "shaker", Tamb: "pandereta",
      Crash: "crash", Riser: "riser o crash al revés", Impacto: "impacto", Redoble: "caja para el redoble",
      "Melodía": "lead, flauta o whistle", "Contramelodía": "algo lejano, con delay",
    };
    // Cada pista, su propio canal MIDI. El 10 queda afuera a propósito: ese
    // canal significa "batería General MIDI" y acá los golpes no siguen ese mapa.
    var canales = {
      Kick: 11, Snare: 12, Clap: 13, Hats: 14, "Hat abierto": 15, Perc: 16,
      "Side Stick": 6, Conga: 7, Shaker: 8, Tamb: 9,
      // Las transiciones de edm usan los mismos canales: nunca van en la misma canción.
      Crash: 6, Riser: 7, Impacto: 8, Redoble: 9,
      Bajo: 2, Acordes: 3, "Melodía": 4, "Contramelodía": 5,
    };
    var percusion = { Kick: 1, Snare: 1, Clap: 1, Hats: 1, "Hat abierto": 1, Perc: 1, "Side Stick": 1, Conga: 1, Shaker: 1, Tamb: 1, Crash: 1, Riser: 1, Impacto: 1, Redoble: 1 };
    var seg = Math.round(total * 4 * 60 / bpm);

    var charla = [
      "Son " + total + " compases: " + forma.map(function (s) { return s.nombre + " (" + s.compases + ")"; }).join(", ") + ".",
      "A " + bpm + " BPM eso da " + Math.floor(seg / 60) + ":" + String(seg % 60).padStart(2, "0") + ".",
    ];
    if (ref) {
      charla.push("Armada a partir de la referencia" + (ref.origen ? " «" + ref.origen + "»" : "") + ": el tempo, la tonalidad, la vuelta de acordes, la forma y el dibujo de bombo, caja y hi-hat salen de ella. La melodía es nueva.");
    }
    charla.push("Feel: swing de " + Math.round(swing * 100) + "% de semicorchea y cada golpe tiembla unos " + Math.round(5 * factorTemblor) + " ms y cambia de fuerza, como tocado por una persona. Hay notas fantasma, rellenos distintos y un respiro antes de cada estribillo.");
    charla.push("Semilla " + semilla + ": con la misma semilla sale exactamente esta canción de nuevo. Cambiala y sale otra.");

    return {
      titulo: (op.titulo || "Canción nueva") + " — " + (ref ? "según referencia" : gen.nombre),
      bpm: bpm,
      tonalidad: NOMBRES[ton.raiz] + (ton.menor ? "m" : ""),
      compas: "4/4",
      compases: total,
      semilla: semilla,
      genero: op.genero || "afrobeats",
      referencia: ref ? (ref.origen || true) : null,
      swing: Math.round(swing * 1000) / 1000,
      mapa: mapa,
      charla: charla,
      pistas: Object.keys(pistas).map(function (k) {
        return {
          nombre: k, canal: canales[k], instrumento: instrumentos[k],
          percusion: !!percusion[k],
          notas: limpiar(pistas[k]),
        };
      }).filter(function (p) { return p.notas.length; }),
    };
  }

  raiz.Compositor = { componer: componer, GENEROS: GENEROS, FORMA: FORMA, escalar: escalar };

})(typeof module !== "undefined" && module.exports ? module.exports : window);
