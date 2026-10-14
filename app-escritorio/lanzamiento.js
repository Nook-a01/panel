// Estudio — Mezcla, Videoclip, Campaña y Métricas: la pantalla.
//
// Sin acceso a Node: todo pasa por window.lanzamiento (puente-estudio.js).
// Las cuatro secciones trabajan sobre la canción elegida en la barra de
// arriba; la elección se recuerda en esta compu.

(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var L = window.lanzamiento;
  var canciones = [], actual = null, seccion = "componer", sondeo = 0;

  function esc(t) {
    return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function aviso(sel, texto, clase) { var a = $(sel); a.textContent = texto || ""; a.className = "aviso" + (clase ? " " + clase : ""); }
  function error(sel) { return function (e) { aviso(sel, String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ""), "mal"); }; }
  function archivoUrl(p) { return "file:///" + encodeURI(String(p).replace(/\\/g, "/")).replace(/#/g, "%23"); }
  function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function leerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  // Mientras corre un pedido, el botón queda apagado para no lanzarlo dos veces.
  async function conBoton(btn, tarea) {
    btn.disabled = true;
    try { return await tarea(); } finally { btn.disabled = false; }
  }

  /* ---------------- canción elegida ---------------- */

  async function cargarCanciones() {
    var r = await L.canciones();
    canciones = r.canciones;
    var sel = $("#lzCancion");
    if (!canciones.length) {
      sel.innerHTML = '<option value="">No hay canciones guardadas</option>';
      aviso("#lzCancionAviso", "Guardá el proyecto de FL en " + r.raiz + "\\<género>\\<canción>.");
      actual = null;
      return;
    }
    var antes = leerLocal("lz-cancion");
    sel.innerHTML = canciones.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.genero + " · " + c.carpeta) + "</option>";
    }).join("");
    actual = canciones.some(function (c) { return c.id === antes; }) ? antes : canciones[0].id;
    sel.value = actual;
    aviso("#lzCancionAviso", "");
  }
  function cancion() { return canciones.find(function (c) { return c.id === actual; }) || null; }

  $("#lzCancion").onchange = function () { actual = this.value; guardarLocal("lz-cancion", actual); pintar(); };
  $("#lzRecargar").onclick = async function () { await cargarCanciones(); pintar(); };

  document.addEventListener("seccion", function (e) { seccion = e.detail; pintar(); });

  function pintar() {
    clearTimeout(sondeo);
    if (seccion === "metricas") return pintarMetricas().catch(error("#mtTablero"));
    if (!actual) return;
    if (seccion === "mezcla") pintarMezcla().catch(error("#mzAviso"));
    if (seccion === "videoclip") pintarVideoclip().catch(error("#vcAviso"));
    if (seccion === "campana") pintarCampana().catch(error("#cpPlanAviso"));
  }

  /* ---------------- MEZCLA ---------------- */

  var wavElegido = null, mezclaDatos = null, pluginsMezcla = null, notasT = 0;

  function tablaMedida(m) {
    var filas = [
      ["Volumen integrado", m.integrado != null ? m.integrado + " LUFS" : "—", "−14 LUFS"],
      ["Pico real", m.picoReal != null ? m.picoReal + " dBTP" : "—", "−1 dBTP o menos"],
      ["Rango dinámico", m.rango != null ? m.rango + " LU" : "—", ""],
      ["Formato", (m.hz ? m.hz + " Hz" : "") + (m.bits ? " · " + m.bits + " bits" : "") + (m.duracion ? " · " + m.duracion.replace(/^00:/, "") : ""), "44.100 Hz · 24 bits"],
    ];
    return '<table><tr><th></th><th>Medido</th><th>Meta</th></tr>' + filas.map(function (f) {
      return "<tr><td>" + esc(f[0]) + '</td><td class="n" style="text-align:left">' + esc(f[1]) + "</td><td>" + esc(f[2]) + "</td></tr>";
    }).join("") + "</table>" +
      '<ul style="margin:8px 0 0;padding-left:1.1rem;font-size:.86rem">' + (m.consejos || []).map(function (c) {
        return '<li class="' + (c.ok ? "ok" : "mal") + '">' + esc(c.texto) + "</li>";
      }).join("") + "</ul>";
  }

  function mostrarMedida(titulo, m, ruta) {
    $("#mzMedidaCaja").hidden = false;
    $("#mzMedidaTitulo").textContent = titulo;
    $("#mzMedida").innerHTML = (ruta ? '<small class="ruta">' + esc(ruta) + "</small>" : "") + tablaMedida(m);
  }

  // Ficha de una mezcla medida a fondo (referencia o master).
  function fichaMezcla(a) {
    var v = function (x, u) { return x == null ? "—" : x + (u || ""); };
    var b = a.bandas || {};
    return '<div class="fila" style="gap:8px">' +
      '<span class="chip">Volumen <b>' + v(a.integrado, " LUFS") + "</b></span>" +
      '<span class="chip">Pico real <b>' + v(a.picoReal, " dBTP") + "</b></span>" +
      '<span class="chip">Rango <b>' + v(a.rango, " LU") + "</b></span>" +
      '<span class="chip">Graves <b>' + v(b.graves, " dB") + "</b></span>" +
      '<span class="chip">Medios <b>' + v(b.medios, " dB") + "</b></span>" +
      '<span class="chip">Agudos <b>' + v(b.agudos, " dB") + "</b></span>" +
      '<span class="chip">Pegada <b>' + v(a.cresta, " dB") + "</b></span>" +
      '<span class="chip">Ancho estéreo <b>' + v(a.ancho, " dB") + "</b></span></div>";
  }

  function pintarComparacion(c) {
    if (!c || !c.length) return "";
    return '<h3 style="margin:12px 0 4px;font-size:.92rem">Tu master contra la referencia</h3><ul style="margin:0;padding-left:1.1rem;font-size:.86rem">' +
      c.map(function (x) { return '<li class="' + (x.ok ? "ok" : "mal") + '">' + esc(x.texto) + "</li>"; }).join("") + "</ul>";
  }

  function pintarPluginsMezcla() {
    if (!pluginsMezcla) return;
    var elegidos = (mezclaDatos && mezclaDatos.plugins) || [];
    var grupos = {};
    pluginsMezcla.forEach(function (p) { (grupos[p.grupo] = grupos[p.grupo] || []).push(p); });
    $("#mzPlugins").className = "";
    $("#mzPlugins").innerHTML = Object.keys(grupos).map(function (g) {
      return '<div class="grupoPlug"><b>' + esc(g) + "</b>" + grupos[g].map(function (p) {
        return '<label class="plug' + (p.pro ? " pro" : "") + '"><input type="checkbox" data-plug="' + esc(p.nombre) + '"' + (elegidos.indexOf(p.nombre) >= 0 ? " checked" : "") + "> " +
          (p.pro ? "★ " : "") + esc(p.nombre) + ' <span class="aviso" style="margin:0">' + esc(p.para) + (/VST/.test(p.origen) ? " · VST" : "") + "</span></label>";
      }).join("") + "</div>";
    }).join("");
  }

  async function pintarMezcla() {
    var e = await L.mezcla(actual);
    mezclaDatos = e.medidas || {};
    var h = "";
    h += "<dl class='dato'><dt>Master WAV</dt><dd>" + (e.wav ? esc(e.wav) : "<span class='mal'>todavía no hay</span>") + "</dd>";
    h += "<dt>Master MP3</dt><dd>" + (e.mp3 ? esc(e.mp3) : "—") + "</dd>";
    if (mezclaDatos.wav) {
      var w = mezclaDatos.wav, p = mezclaDatos.mp3 || {};
      h += "<dt>Última medición</dt><dd>WAV " + esc(w.integrado) + " LUFS / " + esc(w.picoReal) + " dBTP · MP3 " + esc(p.integrado) + " LUFS / " + esc(p.picoReal) + " dBTP</dd>";
    }
    h += "<dt>Pruebas</dt><dd>" + (e.pruebas.length ? e.pruebas.map(esc).join("<br>") : "—") + "</dd></dl>";
    $("#mzEstado").innerHTML = h; $("#mzEstado").className = "";
    var ref = mezclaDatos.referencia;
    $("#mzRefNombre").textContent = ref ? ref.archivo.split("\\").pop() : "ninguna";
    $("#mzRefAnalisis").innerHTML = ref ? fichaMezcla(ref) : "";
    if ($("#mzNotas").dataset.de !== actual) { $("#mzNotas").value = mezclaDatos.notas || ""; $("#mzNotas").dataset.de = actual; }
    if (!pluginsMezcla) pluginsMezcla = await L.mezclaPlugins();
    pintarPluginsMezcla();
  }

  $("#mzRef").onclick = function () {
    conBoton(this, async function () {
      aviso("#mzAviso", "");
      $("#mzRefAnalisis").innerHTML = '<div class="aviso">Midiendo la referencia (unos segundos)…</div>';
      var a = await L.mezclaReferencia(actual);
      if (!a) { $("#mzRefAnalisis").innerHTML = ""; return; }
      mezclaDatos.referencia = a;
      $("#mzRefNombre").textContent = a.archivo.split("\\").pop();
      $("#mzRefAnalisis").innerHTML = fichaMezcla(a);
    }).catch(function (e) { $("#mzRefAnalisis").innerHTML = '<div class="aviso mal">' + esc(e.message) + "</div>"; });
  };
  $("#mzComparar").onclick = function () {
    conBoton(this, async function () {
      $("#mzRefAnalisis").innerHTML = (mezclaDatos.referencia ? fichaMezcla(mezclaDatos.referencia) : "") + '<div class="aviso">Midiendo tu master…</div>';
      var r = await L.mezclaComparar(actual);
      var h = r.referencia ? fichaMezcla(r.referencia) : '<div class="aviso mal">Falta la referencia.</div>';
      if (r.master) h += '<h3 style="margin:12px 0 4px;font-size:.92rem">Tu master</h3>' + fichaMezcla(r.master);
      else h += '<div class="aviso mal">Falta el master (paso 4).</div>';
      h += pintarComparacion(r.comparacion);
      $("#mzRefAnalisis").innerHTML = h;
    }).catch(function (e) { $("#mzRefAnalisis").innerHTML = '<div class="aviso mal">' + esc(e.message) + "</div>"; });
  };
  $("#mzNotas").addEventListener("input", function () {
    clearTimeout(notasT);
    var v = this.value;
    notasT = setTimeout(function () {
      L.mezclaGuardar(actual, { notas: v }).then(function () { aviso("#mzNotasAviso", "Guardado.", "bien"); }).catch(error("#mzNotasAviso"));
    }, 700);
  });
  function guardarPlugins() {
    var marcados = Array.prototype.map.call(document.querySelectorAll("#mzPlugins input:checked"), function (i) { return i.dataset.plug; });
    mezclaDatos.plugins = marcados;
    L.mezclaGuardar(actual, { plugins: marcados }).catch(error("#mzAviso"));
  }
  $("#mzPlugins").addEventListener("change", guardarPlugins);
  $("#mzPluginsPro").onclick = function () {
    document.querySelectorAll("#mzPlugins .plug.pro input").forEach(function (i) { i.checked = true; });
    guardarPlugins();
  };
  $("#mzPluginsNada").onclick = function () {
    document.querySelectorAll("#mzPlugins input").forEach(function (i) { i.checked = false; });
    guardarPlugins();
  };
  $("#mzElegir").onclick = function () {
    conBoton(this, async function () {
      aviso("#mzAviso", "Midiendo…");
      var r = await L.elegirWav(actual);
      if (!r) { aviso("#mzAviso", ""); return; }
      wavElegido = r.ruta;
      mostrarMedida("Medición del WAV elegido", r.medida, r.ruta);
      $("#mzUsar").hidden = false;
      $("#mzUsar").textContent = r.medida.ok ? "Usar como master" : "Usar como master igual (no llega a la meta)";
      aviso("#mzAviso", r.medida.ok ? "Llega a la meta." : "Todavía no llega: ajustá en FL, exportá otra vez y volvé a medir.", r.medida.ok ? "bien" : "mal");
    }).catch(error("#mzAviso"));
  };
  $("#mzMedirMaster").onclick = function () {
    conBoton(this, async function () {
      aviso("#mzAviso", "Midiendo…");
      var m = await L.medirMaster(actual);
      mostrarMedida("Master actual", m);
      $("#mzUsar").hidden = true;
      aviso("#mzAviso", m.ok ? "El master llega a la meta." : "El master no llega a la meta.", m.ok ? "bien" : "mal");
    }).catch(error("#mzAviso"));
  };
  $("#mzUsar").onclick = function () {
    if (!wavElegido) return;
    conBoton(this, async function () {
      aviso("#mzAviso", "Copiando el master y armando el MP3 320…");
      var r = await L.usarMaster(actual, wavElegido);
      $("#mzUsar").hidden = true;
      mostrarMedida("Master nuevo (WAV)", r.wav);
      aviso("#mzAviso", "Listo: master WAV y MP3 320 (" + r.mp3.integrado + " LUFS / " + r.mp3.picoReal + " dBTP).", "bien");
      await cargarCanciones();
      pintarMezcla();
    }).catch(error("#mzAviso"));
  };
  $("#mzAbrir").onclick = function () { L.abrir(actual, "."); };
  $("#mzMezclar").onclick = function () {
    conBoton(this, async function () {
      aviso("#mzMezclarAviso", "Armando el brief (mide el master, unos segundos)…");
      var r = await L.mezclaBrief(actual);
      var c = cancion();
      aviso("#mzMezclarAviso", "Brief listo en " + r.ruta + ". Ahora abrí el .flp en FL y decile a Claude en el chat: «mezclá " + (c ? c.titulo : "la canción") + "».", "bien");
      if (r.comparacion && r.comparacion.length) $("#mzRefAnalisis").innerHTML = (mezclaDatos.referencia ? fichaMezcla(mezclaDatos.referencia) : "") + pintarComparacion(r.comparacion);
    }).catch(error("#mzMezclarAviso"));
  };

  /* ---------------- VIDEOCLIP ---------------- */

  var pedidoT = 0;

  function ultimaLinea(cola, re) {
    var m = String(cola || "").match(re);
    return m ? m[m.length - 1] : "";
  }

  async function pintarVideoclip() {
    var e = await L.videoclip(actual);
    if ($("#vcTitulo").dataset.de !== actual) { $("#vcTitulo").value = e.titulo; $("#vcTitulo").dataset.de = actual; }
    if ($("#vcPedido").dataset.de !== actual) { $("#vcPedido").value = e.pedido || ""; $("#vcPedido").dataset.de = actual; }
    var t = e.trabajos, corriendo = Object.keys(t).some(function (k) { return t[k] && t[k].corriendo; });
    var pant = e.pantallas, nPant = Object.keys(pant).filter(function (k) { return pant[k]; }).length;
    var cu = e.cuadros, pct = cu.total ? Math.min(100, Math.round(100 * cu.hechos / cu.total)) : 0;

    function paso(n, titulo, hecho, detalle, botones, trabajo, barra) {
      var marca = trabajo && trabajo.corriendo ? "⏳" : hecho ? "✅" : "⬜";
      var falla = trabajo && !trabajo.corriendo && !hecho && trabajo.cola;
      return '<div class="paso-vc"><div class="marca">' + marca + "</div><div><b>" + n + ". " + esc(titulo) + "</b>" +
        '<div class="det">' + detalle + "</div>" + (barra != null ? '<div class="barra"><i style="width:' + barra + '%"></i></div>' : "") +
        (falla ? '<pre class="cola">' + esc(trabajo.cola.slice(-900)) + "</pre>" : "") +
        "</div><div class='fila'>" + botones + "</div></div>";
    }
    var h = "";
    h += paso(1, "Analizar el audio", !!e.audio,
      !e.hayMaster ? "<span class='mal'>Falta el master: armalo en Mezcla.</span>" :
        e.audio ? "Graves, medios, agudos y " + e.audio.golpes + " golpes de bombo en " + Math.round(e.audio.segundos) + " s." : "Mide la canción cuadro por cuadro para animar las pantallas.",
      '<button class="b" data-paso="analizar"' + (!e.hayMaster || corriendo ? " disabled" : "") + ">" + (e.audio ? "Analizar de nuevo" : "Analizar") + "</button>", null);
    var detPant = "Visualizador, espectrograma y los dos carteles con el título. " + nPant + " de 4 hechas.";
    if (t.pantallas && t.pantallas.corriendo) {
      var p = ultimaLinea(t.pantallas.cola, /PASO \d\/4[^\n]*/g), fra = ultimaLinea(t.pantallas.cola, /Fra:\s*\d+/g);
      detPant = esc(p) + (fra && e.audio ? " · cuadro " + fra.replace(/\D/g, "") + " de " + Math.round(e.audio.segundos * 30) : "");
    }
    h += paso(2, "Armar las pantallas", nPant === 4, detPant,
      '<button class="b" data-paso="pantallas"' + (!e.audio || corriendo ? " disabled" : "") + ">Armar</button>" +
      '<button class="b" data-paso="carteles"' + (!e.audio || corriendo ? " disabled" : "") + ">Rehacer con este título</button>", t.pantallas);
    h += paso(3, "Preparar y ver (vista previa)", e.hayBlend,
      e.hayBlend ? "Copia de trabajo lista. «Abrir en Blender» y barra espaciadora para verla entera, sin renderizar." : "Arma la copia de trabajo con las pantallas y el audio (medio minuto).",
      '<button class="b" data-paso="preparar"' + (nPant < 4 || corriendo ? " disabled" : "") + ">" + (e.hayBlend ? "Preparar de nuevo" : "Preparar") + "</button>" +
      '<button class="b pri" data-paso="blender"' + (!e.hayBlend ? " disabled" : "") + ">Abrir en Blender</button>", t.preparar);
    var detRender = cu.total ? cu.hechos + " de " + cu.total + " cuadros (" + pct + " %)" : "Unos 11.600 cuadros a 60 fps: tarda horas.";
    if (t.render && t.render.corriendo) detRender += " · " + esc(ultimaLinea(t.render.cola, /Saved: '[^']*\\(\d+)\.jpg'/g).replace(/.*\\/, "").replace("'", ""));
    if (e.horizontal) detRender = "Listo: " + esc(e.horizontal.split("\\").pop());
    h += paso(4, "Renderizar (16:9, YouTube)", !!e.horizontal, detRender,
      '<button class="b pri" data-paso="render"' + (nPant < 4 || corriendo ? " disabled" : "") + ">" + (cu.hechos && !e.horizontal ? "Seguir renderizando" : e.horizontal ? "Rearmar el MP4" : "Renderizar") + "</button>" +
      (e.horizontal ? '<button class="b" data-abrir="Videoclip/' + esc(e.horizontal.split("\\").pop()) + '">Ver</button>' : ""),
      t.render, cu.total && !e.horizontal ? pct : null);
    h += paso(5, "Armar el vertical (9:16, TikTok)", !!e.vertical,
      e.vertical ? "Listo: " + esc(e.vertical.split("\\").pop()) : "Recorta el horizontal siguiendo la acción. Tarda unos minutos.",
      '<button class="b" data-paso="vertical"' + (!e.horizontal || corriendo ? " disabled" : "") + ">Armar</button>" +
      (e.vertical ? '<button class="b" data-abrir="Videoclip/' + esc(e.vertical.split("\\").pop()) + '">Ver</button>' : ""), t.vertical);
    $("#vcPasos").innerHTML = h;
    if (corriendo && seccion === "videoclip") sondeo = setTimeout(pintar, 4000);
  }

  $("#vcPedido").addEventListener("input", function () {
    clearTimeout(pedidoT);
    var v = this.value;
    pedidoT = setTimeout(function () {
      L.pasoVideoclip(actual, "pedido", { texto: v }).then(function () { aviso("#vcPedidoAviso", "Guardado en Videoclip\\pedido.md.", "bien"); }).catch(error("#vcPedidoAviso"));
    }, 800);
  });
  $("#vcPasos").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.abrir) { L.abrir(actual, b.dataset.abrir); return; }
    var paso = b.dataset.paso, o = { titulo: $("#vcTitulo").value.trim() };
    if (paso === "carteles") { paso = "pantallas"; o.rehacer = ["cartel-grande", "cartel-luminoso", "visualizador"]; }
    conBoton(b, async function () {
      aviso("#vcAviso", paso === "analizar" ? "Analizando…" : paso === "blender" ? "Abriendo Blender…" : "Arrancando…");
      await L.pasoVideoclip(actual, paso, o);
      aviso("#vcAviso", paso === "analizar" ? "Audio analizado." : paso === "blender" ? "Blender abierto: barra espaciadora para reproducir." : "Corriendo aparte: podés seguir usando el Estudio.", "bien");
      pintarVideoclip();
    }).catch(error("#vcAviso"));
  });

  /* ---------------- CAMPAÑA ---------------- */

  var campana = null, guardarT = 0, clipsPedido = [];

  var DISTRIBUIDORAS = [
    ["CD Baby", "≈ US$10 por single, una sola vez", "Se queda el 9 %", "La música queda subida para siempre. Buena para pocos lanzamientos."],
    ["ONErpm", "Gratis", "Se queda ≈ 15 %", "Fuerte en Latinoamérica (tiene oficina en Argentina) y ayuda con marketing."],
    ["DistroKid", "≈ US$23-25 por año, ilimitado", "0 %", "Rápida (2-5 días a Spotify). Si dejás de pagar, baja tus canciones."],
    ["TuneCore", "≈ US$15-25 por lanzamiento por año", "≈ 0 %", "Conviene con uno o dos lanzamientos al año."],
    ["Amuse", "≈ US$24 por año", "0 % (25 % si cancelás)", "Baja la música si cancelás."],
    ["Ditto", "≈ US$19 por año, ilimitado", "0 %", "De las suscripciones más baratas."],
  ];
  var REQUISITOS = [
    "Audio: el master WAV (44,1 kHz, 16 o 24 bits). ✔ lo arma Mezcla.",
    "Tapa: JPG o PNG de 3000 × 3000, RGB, sin links ni logos de plataformas. ✔ la arma esta sección.",
    "Nombre de artista, título, género, idioma, si tiene letra explícita (este es instrumental) y créditos (compositor y productor: vos).",
    "ISRC: lo asigna la distribuidora gratis si no tenés uno.",
    "Fecha de salida con 2-3 semanas de margen, para mandarlo a las listas editoriales de Spotify (al menos 7 días antes).",
    "Cuenta a tu nombre: la crea Agustín y escribe él la contraseña.",
  ];
  var REDES = ["YouTube", "TikTok", "Instagram", "Distribuidora", "Spotify for Artists", "Spotify / Apple Music"];
  var FORMATOS = ["Video", "Short", "Reel", "Clip 9:16", "Post", "Story", "Tarea"];
  var PILARES = ["Teaser", "Lanzamiento", "Detrás de escena", "Comunidad", "Performance"];
  var APROBACION = ["Pendiente", "Aprobado", "Cambiar"];
  var CHECKLIST = ["Por armar", "Listo", "Programado", "Subido"];
  var PARTES = [["intro", "Intro"], ["drop", "Drop (lo más fuerte)"], ["puente", "Puente (lo más tranquilo)"], ["final", "Final"], ["desde", "Segundo exacto…"]];

  function pintarDistro() {
    $("#cpDistro").innerHTML = '<table><tr><th>Distribuidora</th><th>Precio</th><th>Comisión</th><th>A tener en cuenta</th></tr>' +
      DISTRIBUIDORAS.map(function (d) { return "<tr>" + d.map(function (x) { return "<td>" + esc(x) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</table><div class='aviso'>Precios de comparativas públicas de octubre de 2026: confirmalos en la página de cada una antes de pagar. " +
      "Para un primer single, CD Baby (pago único, queda para siempre) u ONErpm (gratis, fuerte en la región) son las que menos te atan.</div>" +
      "<h3 style='margin:12px 0 4px;font-size:.92rem'>Lo que te van a pedir</h3><ul style='margin:0;padding-left:1.1rem;font-size:.86rem'>" +
      REQUISITOS.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
  }

  function pintarTapa() {
    var t = campana.tapaPedido;
    if (t && $("#cpTapaTitulo").dataset.de !== actual) {
      $("#cpCamara").value = t.camara || "Detalle"; $("#cpCuadro").value = t.cuadro || 1200;
      $("#cpTapaTitulo").value = t.titulo || campana.titulo; $("#cpTapaSub").value = t.subtitulo || "NOOK";
    }
    if (!$("#cpTapaTitulo").value) $("#cpTapaTitulo").value = campana.titulo;
    $("#cpTapaTitulo").dataset.de = actual;
    $("#cpTapaVista").innerHTML = campana.tapa
      ? '<div class="medios"><div class="m"><img src="' + archivoUrl(campana.tapa) + "?" + Date.now() + '" style="width:220px;height:220px;border-radius:8px;display:block"><div class="fila" style="margin-top:6px"><button class="b" data-abrir="Campaña/' + esc(campana.tapa.split("\\").pop()) + '">Abrir tapa</button></div></div></div>'
      : "";
  }

  function pintarClipsPedido() {
    if (!clipsPedido.length) clipsPedido = (campana.clipsPedido && campana.clipsPedido.length) ? campana.clipsPedido.map(function (c) { return Object.assign({}, c); })
      : [{ parte: "intro", duracion: 20, texto: "" }, { parte: "drop", duracion: 20, texto: "" }, { parte: "puente", duracion: 20, texto: "" }];
    $("#cpClipsPedido").innerHTML = clipsPedido.map(function (c, i) {
      var parte = c.desde != null && c.desde !== "" ? "desde" : (c.parte || "drop");
      return '<div class="fila clipFila" data-i="' + i + '" style="margin-bottom:6px">' +
        '<span class="chip">clip-' + (i + 1) + "</span>" +
        '<select data-k="parte">' + PARTES.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === parte ? " selected" : "") + ">" + p[1] + "</option>"; }).join("") + "</select>" +
        '<input type="number" data-k="desde" min="0" step="1" size="5" placeholder="seg" value="' + esc(c.desde != null ? c.desde : "") + '"' + (parte === "desde" ? "" : " hidden") + ">" +
        '<label class="campo">Dura <input type="number" data-k="duracion" min="5" max="60" value="' + esc(c.duracion || 20) + '" style="width:62px"> s</label>' +
        '<input type="text" data-k="texto" size="28" placeholder="Texto en pantalla (opcional)" value="' + esc(c.texto || "") + '">' +
        '<button class="b" data-quitar="' + i + '">✕</button></div>';
    }).join("");
  }
  function leerClipsPedido() {
    clipsPedido = Array.prototype.map.call(document.querySelectorAll("#cpClipsPedido .clipFila"), function (f) {
      var parte = f.querySelector('[data-k="parte"]').value;
      return { parte: parte === "desde" ? "" : parte, desde: parte === "desde" ? f.querySelector('[data-k="desde"]').value : "",
        duracion: +f.querySelector('[data-k="duracion"]').value || 20, texto: f.querySelector('[data-k="texto"]').value.trim() };
    });
    return clipsPedido;
  }
  function pintarClipsHechos() {
    var hechos = campana.clipsHechos || [];
    $("#cpClipsLista").innerHTML = campana.clips.length ? '<div class="medios">' + campana.clips.map(function (c) {
      var h = hechos.filter(function (x) { return x.archivo === c; })[0];
      return '<div class="m">🎬 ' + esc(c) + (h ? ' <span class="aviso" style="margin:0">' + esc((h.parte || ("seg " + h.desde)) + " · " + h.duracion + " s") + "</span>" : "") +
        ' <button class="b" data-abrir="Campaña/' + esc(c) + '">Ver</button></div>';
    }).join("") + "</div>" : "";
  }

  function celda(fila, k, tipo, opciones) {
    var v = fila[k] == null ? "" : fila[k];
    if (tipo === "select") return "<select data-k='" + k + "'>" + opciones.map(function (o) { return "<option" + (o === v ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    if (tipo === "area") return "<textarea data-k='" + k + "' rows='2'>" + esc(v) + "</textarea>";
    return "<input data-k='" + k + "' type='" + tipo + "' value='" + esc(v) + "'>";
  }
  function pintarGrilla() {
    var g = campana.grilla;
    if (!g) { $("#cpGrilla").innerHTML = "Elegí la fecha y tocá «Armar el calendario»."; $("#cpGrilla").className = "vacio"; return; }
    $("#cpGrilla").className = "grillaCaja";
    var hoy = new Date().toISOString().slice(0, 10);
    var h = '<table class="grilla"><tr><th>Semana</th><th>Fecha</th><th>Hora</th><th>Red</th><th>Formato</th><th>Pilar</th><th>Objetivo</th><th>Indicaciones</th><th>Copy</th><th>Archivo</th><th>Link</th><th>Aprobación</th><th>Checklist</th><th></th></tr>';
    g.forEach(function (f, i) {
      var clase = (f.aprobacion === "Aprobado" ? "aprobada " : "") + (f.checklist === "Subido" ? "subida " : "") + (f.fecha < hoy && f.checklist !== "Subido" ? "pasada" : "");
      h += '<tr data-i="' + i + '" class="' + clase + '"><td class="sem">Semana ' + esc(f.semana) + "</td><td>" + celda(f, "fecha", "date") + "</td><td>" + celda(f, "hora", "time") + "</td><td>" +
        celda(f, "red", "select", REDES) + "</td><td>" + celda(f, "formato", "select", FORMATOS) + "</td><td>" + celda(f, "pilar", "select", PILARES) + "</td><td>" +
        celda(f, "objetivo", "area") + "</td><td>" + celda(f, "indicaciones", "area") + "</td><td class=\"copy\">" + celda(f, "copy", "area") + "</td><td>" + celda(f, "archivo", "text") + "</td><td>" +
        celda(f, "link", "url") + (f.link ? ' <a href="' + esc(f.link) + '" target="_blank">↗</a>' : "") + "</td><td>" + celda(f, "aprobacion", "select", APROBACION) + "</td><td>" +
        celda(f, "checklist", "select", CHECKLIST) + '</td><td><button class="b" data-borrar="' + i + '">✕</button></td></tr>';
    });
    $("#cpGrilla").innerHTML = h + "</table>";
  }
  function guardarGrillaPronto() {
    clearTimeout(guardarT);
    guardarT = setTimeout(function () {
      L.guardarCampana(actual, { grilla: campana.grilla }).then(function (c) { campana.grilla = c.grilla; }).catch(error("#cpPlanAviso"));
    }, 600);
  }
  function recalcularSemanas() {
    var fechas = campana.grilla.map(function (f) { return f.fecha; }).filter(Boolean).sort();
    if (!fechas.length) return;
    var d0 = new Date(fechas[0] + "T12:00:00");
    campana.grilla.forEach(function (f) {
      if (!f.fecha) return;
      f.semana = Math.floor((new Date(f.fecha + "T12:00:00") - d0) / 864e5 / 7) + 1;
    });
    campana.grilla.sort(function (a, b) { return (a.fecha || "").localeCompare(b.fecha || "") || (a.hora || "").localeCompare(b.hora || ""); });
  }

  async function pintarCampana() {
    campana = await L.campana(actual);
    clipsPedido = [];
    if (campana.estreno) $("#cpFecha").value = campana.estreno;
    else if (!$("#cpFecha").value) { var d = new Date(); d.setDate(d.getDate() + 28); $("#cpFecha").value = d.toISOString().slice(0, 10); }
    $("#cpHora").value = campana.hora || "18:00";
    $("#cpYouTube").checked = campana.plataformas.indexOf("YouTube") >= 0;
    $("#cpTikTok").checked = campana.plataformas.indexOf("TikTok") >= 0;
    $("#cpInstagram").checked = campana.plataformas.indexOf("Instagram") >= 0;
    pintarTapa(); pintarClipsPedido(); pintarClipsHechos(); pintarGrilla(); pintarDistro();
  }

  $("#cpPlan").onclick = function () {
    if (campana && campana.grilla && !confirm("Ya hay un calendario. ¿Armar uno nuevo? Se guarda el anterior en campana.json, pero se pierde lo que editaste acá.")) return;
    conBoton(this, async function () {
      var redes = [];
      if ($("#cpYouTube").checked) redes.push("YouTube");
      if ($("#cpTikTok").checked) redes.push("TikTok");
      if ($("#cpInstagram").checked) redes.push("Instagram");
      campana = await L.armarGrilla(actual, { estreno: $("#cpFecha").value, hora: $("#cpHora").value, plataformas: redes });
      pintarGrilla();
      aviso("#cpPlanAviso", "Calendario armado: " + campana.grilla.length + " piezas en " + campana.grilla[campana.grilla.length - 1].semana + " semanas. Corregilo abajo.", "bien");
      $("#cpGrillaCaja").scrollIntoView({ behavior: "smooth" });
    }).catch(error("#cpPlanAviso"));
  };
  $("#cpIcs").onclick = function () {
    conBoton(this, async function () {
      var r = await L.exportarIcs(actual);
      aviso("#cpPlanAviso", "Calendario guardado: " + r + ". Abrilo para sumarlo a tu calendario.", "bien");
    }).catch(error("#cpPlanAviso"));
  };
  $("#cpTapa").onclick = function () {
    conBoton(this, async function () {
      aviso("#cpTapaAviso", "Blender está sacando la foto de 3000 × 3000 (un minuto, más o menos)…");
      campana = await L.armarTapa(actual, { camara: $("#cpCamara").value, cuadro: +$("#cpCuadro").value || 1200,
        titulo: $("#cpTapaTitulo").value.trim() || campana.titulo, subtitulo: $("#cpTapaSub").value.trim() });
      pintarTapa();
      aviso("#cpTapaAviso", "Tapa lista.", "bien");
    }).catch(error("#cpTapaAviso"));
  };
  $("#cpTapaVista").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-abrir]");
    if (b) L.abrir(actual, b.dataset.abrir);
  });
  $("#cpClipsPedido").addEventListener("change", function (ev) {
    var f = ev.target.closest(".clipFila");
    if (!f) return;
    if (ev.target.dataset.k === "parte") f.querySelector('[data-k="desde"]').hidden = ev.target.value !== "desde";
    L.guardarCampana(actual, { clipsPedido: leerClipsPedido() }).catch(error("#cpClipsAviso"));
  });
  $("#cpClipsPedido").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-quitar]");
    if (!b) return;
    leerClipsPedido().splice(+b.dataset.quitar, 1);
    pintarClipsPedido();
    L.guardarCampana(actual, { clipsPedido: clipsPedido }).catch(error("#cpClipsAviso"));
  });
  $("#cpClipMas").onclick = function () {
    leerClipsPedido();
    if (clipsPedido.length >= 6) return;
    clipsPedido.push({ parte: "drop", duracion: 20, texto: "" });
    pintarClipsPedido();
  };
  $("#cpClips").onclick = function () {
    conBoton(this, async function () {
      aviso("#cpClipsAviso", "Cortando los clips (unos segundos por clip)…");
      campana = await L.armarClips(actual, leerClipsPedido());
      pintarClipsHechos();
      aviso("#cpClipsAviso", campana.clips.length + " clips listos.", "bien");
    }).catch(error("#cpClipsAviso"));
  };
  $("#cpClipsLista").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-abrir]");
    if (b) L.abrir(actual, b.dataset.abrir);
  });
  $("#cpAbrir").onclick = function () { L.abrir(actual, "Campaña").catch(function () { L.abrir(actual, "."); }); };

  $("#cpGrilla").addEventListener("input", function (ev) {
    var tr = ev.target.closest("tr[data-i]"), k = ev.target.dataset.k;
    if (!tr || !k) return;
    campana.grilla[+tr.dataset.i][k] = ev.target.value;
    tr.className = (campana.grilla[+tr.dataset.i].aprobacion === "Aprobado" ? "aprobada " : "") + (campana.grilla[+tr.dataset.i].checklist === "Subido" ? "subida" : "");
    guardarGrillaPronto();
  });
  $("#cpGrilla").addEventListener("change", function (ev) {
    var tr = ev.target.closest("tr[data-i]"), k = ev.target.dataset.k;
    if (!tr || !k) return;
    if (k === "fecha") { recalcularSemanas(); pintarGrilla(); }
    guardarGrillaPronto();
  });
  $("#cpGrilla").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-borrar]");
    if (!b || !confirm("¿Sacar esa pieza del calendario?")) return;
    campana.grilla.splice(+b.dataset.borrar, 1);
    recalcularSemanas(); pintarGrilla(); guardarGrillaPronto();
  });
  $("#cpAgregar").onclick = function () {
    if (!campana) return;
    if (!campana.grilla) campana.grilla = [];
    var ultima = campana.grilla[campana.grilla.length - 1];
    campana.grilla.push({ id: "p" + Date.now().toString(36), semana: ultima ? ultima.semana : 1, fecha: ultima ? ultima.fecha : ($("#cpFecha").value || ""), hora: $("#cpHora").value,
      red: "TikTok", formato: "Clip 9:16", pilar: "Comunidad", objetivo: "", indicaciones: "", copy: "", archivo: "", link: "", aprobacion: "Pendiente", checklist: "Por armar" });
    recalcularSemanas(); pintarGrilla(); guardarGrillaPronto();
    $("#cpGrilla").scrollTop = $("#cpGrilla").scrollHeight;
  };

  $("#cpLic").onclick = function () {
    conBoton(this, async function () {
      var r = await L.licencias(actual);
      $("#cpLicLista").innerHTML = '<table><tr><th>Origen</th><th>Sonidos</th><th>Qué hacer</th></tr>' + Object.keys(r.grupos).map(function (g) {
        var x = r.grupos[g];
        return "<tr><td><b>" + esc(g) + "</b></td><td>" + esc(x.samples.join(", ")) + '</td><td class="' + (x.origen === "fl" ? "ok" : "mal") + '">' + esc(x.aviso) + "</td></tr>";
      }).join("") + "</table>";
    }).catch(error("#cpPlanAviso"));
  };

  /* ---------------- MÉTRICAS ---------------- */

  function semana(iso) {
    var d = new Date(iso + "T12:00:00"), dia = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dia);
    return d.toISOString().slice(0, 10);   // lunes de esa semana
  }

  function pintarTablero(m) {
    if (!m.entradas.length) { $("#mtTablero").innerHTML = "Todavía no hay números."; $("#mtTablero").className = "vacio"; return; }
    $("#mtTablero").className = "";
    var semanas = {}, series = {};
    m.entradas.forEach(function (e) {
      var s = semana(e.fecha), clave = e.red + " · " + (e.cancion ? e.cancion + " · " : "") + e.metrica;
      semanas[s] = 1;
      var serie = series[clave] = series[clave] || { acumulado: e.fuente === "API", porSemana: {} };
      // Lo que viene de la API de YouTube es un contador total: se toma el último.
      // Lo que se carga a mano o por CSV son números del día: se suman en la semana.
      var v = serie.porSemana[s];
      serie.porSemana[s] = serie.acumulado ? Math.max(v || 0, e.valor) : (v || 0) + e.valor;
    });
    var cols = Object.keys(semanas).sort().slice(-8);
    var h = "<table><tr><th>Red · canción · métrica</th>" + cols.map(function (c) { return "<th>" + esc(c.slice(8, 10) + "/" + c.slice(5, 7)) + "</th>"; }).join("") + "</tr>";
    Object.keys(series).sort().forEach(function (k) {
      var s = series[k];
      h += "<tr><td>" + esc(k) + (s.acumulado ? ' <span class="aviso">(total)</span>' : "") + "</td>" + cols.map(function (c) {
        var v = s.porSemana[c];
        return '<td class="n">' + (v == null ? "" : v.toLocaleString("es-AR")) + "</td>";
      }).join("") + "</tr>";
    });
    h += "</table><div class='aviso'>Columnas: semanas que empiezan ese lunes. Últimas cargas:</div>";
    var ult = m.entradas.map(function (e, i) { return [e, i]; }).slice(-12).reverse();
    h += "<table>" + ult.map(function (x) {
      var e = x[0];
      return "<tr><td>" + esc(e.fecha) + "</td><td>" + esc(e.red) + "</td><td>" + esc(e.cancion || "") + "</td><td>" + esc(e.metrica) +
        '</td><td class="n">' + esc(e.valor.toLocaleString("es-AR")) + "</td><td>" + esc(e.fuente || "a mano") +
        '</td><td><button class="b" data-borrar="' + x[1] + '">Borrar</button></td></tr>';
    }).join("") + "</table>";
    $("#mtTablero").innerHTML = h;
  }

  async function pintarMetricas() {
    var m = await L.metricas();
    $("#mtHayClave").textContent = (await L.hayClaveYoutube()) ? "guardada" : "falta";
    if (!$("#mtVideos").value) $("#mtVideos").value = (m.videos || []).map(function (v) { return "https://youtu.be/" + v; }).join(", ");
    var c = cancion();
    if (c && !$("#mtCancion").value) $("#mtCancion").value = c.titulo;
    pintarTablero(m);
  }

  $("#mtClaveGuardar").onclick = function () {
    var v = $("#mtClave").value;
    conBoton(this, async function () {
      var hay = await L.claveYoutube(v);
      $("#mtClave").value = "";
      $("#mtHayClave").textContent = hay ? "guardada" : "falta";
    }).catch(error("#mtTablero"));
  };
  $("#mtVideosGuardar").onclick = function () {
    conBoton(this, async function () { pintarTablero(await L.videosYoutube($("#mtVideos").value)); }).catch(error("#mtTablero"));
  };
  $("#mtYoutube").onclick = function () {
    conBoton(this, async function () {
      await L.videosYoutube($("#mtVideos").value);
      pintarTablero(await L.actualizarYoutube());
    }).catch(error("#mtTablero"));
  };
  $("#mtAgregar").onclick = function () {
    conBoton(this, async function () {
      pintarTablero(await L.agregarMetrica({ red: $("#mtRed").value, cancion: $("#mtCancion").value.trim(),
        metrica: $("#mtMetrica").value.trim().toLowerCase(), valor: $("#mtValor").value.replace(/\./g, "").replace(",", ".") }));
      $("#mtValor").value = "";
    }).catch(error("#mtTablero"));
  };
  $("#mtCsv").onclick = function () {
    conBoton(this, async function () { pintarTablero(await L.importarCsv($("#mtRed").value)); }).catch(error("#mtTablero"));
  };
  $("#mtTablero").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-borrar]");
    if (b && confirm("¿Borrar esa carga?")) L.borrarMetrica(+b.dataset.borrar).then(pintarTablero).catch(error("#mtTablero"));
  });

  /* ---------------- arranque ---------------- */
  cargarCanciones().catch(error("#lzCancionAviso"));
})();
