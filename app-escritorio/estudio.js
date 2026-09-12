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
    var loop = salidas.filter(function (o) { return /loop/i.test(o.name); })[0];
    if (antes && salidas.some(function (o) { return o.id === antes; })) sel.value = antes;
    else if (loop) sel.value = loop.id;
    if (loop) avisoMidi("Encontré «" + loop.name + "». En FL Studio: Opciones → Ajustes de MIDI, y activalo como entrada.", "bien");
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
        }).join("") + '<span class="aguja"></span></div></div>';
    }).join("");
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
    pieza = await window.estudio.leerPieza();
    pintarPieza();
    buscarSalidas();
    pintarSamples();
  })();
})();
