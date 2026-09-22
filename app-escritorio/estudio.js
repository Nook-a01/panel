// Estudio — la pantalla.
//
// Corre sin acceso a Node: todo lo que toca tu máquina pasa por el puente
// (window.estudio), que expone ocho puertas y nada más.

(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var pieza = null, salidas = [], sonando = false;
  var timers = [], apagados = [], t0 = 0, raf = 0;

  /* ---------------- pestañas ---------------- */
  document.querySelectorAll("nav button").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll("nav button").forEach(function (x) { x.classList.toggle("on", x === b); });
      document.querySelectorAll(".hoja").forEach(function (h) { h.classList.toggle("on", h.id === "h-" + b.dataset.h); });
    };
  });

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var num = function (n) { return Number(n || 0).toLocaleString("es-AR"); };

  /* ---------------- notas ---------------- */
  var ESCALA = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function numeroDe(nombre) {
    var m = String(nombre).match(/^([A-G])([#b]?)(-?\d+)$/);
    if (!m) return null;
    return ESCALA[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12;
  }
  // El camino de vuelta, para transportar. Se escribe todo con sostenidos
  // (C#, no Db): son la misma tecla, y mezclar las dos formas de escribirlas
  // en un mismo archivo lo vuelve ilegible.
  var NOMBRES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function nombreDe(n) {
    return NOMBRES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  }

  function todasLasNotas() {
    var out = [];
    (pieza.pistas || []).forEach(function (p) {
      (p.notas || []).forEach(function (n) {
        var v = numeroDe(n.nota);
        if (v === null) return;
        out.push({ canal: (p.canal || 1) - 1, num: v, inicio: n.inicio, largo: n.largo, vel: n.vel || 90 });
      });
    });
    return out.sort(function (a, b) { return a.inicio - b.inicio; });
  }
  var porTiempo = function () { return 60000 / (pieza.bpm || 120); };
  var duracion = function () { return (pieza.compases || 8) * 4; };

  /* ---------------- MIDI ---------------- */
  function salidaElegida() {
    var v = $("#salida").value;
    return salidas.filter(function (o) { return o.id === v; })[0] || null;
  }
  function avisoMidi(t, clase) {
    var e = $("#estadoMidi"); e.textContent = t; e.className = "aviso " + (clase || "");
  }
  function buscarSalidas() {
    if (!navigator.requestMIDIAccess) { avisoMidi("Este programa no puede mandar MIDI.", "mal"); return; }
    navigator.requestMIDIAccess({ sysex: false }).then(function (a) {
      a.onstatechange = function () { listar(a); };
      listar(a);
    }).catch(function (e) { avisoMidi("No se pudo abrir el MIDI: " + e.message, "mal"); });
  }
  function listar(a) {
    salidas = [];
    a.outputs.forEach(function (o) { salidas.push(o); });
    var sel = $("#salida");
    var antes = sel.value;
    sel.innerHTML = '<option value="">Sonar acá (sin MIDI)</option>' +
      salidas.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + "</option>"; }).join("");
    // Se elige solo el puerto que más pinta tenga de ir a FL Studio. El nombre
    // se lo pone quien crea el puerto en loopMIDI, así que puede decir "loop",
    // "FL Studio" o "MIDI"; lo que NO hay que elegir es el sintetizador de
    // Windows, que suena a MIDI de los 90 y no entra al FL Studio.
    var candidato = salidas.filter(function (o) {
      return /fl.?studio|loop|virtual|midi/i.test(o.name) && !/wavetable|microsoft gs/i.test(o.name);
    })[0];
    if (antes && salidas.some(function (o) { return o.id === antes; })) sel.value = antes;
    else if (candidato) sel.value = candidato.id;
    if (candidato) avisoMidi("Elegí «" + candidato.name + "». Si FL Studio no lo escucha: Opciones → Ajustes de MIDI, y activalo como entrada.", "bien");
    else if (salidas.length) avisoMidi("Hay " + salidas.length + " salida(s) MIDI. Elegí la que escuche FL Studio.", "");
    else avisoMidi("No hay salidas MIDI abiertas. Abrí loopMIDI y creá un puerto.", "");
  }

  /* ---------------- sonar ---------------- */
  var audio = null;
  function pitido(n, seg, vol) {
    var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = n < 48 ? "sine" : "triangle";
    o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(Math.min(0.22, vol * 0.22), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.08, seg));
    o.connect(g); g.connect(audio.destination);
    o.start(t); o.stop(t + Math.max(0.1, seg) + 0.05);
  }
  function sonar() {
    if (!pieza) return;
    if (sonando) parar();
    var notas = todasLasNotas();
    if (!notas.length) { avisoMidi("La pieza no tiene notas.", "mal"); return; }
    var out = salidaElegida(), ms = porTiempo();
    sonando = true;
    $("#sonar").disabled = true; $("#parar").disabled = false;
    document.querySelectorAll(".rollo").forEach(function (r) { r.classList.add("sonando"); });
    if (!out) {
      audio = audio || new AudioContext();
      if (audio.state === "suspended") audio.resume();
    }
    notas.forEach(function (n) {
      timers.push(setTimeout(function () {
        if (out) {
          out.send([0x90 | n.canal, n.num, n.vel]);
          apagados.push(setTimeout(function () { out.send([0x80 | n.canal, n.num, 0]); }, n.largo * ms));
        } else pitido(n.num, n.largo * ms / 1000, n.vel / 127);
      }, n.inicio * ms));
    });
    timers.push(setTimeout(function () { parar(); sonar(); }, duracion() * ms));
    t0 = performance.now();
    mover();
  }
  function parar() {
    timers.forEach(clearTimeout); apagados.forEach(clearTimeout);
    timers = []; apagados = [];
    cancelAnimationFrame(raf);
    var out = salidaElegida();
    if (out) for (var c = 0; c < 16; c++) out.send([0xB0 | c, 123, 0]);
    sonando = false;
    $("#sonar").disabled = false; $("#parar").disabled = true;
    document.querySelectorAll(".rollo").forEach(function (r) { r.classList.remove("sonando"); });
    document.querySelectorAll(".aguja").forEach(function (a) { a.style.left = "0%"; });
  }
  function mover() {
    var pct = Math.min(100, (performance.now() - t0) / porTiempo() / duracion() * 100);
    document.querySelectorAll(".aguja").forEach(function (a) { a.style.left = pct + "%"; });
    if (sonando) raf = requestAnimationFrame(mover);
  }

  /* ---------------- instrumento de cada pista ---------------- */
  // Un .mid no puede llevar el plugin, sólo las notas. Lo que elegís acá queda
  // guardado en la versión y se muestra como guía para armar los canales en FL.
  var catalogo = [];
  async function cargarCatalogo() {
    var r = await window.estudio.plugins();
    var porNombre = {};
    r.carpetas.forEach(function (c) {
      c.plugins.forEach(function (p) {
        var k = p.nombre.toLowerCase();
        // El mismo plugin suele estar en VST3 y en VST2: se deja el VST3.
        if (!porNombre[k] || (p.clase === "VST3" && porNombre[k].clase !== "VST3")) porNombre[k] = p;
      });
    });
    catalogo = Object.keys(porNombre).map(function (k) { return porNombre[k]; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
  }
  function opcionesPlugin(pista) {
    var elegido = (pieza.plugins || {})[pista];
    var lista = catalogo.slice();
    if (elegido && !lista.some(function (x) { return x.nombre === elegido.nombre; })) lista.unshift(elegido);
    return '<option value="">FLEX (el que trae FL)</option>' + lista.map(function (p) {
      return '<option value="' + esc(p.nombre) + '"' + (elegido && elegido.nombre === p.nombre ? " selected" : "") + ">" +
        esc(p.nombre) + "</option>";
    }).join("");
  }
  $("#pistas").addEventListener("change", function (e) {
    var s = e.target.closest("select[data-pista]");
    if (!s || !pieza) return;
    var nom = s.dataset.pista;
    pieza.plugins = pieza.plugins || {};
    if (!s.value) delete pieza.plugins[nom];
    else {
      var c = catalogo.filter(function (x) { return x.nombre === s.value; })[0] || pieza.plugins[nom];
      pieza.plugins[nom] = { nombre: c.nombre, clase: c.clase };
    }
    guardar();
    pintarGuia();
  });
  function pintarGuia() {
    var caja = $("#guiaFL");
    var filas = [];
    ((pieza && pieza.pistas) || []).forEach(function (p, i) {
      if (p.percusion) return;
      var el = (pieza.plugins || {})[p.nombre];
      filas.push("<tr><td class=\"n\">" + (i + 1) + "</td><td>" + esc(p.nombre) + "</td><td>" +
        (el ? "<b>" + esc(el.nombre) + "</b> <small class=\"ruta\">" + esc(el.clase) + "</small>" : "FLEX (el que trae FL)") + "</td></tr>");
    });
    caja.innerHTML = filas.length ? '<div class="lista entera" style="margin-top:10px"><table><thead><tr>' +
      "<th>Canal en FL</th><th>Pista</th><th>Instrumento que elegiste</th></tr></thead><tbody>" +
      filas.join("") + "</tbody></table></div>" : "";
  }

  /* ---------------- dibujar la pieza ---------------- */
  function pintarPieza() {
    if (!pieza) { $("#cab").textContent = "Todavía no hay ninguna pieza"; return; }
    $("#cab").textContent = pieza.titulo || "Sin título";
    $("#datos").innerHTML =
      '<span class="chip">Tonalidad <b>' + esc(pieza.tonalidad || "—") + "</b></span>" +
      '<span class="chip">Tempo <b>' + esc(pieza.bpm || "—") + "</b> BPM</span>" +
      '<span class="chip">Compás <b>' + esc(pieza.compas || "4/4") + "</b></span>" +
      '<span class="chip"><b>' + esc(pieza.compases || 8) + "</b> compases</span>";
    $("#charla").innerHTML = (pieza.charla || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    var total = duracion();
    $("#pistas").innerHTML = (pieza.pistas || []).map(function (p) {
      var ns = (p.notas || []).map(function (n) { return { v: numeroDe(n.nota), i: n.inicio, l: n.largo }; })
        .filter(function (n) { return n.v !== null; });
      var min = Math.min.apply(null, ns.map(function (n) { return n.v; }).concat([127]));
      var max = Math.max.apply(null, ns.map(function (n) { return n.v; }).concat([0]));
      var rango = Math.max(1, max - min), barras = "";
      for (var c = 1; c < (pieza.compases || 8); c++) barras += '<span class="bar" style="left:' + (c / (pieza.compases || 8) * 100) + '%"></span>';
      return '<div class="pista"><div class="cab"><b>' + esc(p.nombre) + "</b><span style=\"color:var(--tinta2);font-size:.82rem\">" +
        esc(p.instrumento || "") + " · " + ns.length + ' notas</span></div><div class="rollo">' + barras +
        ns.map(function (n) {
          return '<i style="left:' + (n.i / total * 100) + "%;width:" + Math.max(0.6, n.l / total * 100) +
            "%;bottom:" + (6 + (n.v - min) / rango * 38) + 'px"></i>';
        }).join("") + '<span class="aguja"></span></div>' +
        (p.percusion ? "" : '<div class="fila" style="margin-top:8px"><label class="campo">Instrumento en FL ' +
          '<select data-pista="' + esc(p.nombre) + '">' + opcionesPlugin(p.nombre) + "</select></label></div>") +
        "</div>";
    }).join("");
    pintarGuia();
  }

  /* ---------------- versiones ---------------- */
  async function pintarVersiones() {
    var r = await window.estudio.versiones();
    var sel = $("#versiones");
    sel.innerHTML = r.versiones.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (v.id === r.actual ? " selected" : "") + ">" +
        esc(v.nombre) + "</option>";
    }).join("");
    $("#borrar").disabled = r.versiones.length <= 1;
  }

  $("#versiones").onchange = async function () {
    parar();
    var p = await window.estudio.abrirVersion(this.value);
    if (p) { pieza = p; pintarPieza(); pintarConfig(); pintarMapa(); }
  };

  $("#duplicar").onclick = async function () {
    parar();
    var r = await window.estudio.duplicarVersion(null, null);
    if (!r) return;
    pieza = r.pieza;
    await pintarVersiones();
    pintarPieza(); pintarConfig(); pintarMapa();
    avisoConfig("Listo: estás en una copia. Lo que toques acá no afecta a la anterior.", "bien");
  };

  $("#renombrar").onclick = async function () {
    var id = $("#versiones").value;
    var actual = $("#versiones").selectedOptions[0].textContent;
    var nuevo = prompt("¿Cómo se llama esta vuelta?", actual);
    if (!nuevo || !nuevo.trim()) return;
    await window.estudio.renombrarVersion(id, nuevo.trim());
    pintarVersiones();
  };

  $("#borrar").onclick = async function () {
    var id = $("#versiones").value;
    var nombre = $("#versiones").selectedOptions[0].textContent;
    if (!confirm("¿Borrar «" + nombre + "»? No se puede deshacer.")) return;
    parar();
    var r = await window.estudio.borrarVersion(id);
    if (!r.ok) { avisoConfig(r.porque, "mal"); return; }
    pieza = await window.estudio.abrirVersion(r.actual);
    await pintarVersiones();
    pintarPieza(); pintarConfig(); pintarMapa();
  };

  /* ---------------- configuración ---------------- */
  function avisoConfig(t, clase) {
    var e = $("#avisoConfig"); e.textContent = t; e.className = "aviso " + (clase || "");
  }
  function pintarConfig() {
    if (!pieza) return;
    $("#cBpm").value = pieza.bpm || 120;
    $("#cTon").value = pieza.tonalidad || "";
    $("#cComp").value = pieza.compases || 8;
  }
  async function guardar() {
    await window.estudio.guardarPieza(pieza);
    pintarVersiones();
  }
  function alCambiarConfig() {
    if (!pieza) return;
    var bpm = Number($("#cBpm").value), comp = Number($("#cComp").value);
    if (bpm >= 40 && bpm <= 220) pieza.bpm = bpm;
    if (comp >= 1 && comp <= 256) pieza.compases = comp;
    pieza.tonalidad = $("#cTon").value.trim() || pieza.tonalidad;
    var sonaba = sonando;
    if (sonaba) parar();
    pintarPieza();
    guardar();
    avisoConfig("Guardado.", "bien");
    if (sonaba) sonar();
  }
  ["#cBpm", "#cTon", "#cComp"].forEach(function (s) { $(s).onchange = alCambiarConfig; });

  // Transportar mueve TODAS las notas de TODAS las pistas... menos la batería:
  // ahí la nota no es una altura sino el disparo del sample. Subirle dos
  // semitonos al bombo te lo convierte en otra cosa.
  $("#aplicarTrans").onclick = function () {
    var pasos = Number($("#cTrans").value) || 0;
    if (!pieza || !pasos) { avisoConfig("Elegí cuántos semitonos mover.", ""); return; }
    var sonaba = sonando;
    if (sonaba) parar();
    var movidas = 0;
    (pieza.pistas || []).forEach(function (p) {
      if (p.percusion || p.canal === 10) return;   // el 10 es de las piezas viejas
      (p.notas || []).forEach(function (n) {
        var v = numeroDe(n.nota);
        if (v === null) return;
        var nuevo = v + pasos;
        if (nuevo < 0 || nuevo > 127) return;
        n.nota = nombreDe(nuevo);
        movidas++;
      });
    });
    $("#cTrans").value = "0";
    pintarPieza();
    guardar();
    avisoConfig("Moví " + movidas + " notas " + (pasos > 0 ? "arriba" : "abajo") +
      ". La batería no se toca: ahí cada nota es un instrumento, no una altura.", "bien");
    if (sonaba) sonar();
  };

  /* ---------------- guardar el .mid ---------------- */
  //
  // El formato se arma a mano, sin bibliotecas: tres cabeceras y eventos con el
  // tiempo contado desde el anterior. La cabecera lleva SEIS bytes exactos —
  // con dos de más el archivo se lee como formato 0 de una sola pista.
  var PPQ = 480;
  function varLen(n) { var b = [n & 0x7F]; n >>= 7; while (n > 0) { b.unshift((n & 0x7F) | 0x80); n >>= 7; } return b; }
  // Los nombres adentro de un MIDI son de una sola letra por byte. Si mandamos
  // "Melodía" en UTF-8, FL Studio lo lee byte por byte y muestra "MelodÃ­a".
  // Se le sacan los acentos y queda legible en cualquier programa.
  function sinAcentos(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^ -~]/g, "");
  }
  function texto(s) { return Array.from(new TextEncoder().encode(sinAcentos(s))); }
  function bloque(tipo, d) {
    var l = d.length;
    return texto(tipo).concat([(l >>> 24) & 255, (l >>> 16) & 255, (l >>> 8) & 255, l & 255], d);
  }
  function armarMidi() {
    var ms = 60000000 / (pieza.bpm || 120);
    var n = (pieza.pistas || []).length + 1;
    var cabeza = bloque("MThd", [0, 1, (n >> 8) & 255, n & 255, (PPQ >> 8) & 255, PPQ & 255]);
    var titulo = pieza.titulo || "Pieza";
    var meta = [0, 0xFF, 0x51, 0x03, (ms >> 16) & 255, (ms >> 8) & 255, ms & 255]
      .concat([0, 0xFF, 0x03].concat(varLen(texto(titulo).length), texto(titulo)))
      .concat([0, 0xFF, 0x2F, 0]);
    var pistas = [bloque("MTrk", meta)];
    (pieza.pistas || []).forEach(function (p) {
      var canal = (p.canal || 1) - 1, ev = [];
      (p.notas || []).forEach(function (nt) {
        var v = numeroDe(nt.nota); if (v === null) return;
        ev.push({ t: Math.round(nt.inicio * PPQ), tipo: 0x90 | canal, a: v, b: nt.vel || 90 });
        ev.push({ t: Math.round((nt.inicio + nt.largo) * PPQ), tipo: 0x80 | canal, a: v, b: 0 });
      });
      // Si empatan en el tiempo, apagar antes que encender: si no, una nota
      // repetida se apaga a sí misma apenas empezó.
      ev.sort(function (a, b) { return a.t - b.t || ((a.tipo & 0xF0) - (b.tipo & 0xF0)); });
      var nom = p.nombre || "Pista";
      var d = [0, 0xFF, 0x03].concat(varLen(texto(nom).length), texto(nom));
      var previo = 0;
      ev.forEach(function (e) { d = d.concat(varLen(e.t - previo), [e.tipo, e.a, e.b]); previo = e.t; });
      pistas.push(bloque("MTrk", d.concat([0, 0xFF, 0x2F, 0])));
    });
    return cabeza.concat.apply(cabeza, pistas);
  }
  $("#bajarMidi").onclick = async function () {
    if (!pieza) return;
    var nombre = (pieza.titulo || "pieza").replace(/[^\w\sáéíóúñ-]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() + ".mid";
    var donde = await window.estudio.guardarMidi(nombre, armarMidi());
    avisoMidi(donde ? "Guardado en " + donde : "No lo guardaste.", donde ? "bien" : "");
  };

  /* ---------------- componer ---------------- */
  $("#gDado").onclick = function () { $("#gSemilla").value = Math.floor(Math.random() * 99999) + 1; };

  $("#gArmar").onclick = async function () {
    var b = this;
    b.disabled = true; b.textContent = "Armando…";
    $("#gAviso").textContent = "";
    parar();
    try {
      var ref = null, base = $("#gBase").value;
      if (base && fichas[base]) ref = window.Analizador.aCompositor(fichas[base], { bpm: Number($("#gBpm").value) || null });
      var nueva = window.Compositor.componer({
        genero: $("#gGenero").value,
        tonalidad: $("#gTon").value.trim() || "Am",
        bpm: Number($("#gBpm").value) || null,
        semilla: Number($("#gSemilla").value) || 1,
        titulo: "Canción " + $("#gSemilla").value,
        ref: ref,
        duracion: leerDuracion($("#gDur").value),
      });
      var r = await window.estudio.versionDesde(nueva);
      pieza = r.pieza;
      await pintarVersiones();
      pintarPieza(); pintarConfig(); pintarMapa();
      var notas = pieza.pistas.reduce(function (a, p) { return a + p.notas.length; }, 0);
      var seg = Math.round(pieza.compases * 4 * 60 / pieza.bpm);
      $("#gAviso").textContent = "Listo: " + pieza.compases + " compases, " +
        Math.floor(seg / 60) + ":" + String(seg % 60).padStart(2, "0") + ", " +
        pieza.pistas.length + " pistas, " + notas + " notas.";
      $("#gAviso").className = "aviso bien";
    } catch (e) {
      $("#gAviso").textContent = "No pude armarla: " + e.message;
      $("#gAviso").className = "aviso mal";
    }
    b.disabled = false; b.textContent = "Armar la canción";
  };

  // El mapa de secciones: dónde empieza cada parte, para no perderse en 120
  // compases cuando lo abrís en FL Studio.
  function pintarMapa() {
    var caja = $("#gMapaCaja");
    if (!pieza || !pieza.mapa) { caja.hidden = true; return; }
    caja.hidden = false;
    var ms = 60000 / pieza.bpm;
    $("#gMapa").innerHTML = '<div class="lista entera"><table><thead><tr>' +
      "<th>Parte</th><th>Empieza en el compás</th><th>Dura</th><th>Minuto</th>" +
      "</tr></thead><tbody>" +
      pieza.mapa.map(function (s) {
        var seg = Math.round((s.desdeCompas - 1) * 4 * ms / 1000);
        return "<tr><td>" + esc(s.nombre) + '</td><td class="n">' + s.desdeCompas +
          '</td><td class="n">' + s.compases + '</td><td class="n">' +
          Math.floor(seg / 60) + ":" + String(seg % 60).padStart(2, "0") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  /* ---------------- plugins ---------------- */
  $("#escPlugins").onclick = async function () {
    var b = this; b.disabled = true; b.textContent = "Buscando…";
    try {
      var r = await window.estudio.plugins();
      $("#nPlugins").textContent = num(r.total);
      $("#listaPlugins").innerHTML = r.carpetas.length ? r.carpetas.map(function (c) {
        return '<div class="caja"><h2>' + esc(c.clase) + " · " + num(c.plugins.length) + " plugins</h2>" +
          '<small class="ruta">' + esc(c.ruta) + "</small>" +
          '<div class="lista" style="margin-top:9px"><table><tbody>' +
          c.plugins.map(function (p) { return "<tr><td>" + esc(p.nombre) + "</td></tr>"; }).join("") +
          "</tbody></table></div></div>";
      }).join("") : '<div class="caja vacio">No encontré plugins en las carpetas habituales.</div>';
    } catch (e) {
      $("#listaPlugins").innerHTML = '<div class="caja vacio">No se pudieron leer: ' + esc(e.message) + "</div>";
    }
    b.disabled = false; b.textContent = "Buscar mis plugins";
  };

  /* ---------------- referencias ---------------- */
  var fichas = {}, refs = [], analizando = false;
  var mmss = function (s) { return Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0"); };

  // "3:00" son tres minutos; "2,5" son dos minutos y medio; vacío = sin tocar.
  function leerDuracion(t) {
    t = String(t || "").trim();
    if (!t) return null;
    var m = t.match(/^(\d+):(\d{1,2})$/), s;
    if (m) s = Number(m[1]) * 60 + Number(m[2]);
    else { var n = Number(t.replace(",", ".")); s = n > 0 ? Math.round(n * 60) : null; }
    return s ? Math.max(60, Math.min(600, s)) : null;
  }

  var fichaVigente = function (a) { var f = fichas[a.ruta]; return f && f.bytes === a.bytes && f.mtime === a.mtime ? f : null; };

  function fichaHtml(f) {
    var chips =
      '<span class="chip">Tempo <b>' + esc(f.tempo.bpm) + "</b> BPM</span>" +
      '<span class="chip">Tonalidad <b>' + esc(f.tonalidad.nombre) + "</b></span>" +
      '<span class="chip">Dura <b>' + esc(mmss(f.duracion)) + "</b></span>" +
      '<span class="chip"><b>' + esc(f.compas.compases) + "</b> compases</span>" +
      '<span class="chip">Swing <b>' + Math.round(f.swing.s16 * 100) + "%</b></span>" +
      '<span class="chip">Nivel <b>' + esc(f.nivel.rmsDb) + "</b> dB</span>";
    var nombres = { kick: "Grave (bombo y bajo)", caja: "Medio-agudo (caja, clap)", hat: "Agudo (hi-hat)" };
    var grilla = ["kick", "caja", "hat"].map(function (k) {
      return '<div style="margin-top:3px"><span class="pl">' + nombres[k] + "</span>" +
        f.patrones[k].map(function (v, i) {
          return '<i class="paso" style="opacity:' + (0.1 + 0.9 * v).toFixed(2) + (i % 4 === 3 ? ";margin-right:9px" : "") + '"></i>';
        }).join("") + "</div>";
    }).join("");
    var mn = Math.min.apply(null, f.curva), mx = Math.max.apply(null, f.curva), rg = Math.max(1, mx - mn);
    var curva = '<div class="curva">' + f.curva.map(function (v, i) {
      return '<i title="compás ' + (i + 1) + ": " + v + ' dB" style="height:' + (10 + 90 * (v - mn) / rg).toFixed(0) + '%"></i>';
    }).join("") + "</div>";
    var secs = '<div class="lista entera" style="margin-top:10px"><table><thead><tr><th>Parte</th><th>Compás</th><th>Dura</th><th>Energía</th></tr></thead><tbody>' +
      f.forma.map(function (s) {
        return "<tr><td>" + esc(s.nombre) + '</td><td class="n">' + s.desdeCompas + '</td><td class="n">' + s.compases + '</td><td class="n">' + s.energia + " / 5</td></tr>";
      }).join("") + "</tbody></table></div>";
    var v = f.acordes.vuelta;
    return '<div class="fila" style="margin-top:10px">' + chips + "</div>" +
      '<div class="aviso">Tonalidades posibles: ' + esc(f.tonalidad.candidatos.join(", ")) + ". Tempos posibles: " + esc(f.tempo.candidatos.join(", ")) +
      ' BPM (si el principal está a la mitad o al doble de lo que sentís, decímelo).</div>' +
      '<div style="margin-top:12px"><b style="font-size:.85rem;color:var(--acento2)">Dónde caen los golpes (un compás, 16 pasos)</b>' + grilla + "</div>" +
      '<div style="margin-top:12px"><b style="font-size:.85rem;color:var(--acento2)">Vuelta de acordes</b> <span class="chip">' +
        (v.nombres.length ? esc(v.nombres.join(" – ")) + " · se repite " + (v.acuerdo * 100).toFixed(0) + "%" : "sin vuelta clara") + "</span></div>" +
      '<div style="margin-top:12px"><b style="font-size:.85rem;color:var(--acento2)">Energía compás a compás</b>' + curva + "</div>" +
      secs;
  }

  async function pintarReferencias() {
    var r = await window.estudio.refListar();
    refs = r.archivos;
    fichas = await window.estudio.fichas();
    $("#refCarpeta").textContent = r.carpeta;
    $("#refLista").innerHTML = refs.length ? refs.map(function (a) {
      var f = fichaVigente(a);
      return '<div class="caja" data-ref="' + esc(a.ruta) + '"><div class="fila" style="justify-content:space-between">' +
        "<div><b>" + esc(a.nombre) + '</b> <small class="ruta">' + (a.bytes / 1048576).toFixed(1) + " MB</small></div>" +
        '<div class="fila"><button class="b pri" data-analizar="' + esc(a.ruta) + '">' + (f ? "Analizar de nuevo" : "Analizar") + "</button>" +
        (a.agregada ? '<button class="b" data-quitar="' + esc(a.ruta) + '">Quitar</button>' : "") + "</div></div>" +
        '<div class="aviso" data-estado>' + (f ? "" : "Todavía sin analizar.") + "</div>" +
        (f ? fichaHtml(f) : "") + "</div>";
    }).join("") : '<div class="caja vacio">' + (r.existe ? "La carpeta está vacía." : "La carpeta todavía no existe.") +
      " Copiá ahí tus canciones de referencia y tocá «Actualizar lista».</div>";
    var sel = $("#gBase"), antes = sel.value;
    sel.innerHTML = '<option value="">Un género</option>' + refs.filter(fichaVigente).map(function (a) {
      return '<option value="' + esc(a.ruta) + '">Referencia: ' + esc(a.nombre.replace(/\.[^.]+$/, "")) + "</option>";
    }).join("");
    if (antes && fichas[antes]) sel.value = antes;
  }

  async function analizarReferencia(ruta) {
    if (analizando) return;
    var a = refs.filter(function (x) { return x.ruta === ruta; })[0];
    var caja = document.querySelector('[data-ref="' + CSS.escape(ruta) + '"]');
    if (!a || !caja) return;
    var estado = caja.querySelector("[data-estado]"), botones = document.querySelectorAll("#refLista button");
    var dice = function (t, clase) { estado.textContent = t; estado.className = "aviso " + (clase || ""); };
    analizando = true; botones.forEach(function (b) { b.disabled = true; });
    try {
      dice("Leyendo el archivo…");
      var bytes = await window.estudio.refLeer(ruta);
      var ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      dice("Decodificando el audio…");
      var buf = await new OfflineAudioContext(2, 1, window.Analizador.SR).decodeAudioData(ab);
      var canales = [];
      for (var i = 0; i < buf.numberOfChannels; i++) canales.push(buf.getChannelData(i));
      var mono = window.Analizador.aMono(canales, buf.sampleRate);
      var ficha = await window.Analizador.analizar(mono, { progreso: dice });
      ficha.archivo = a.nombre.replace(/\.[^.]+$/, "");
      ficha.bytes = a.bytes; ficha.mtime = a.mtime;
      await window.estudio.guardarFicha(ruta, ficha);
      analizando = false;
      await pintarReferencias();
    } catch (e) {
      analizando = false;
      dice("No pude analizarla: " + e.message, "mal");
      botones.forEach(function (b) { b.disabled = false; });
    }
  }

  $("#refLista").addEventListener("click", async function (e) {
    var an = e.target.closest("[data-analizar]"), qu = e.target.closest("[data-quitar]");
    if (an) analizarReferencia(an.dataset.analizar);
    if (qu) { await window.estudio.refQuitar(qu.dataset.quitar); pintarReferencias(); }
  });
  $("#refAgregar").onclick = async function () { await window.estudio.refAgregar(); pintarReferencias(); };
  $("#refActualizar").onclick = function () { pintarReferencias(); };
  $("#gBase").onchange = function () {
    var f = fichas[this.value];
    $("#gBaseAviso").textContent = f
      ? "Va a salir a " + f.tempo.bpm + " BPM en " + f.tonalidad.nombre + ", con la forma de la referencia (" + mmss(f.duracion) + "). Si ponés una duración, la forma se ajusta."
      : "Con una referencia, el tempo, la tonalidad, los acordes, la forma y el ritmo salen de ella.";
  };

  /* ---------------- samples ---------------- */
  async function pintarSamples() {
    var carpetas = await window.estudio.carpetas();
    if (!carpetas.length) {
      $("#listaSamples").innerHTML = '<div class="caja vacio">Todavía no agregaste ninguna carpeta.</div>';
      return;
    }
    $("#listaSamples").innerHTML = carpetas.map(function (ruta) {
      return '<div class="caja" data-ruta="' + esc(ruta) + '">' +
        '<div class="fila" style="justify-content:space-between">' +
          '<small class="ruta">' + esc(ruta) + "</small>" +
          '<button class="b" data-olvidar="' + esc(ruta) + '">Quitar</button></div>' +
        '<div class="aviso" data-cuenta>Contando…</div></div>';
    }).join("");

    for (const ruta of carpetas) {
      const caja = document.querySelector('[data-ruta="' + CSS.escape(ruta) + '"]');
      if (!caja) continue;
      try {
        const r = await window.estudio.samples(ruta);
        const exts = Object.entries(r.porExt).sort(function (a, b) { return b[1] - a[1]; })
          .map(function (e) { return '<span class="chip">' + esc(e[0]) + " <b>" + num(e[1]) + "</b></span>"; }).join(" ");
        caja.querySelector("[data-cuenta]").outerHTML =
          '<div class="fila" style="margin-top:10px"><span class="chip">Total <b>' + num(r.total) + "</b></span>" + exts +
          (r.cortado ? '<span class="chip" style="color:var(--acento2)">corté al llegar al tope</span>' : "") + "</div>" +
          (r.grupos.length ? '<div class="lista" style="margin-top:10px"><table><thead><tr><th>Carpeta</th><th style="text-align:right">Sonidos</th></tr></thead><tbody>' +
            r.grupos.map(function (g) { return "<tr><td>" + esc(g.nombre) + '</td><td class="n">' + num(g.cuantos) + "</td></tr>"; }).join("") +
            "</tbody></table></div>" : "");
      } catch (e) {
        caja.querySelector("[data-cuenta]").textContent = "No se pudo leer: " + e.message;
      }
    }
  }

  $("#listaSamples").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-olvidar]");
    if (!b) return;
    await window.estudio.olvidarCarpeta(b.dataset.olvidar);
    pintarSamples();
  });
  $("#addCarpeta").onclick = async function () {
    var r = await window.estudio.elegirCarpeta();
    if (r) pintarSamples();
  };
  $("#abrirDatos").onclick = function () { window.estudio.abrirCarpeta(); };

  /* ---------------- arranque ---------------- */
  $("#sonar").onclick = sonar;
  $("#parar").onclick = parar;
  $("#buscar").onclick = buscarSalidas;
  window.addEventListener("beforeunload", parar);

  (async function () {
    try { await cargarCatalogo(); } catch (e) { /* sin lista, queda sólo FLEX */ }
    pieza = await window.estudio.leerPieza();
    await pintarVersiones();
    pintarPieza();
    pintarConfig();
    pintarMapa();
    buscarSalidas();
    pintarSamples();
    try { await pintarReferencias(); } catch (e) { /* sin referencias no pasa nada */ }
  })();
})();
