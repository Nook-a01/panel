// Compositor — arma una canción entera, no un loop de ocho compases.
//
// QUÉ HACE
// Devuelve una pieza con la misma forma que las demás (pistas con notas en
// tiempos), pero con estructura completa: intro, versos, pre, estribillos,
// puente y outro, cada sección con su propia densidad y con remates al final.
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
     Cada género trae: la vuelta de acordes (en grados), el patrón de batería y
     cómo camina el bajo. Los grados son índices de la escala, así la misma
     vuelta sirve en cualquier tonalidad. */
  var GENEROS = {
    afrobeats: {
      nombre: "Afrobeats / plena",
      bpm: 102,
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
      vuelta: [0, 5, 2, 4],                  // i - VI - III - V
      kick:  [0, 2],
      clap:  [0.75, 1.5, 2.75, 3.5],         // el dembow 3+3+2
      hat:   [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      perc:  [1, 3],
      bajo:  [0, 2, 3.5],
      acorde: "sostenido",
    },
    trap: {
      nombre: "Trap",
      bpm: 140,
      vuelta: [0, 5, 4, 4],
      kick:  [0, 1.75, 2.5],
      clap:  [2],
      hat:   [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      perc:  [],
      bajo:  [0, 1.75, 2.5],
      acorde: "sostenido",
    },
    house: {
      nombre: "House",
      bpm: 124,
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
     Los largos no son caprichosos: de a 8 y 16 compases, que es como está
     escrita la música popular y como la espera el oído. La "energía" de cada
     sección decide cuántas pistas entran. */
  var FORMA = [
    { nombre: "Intro",       compases: 8,  energia: 1 },
    { nombre: "Verso 1",     compases: 16, energia: 2 },
    { nombre: "Pre",         compases: 8,  energia: 3 },
    { nombre: "Estribillo 1",compases: 16, energia: 4 },
    { nombre: "Verso 2",     compases: 16, energia: 2 },
    { nombre: "Pre 2",       compases: 8,  energia: 3 },
    { nombre: "Estribillo 2",compases: 16, energia: 4 },
    { nombre: "Puente",      compases: 8,  energia: 1 },
    { nombre: "Estribillo 3",compases: 16, energia: 5 },
    { nombre: "Outro",       compases: 8,  energia: 1 },
  ];

  function componer(op) {
    op = op || {};
    var gen = GENEROS[op.genero] || GENEROS.afrobeats;
    var ton = leerTonalidad(op.tonalidad || "Am");
    var escala = ton.menor ? MENOR : MAYOR;
    var az = new Azar(op.semilla || 12345);
    var bpm = op.bpm || gen.bpm;

    // Grado de la escala -> número MIDI, en la octava que se le pida.
    function nota(grado, octava) {
      var o = Math.floor(grado / 7), g = ((grado % 7) + 7) % 7;
      return 12 * (octava + 1 + o) + ton.raiz + escala[g];
    }

    // Una pista por sonido: el clap no comparte canal con el redoblante ni el
    // hat abierto con el cerrado. En FL Studio cada canal lleva un sample, así
    // que dos sonidos en una misma pista serían uno solo.
    var pistas = {
      Kick:      [], Snare: [], Clap: [], Hats: [], "Hat abierto": [], Perc: [],
      Bajo:      [], Acordes: [], Melodía: [], Contramelodía: [],
    };
    var mapa = [];
    var t = 0;      // tiempo en negras, corrido desde el principio

    FORMA.forEach(function (sec, iSec) {
      var desde = t;
      mapa.push({ nombre: sec.nombre, desdeCompas: t / 4 + 1, compases: sec.compases });

      for (var c = 0; c < sec.compases; c++) {
        var base = t + c * 4;
        var ultimo = c === sec.compases - 1;          // el compás del remate
        var grado = gen.vuelta[c % gen.vuelta.length];

        /* --- batería --- */
        if (sec.energia >= 2) {
          gen.kick.forEach(function (x) { pistas.Kick.push(n(GOLPE, base + x, 0.25, 112)); });
        }
        if (sec.energia >= 2) {
          // Del estribillo para arriba el backbeat lo lleva el clap, que suena
          // más ancho; abajo lo lleva el redoblante.
          var caja = sec.energia >= 4 ? pistas.Clap : pistas.Snare;
          gen.clap.forEach(function (x) { caja.push(n(GOLPE, base + x, 0.25, 104)); });
        }
        if (sec.energia >= 1) {
          gen.hat.forEach(function (x, i) {
            // En las secciones de más energía el hat se parte en semicorcheas
            // de a ratos: es lo que da sensación de que sube sin agregar nada.
            if (sec.energia >= 4 && az.suerte(0.18)) {
              pistas.Hats.push(n(GOLPE, base + x, 0.12, 70));
              pistas.Hats.push(n(GOLPE, base + x + 0.25, 0.12, 56));
            } else {
              pistas.Hats.push(n(GOLPE, base + x, 0.2, i % 2 === 0 ? 80 : 60));
            }
          });
          if (sec.energia >= 3 && c % 4 === 3) pistas["Hat abierto"].push(n(GOLPE, base + 3.5, 0.4, 84));
        }
        if (sec.energia >= 3) {
          gen.perc.forEach(function (x) { pistas.Perc.push(n(GOLPE, base + x, 0.2, 72)); });
        }
        // Remate: el último compás de cada sección avisa que viene otra cosa.
        if (ultimo && sec.energia >= 2) {
          for (var r = 0; r < 4; r++) {
            pistas.Snare.push(n(GOLPE, base + 3 + r * 0.25, 0.2, 80 + r * 10));
          }
        }

        /* --- bajo --- */
        if (sec.energia >= 2) {
          gen.bajo.forEach(function (x, i) {
            var g = i === 0 ? grado : (az.suerte(0.25) ? grado + 4 : grado);
            pistas.Bajo.push(n(nombreDe(nota(g, 1)), base + x, i === 0 ? 1.2 : 0.6, i === 0 ? 108 : 88));
          });
        }

        /* --- acordes --- */
        if (sec.energia >= 1) {
          var tonos = [grado, grado + 2, grado + 4];
          if (sec.energia >= 4) tonos.push(grado + 6);   // la séptima, para que el estribillo abra
          if (gen.acorde === "sostenido") {
            tonos.forEach(function (g, i) {
              pistas.Acordes.push(n(nombreDe(nota(g, 3)), base, 3.6, 76 - i * 5));
            });
          } else {
            [0, 1.5, 2.5, 3.5].forEach(function (x, j) {
              if (j > 0 && sec.energia < 3) return;      // en secciones bajas, un golpe por compás
              tonos.forEach(function (g, i) {
                pistas.Acordes.push(n(nombreDe(nota(g, 3)), base + x, 0.45, 70 - i * 5));
              });
            });
          }
        }

        /* --- melodía --- */
        // Un motivo de cuatro compases que se repite con variación: así se
        // reconoce la canción. Una melodía distinta en cada compás no se
        // recuerda, y lo que no se recuerda no es un estribillo.
        if (sec.energia >= 3) {
          var motivo = motivoDe(az, iSec, c % 4);
          motivo.forEach(function (m) {
            pistas.Melodía.push(n(nombreDe(nota(grado + m.g, 5)), base + m.t, m.l, 88));
          });
        }
        if (sec.energia >= 4 && c % 2 === 1) {
          // Una octava abajo de la melodía: en la 6 quedaba arriba de un piano
          // entero (nota 105) y no se escuchaba, chillaba.
          pistas["Contramelodía"].push(n(nombreDe(nota(grado + 4, 4)), base + 2, 1.5, 66));
        }
      }
      t += sec.compases * 4;
    });

    function n(nota, inicio, largo, vel) {
      return { nota: nota, inicio: Math.round(inicio * 1000) / 1000, largo: largo, vel: vel };
    }

    var total = t / 4;
    var instrumentos = {
      Kick: "un kick o un 808", Snare: "redoblante", Clap: "clap o palmas",
      Hats: "hi-hat cerrado", "Hat abierto": "hi-hat abierto",
      Perc: "shaker, conga o percusión", Bajo: "808 o sub", Acordes: "piano, pad o pluck",
      "Melodía": "lead, flauta o whistle", "Contramelodía": "algo lejano, con delay",
    };
    // Cada pista, su propio canal MIDI. El 10 queda afuera a propósito: ese
    // canal significa "batería General MIDI" y acá los golpes no siguen ese mapa.
    var canales = {
      Kick: 11, Snare: 12, Clap: 13, Hats: 14, "Hat abierto": 15, Perc: 16,
      Bajo: 2, Acordes: 3, "Melodía": 4, "Contramelodía": 5,
    };
    var percusion = { Kick: 1, Snare: 1, Clap: 1, Hats: 1, "Hat abierto": 1, Perc: 1 };

    return {
      titulo: (op.titulo || "Canción nueva") + " — " + gen.nombre,
      bpm: bpm,
      tonalidad: op.tonalidad || "Am",
      compas: "4/4",
      compases: total,
      semilla: op.semilla || 12345,
      genero: op.genero || "afrobeats",
      mapa: mapa,
      charla: [
        "Son " + total + " compases: " + FORMA.map(function (s) { return s.nombre + " (" + s.compases + ")"; }).join(", ") + ".",
        "A " + bpm + " BPM eso da " + Math.round(total * 4 * 60 / bpm) + " segundos, más o menos lo que dura un tema.",
        "La vuelta de acordes se repite cada 4 compases. La melodía es un motivo de 4 compases que vuelve con variaciones: lo que no se repite no se recuerda.",
        "El último compás de cada sección tiene un remate de redoblante, que es lo que avisa que viene otra parte.",
        "Semilla " + (op.semilla || 12345) + ": con la misma semilla sale exactamente esta canción de nuevo. Cambiala y sale otra.",
      ],
      pistas: Object.keys(pistas).map(function (k) {
        return {
          nombre: k, canal: canales[k], instrumento: instrumentos[k],
          percusion: !!percusion[k],
          notas: pistas[k].sort(function (a, b) { return a.inicio - b.inicio; }),
        };
      }).filter(function (p) { return p.notas.length; }),
    };
  }

  // Motivos cortos, en grados relativos al acorde. El cuarto compás es la
  // respuesta: baja y se queda, para que la frase cierre.
  function motivoDe(az, sec, compas) {
    var formas = [
      [{ g: 0, t: 0, l: 0.75 }, { g: 2, t: 1, l: 0.5 }, { g: 4, t: 2, l: 1 }],
      [{ g: 4, t: 0.5, l: 0.5 }, { g: 2, t: 1.5, l: 0.5 }, { g: 0, t: 2.5, l: 1.2 }],
      [{ g: 0, t: 0, l: 0.5 }, { g: 0, t: 0.75, l: 0.5 }, { g: 2, t: 1.5, l: 1 }, { g: 4, t: 3, l: 0.8 }],
      [{ g: 2, t: 0, l: 1.5 }, { g: 0, t: 2, l: 2 }],
    ];
    if (compas === 3) return formas[3];
    return formas[(sec + compas) % 3];
  }

  raiz.Compositor = { componer: componer, GENEROS: GENEROS, FORMA: FORMA };

})(typeof module !== "undefined" && module.exports ? module.exports : window);
