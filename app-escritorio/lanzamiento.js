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
    if (seccion === "campana") pintarCampana().catch(error("#cpAvisoMedios"));
  }

  /* ---------------- MEZCLA ---------------- */

  var wavElegido = null;

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
      '<ul style="margin:8px 0 0;padding-left:1.1rem;font-size:.86rem">' + m.consejos.map(function (c) {
        return '<li class="' + (c.ok ? "ok" : "mal") + '">' + esc(c.texto) + "</li>";
      }).join("") + "</ul>";
  }

  function mostrarMedida(titulo, m, ruta) {
    $("#mzMedidaCaja").hidden = false;
    $("#mzMedidaTitulo").textContent = titulo;
    $("#mzMedida").innerHTML = (ruta ? '<small class="ruta">' + esc(ruta) + "</small>" : "") + tablaMedida(m);
  }

  async function pintarMezcla() {
    var e = await L.mezcla(actual);
    var h = "";
    h += "<dl class='dato'><dt>Master WAV</dt><dd>" + (e.wav ? esc(e.wav) : "<span class='mal'>todavía no hay</span>") + "</dd>";
    h += "<dt>Master MP3</dt><dd>" + (e.mp3 ? esc(e.mp3) : "—") + "</dd>";
    if (e.medidas && e.medidas.wav) {
      var w = e.medidas.wav, p = e.medidas.mp3 || {};
      h += "<dt>Última medición</dt><dd>WAV " + esc(w.integrado) + " LUFS / " + esc(w.picoReal) + " dBTP · MP3 " +
        esc(p.integrado) + " LUFS / " + esc(p.picoReal) + " dBTP <span class='aviso'>(" + esc(String(e.medidas.fecha).slice(0, 10)) + ")</span></dd>";
    }
    h += "<dt>Pruebas</dt><dd>" + (e.pruebas.length ? e.pruebas.map(esc).join("<br>") : "—") + "</dd></dl>";
    $("#mzEstado").innerHTML = h;
    $("#mzEstado").className = "";
  }

  $("#mzElegir").onclick = function () {
    var b = this;
    conBoton(b, async function () {
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
      aviso("#mzAviso", "Listo: master WAV y MP3 320 (" + r.mp3.integrado + " LUFS / " + r.mp3.picoReal + " dBTP). Ya podés pasar a Videoclip.", "bien");
      await cargarCanciones();
      pintarMezcla();
    }).catch(error("#mzAviso"));
  };
  $("#mzAbrir").onclick = function () { L.abrir(actual, "."); };

  /* ---------------- VIDEOCLIP ---------------- */

  function ultimaLinea(cola, re) {
    var m = String(cola || "").match(re);
    return m ? m[m.length - 1] : "";
  }

  async function pintarVideoclip() {
    var e = await L.videoclip(actual);
    if (!$("#vcTitulo").value || $("#vcTitulo").dataset.de !== actual) { $("#vcTitulo").value = e.titulo; $("#vcTitulo").dataset.de = actual; }
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
      '<button class="b" data-paso="carteles"' + (!e.audio || corriendo ? " disabled" : "") + ">Rehacer carteles con este título</button>", t.pantallas);
    var detRender = cu.total ? cu.hechos + " de " + cu.total + " cuadros (" + pct + " %)" : "Unos 11.600 cuadros a 60 fps: tarda horas.";
    if (t.render && t.render.corriendo) detRender += " · " + esc(ultimaLinea(t.render.cola, /Saved: '[^']*\\(\d+)\.jpg'/g).replace(/.*\\/, "").replace("'", ""));
    if (e.horizontal) detRender = "Listo: " + esc(e.horizontal.split("\\").pop());
    h += paso(3, "Renderizar el estudio (16:9, YouTube)", !!e.horizontal, detRender,
      '<button class="b pri" data-paso="render"' + (nPant < 4 || corriendo ? " disabled" : "") + ">" + (cu.hechos && !e.horizontal ? "Seguir renderizando" : e.horizontal ? "Rearmar el MP4" : "Renderizar") + "</button>" +
      (e.horizontal ? '<button class="b" data-abrir="Videoclip/' + esc(e.horizontal.split("\\").pop()) + '">Ver</button>' : ""),
      t.render, cu.total && !e.horizontal ? pct : null);
    h += paso(4, "Armar el vertical (9:16, TikTok)", !!e.vertical,
      e.vertical ? "Listo: " + esc(e.vertical.split("\\").pop()) : "Recorta el horizontal siguiendo la acción. Tarda unos minutos.",
      '<button class="b" data-paso="vertical"' + (!e.horizontal || corriendo ? " disabled" : "") + ">Armar</button>" +
      (e.vertical ? '<button class="b" data-abrir="Videoclip/' + esc(e.vertical.split("\\").pop()) + '">Ver</button>' : ""), t.vertical);
    $("#vcPasos").innerHTML = h;
    if (corriendo && seccion === "videoclip") sondeo = setTimeout(pintar, 4000);
  }

  $("#vcPasos").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.abrir) { L.abrir(actual, b.dataset.abrir); return; }
    var paso = b.dataset.paso, o = { titulo: $("#vcTitulo").value.trim() };
    if (paso === "carteles") { paso = "pantallas"; o.rehacer = ["cartel-grande", "cartel-luminoso", "visualizador"]; }
    conBoton(b, async function () {
      aviso("#vcAviso", paso === "analizar" ? "Analizando…" : "Arrancando…");
      await L.pasoVideoclip(actual, paso, o);
      aviso("#vcAviso", paso === "analizar" ? "Audio analizado." : "Corriendo aparte: podés seguir usando el Estudio.", "bien");
      pintarVideoclip();
    }).catch(error("#vcAviso"));
  });

  /* ---------------- CAMPAÑA ---------------- */

  var campana = null, guardarPlanT = 0;

  // Lo que pide una distribuidora y la comparación (de comparativas públicas,
  // octubre 2026; los precios cambian: confirmarlos en la página de cada una).
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

  function pintarDistro() {
    $("#cpDistro").innerHTML = '<table><tr><th>Distribuidora</th><th>Precio</th><th>Comisión</th><th>A tener en cuenta</th></tr>' +
      DISTRIBUIDORAS.map(function (d) { return "<tr>" + d.map(function (x) { return "<td>" + esc(x) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</table><div class='aviso'>Precios de comparativas públicas de octubre de 2026: confirmalos en la página de cada una antes de pagar. " +
      "Para un primer single, CD Baby (pago único, queda para siempre) u ONErpm (gratis, fuerte en la región) son las que menos te atan.</div>" +
      "<h2 style='margin-top:12px'>Lo que te van a pedir</h2><ul style='margin:0;padding-left:1.1rem;font-size:.86rem'>" +
      REQUISITOS.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>";
  }

  function pintarMedios() {
    var h = '<div class="medios">';
    if (campana.tapa) h += '<div class="m"><img src="' + archivoUrl(campana.tapa) + "?" + Date.now() + '" style="width:180px;height:180px;border-radius:6px;display:block"><div class="fila" style="margin-top:6px"><button class="b" data-abrir="Campaña/' + esc(campana.tapa.split("\\").pop()) + '">Abrir tapa</button></div></div>';
    else h += '<div class="m">Sin tapa todavía' + (campana.hayBlend ? "" : " (falta renderizar el videoclip)") + "</div>";
    if (campana.clips.length) campana.clips.forEach(function (c) { h += '<div class="m">🎬 ' + esc(c) + ' <button class="b" data-abrir="Campaña/' + esc(c) + '">Ver</button></div>'; });
    else h += '<div class="m">Sin clips todavía' + (campana.hayVertical ? "" : " (salen del vertical)") + "</div>";
    $("#cpMedios").innerHTML = h + "</div>";
  }

  function pintarPlan() {
    if (!campana.plan) { $("#cpPlanLista").innerHTML = '<div class="vacio">Elegí la fecha de salida y tocá «Armar el plan».</div>'; return; }
    if (campana.estreno) $("#cpFecha").value = campana.estreno;
    var hoy = new Date().toISOString().slice(0, 10);
    $("#cpPlanLista").innerHTML = campana.plan.map(function (p, i) {
      var cuando = p.dias === 0 ? "día de salida" : (p.dias < 0 ? p.dias + " días" : "+" + p.dias + " días");
      return '<div class="post ' + p.estado + '" data-i="' + i + '"><div class="cab"><b>' + esc(p.fecha.split("-").reverse().join("/")) + "</b>" +
        '<span class="aviso" style="margin:0">' + esc(cuando) + (p.fecha < hoy && p.estado !== "publicado" ? " · ya pasó" : "") + "</span>" +
        '<span class="chip">' + esc(p.red) + "</span><span>" + esc(p.tipo) + "</span>" +
        (p.archivo ? '<small class="ruta">' + esc(p.archivo) + "</small>" : "") +
        '<span style="flex:1"></span><span class="estado ' + p.estado + '">' + esc(p.estado) + "</span>" +
        '<button class="b" data-estado="aprobado">Aprobado</button><button class="b" data-estado="publicado">Publicado</button>' +
        '<button class="b" data-estado="borrador">Borrador</button></div>' +
        "<textarea>" + esc(p.texto) + "</textarea></div>";
    }).join("");
  }

  async function pintarCampana() {
    campana = await L.campana(actual);
    pintarMedios();
    pintarPlan();
    pintarDistro();
    if (!$("#cpFecha").value) {
      var d = new Date(); d.setDate(d.getDate() + 28);
      $("#cpFecha").value = d.toISOString().slice(0, 10);
    }
  }

  function guardarPlanPronto() {
    clearTimeout(guardarPlanT);
    guardarPlanT = setTimeout(function () {
      L.guardarCampana(actual, { plan: campana.plan }).catch(error("#cpAvisoMedios"));
    }, 600);
  }
  $("#cpPlanLista").addEventListener("input", function (ev) {
    var post = ev.target.closest(".post");
    if (!post || ev.target.tagName !== "TEXTAREA") return;
    campana.plan[+post.dataset.i].texto = ev.target.value;
    guardarPlanPronto();
  });
  $("#cpPlanLista").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-estado]"), post = ev.target.closest(".post");
    if (!b || !post) return;
    campana.plan[+post.dataset.i].estado = b.dataset.estado;
    L.guardarCampana(actual, { plan: campana.plan }).then(function (c) { campana = c; pintarPlan(); }).catch(error("#cpAvisoMedios"));
  });
  $("#cpMedios").addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-abrir]");
    if (b) L.abrir(actual, b.dataset.abrir);
  });

  $("#cpPlan").onclick = function () {
    if (campana && campana.plan && !confirm("Ya hay un plan. ¿Armar uno nuevo? Se pierden los textos que corregiste.")) return;
    conBoton(this, async function () {
      campana = await L.armarPlan(actual, $("#cpFecha").value);
      pintarPlan();
      aviso("#cpAvisoMedios", "Plan armado: " + campana.plan.length + " pasos. Corregí los textos y aprobalos.", "bien");
    }).catch(error("#cpAvisoMedios"));
  };
  $("#cpIcs").onclick = function () {
    conBoton(this, async function () {
      var r = await L.exportarIcs(actual);
      aviso("#cpAvisoMedios", "Calendario guardado: " + r + ". Abrilo para sumarlo a tu calendario.", "bien");
    }).catch(error("#cpAvisoMedios"));
  };
  $("#cpTapa").onclick = function () {
    conBoton(this, async function () {
      aviso("#cpAvisoMedios", "Blender está sacando la foto de 3000 × 3000 (un minuto, más o menos)…");
      campana = await L.armarTapa(actual, { camara: $("#cpCamara").value, cuadro: +$("#cpCuadro").value || 1200 });
      pintarMedios();
      aviso("#cpAvisoMedios", "Tapa lista.", "bien");
    }).catch(error("#cpAvisoMedios"));
  };
  $("#cpClips").onclick = function () {
    conBoton(this, async function () {
      aviso("#cpAvisoMedios", "Cortando los clips…");
      campana = await L.armarClips(actual);
      pintarMedios();
      aviso("#cpAvisoMedios", "Clips listos.", "bien");
    }).catch(error("#cpAvisoMedios"));
  };
  $("#cpAbrir").onclick = function () { L.abrir(actual, "Campaña").catch(function () { L.abrir(actual, "."); }); };

  $("#cpLic").onclick = function () {
    conBoton(this, async function () {
      var r = await L.licencias(actual);
      var conf = (campana && campana.licencias) || {};
      var grupos = Object.keys(r.grupos);
      $("#cpLicLista").innerHTML = '<div class="aviso">Del proyecto ' + esc(r.flp) + ": " + grupos.length + " orígenes de sonido.</div>" +
        '<table><tr><th>Origen</th><th>Sonidos</th><th>Qué hacer</th><th>Confirmado</th></tr>' + grupos.map(function (g) {
          var x = r.grupos[g], ok = x.origen === "fl" || conf[g];
          return "<tr><td><b>" + esc(g) + "</b></td><td>" + esc(x.samples.join(", ")) + '</td><td class="' + (ok ? "ok" : "mal") + '">' + esc(x.aviso) +
            "</td><td>" + (x.origen === "fl" ? "—" : '<input type="checkbox" data-lic="' + esc(g) + '"' + (conf[g] ? " checked" : "") + ">") + "</td></tr>";
        }).join("") + "</table>" +
        '<div class="aviso">Plugins: ' + esc(r.plugins.join(", ")) + ". Los de FL (FLEX, Sampler, Fruity…) se pueden usar libremente.</div>";
    }).catch(error("#cpAvisoMedios"));
  };
  $("#cpLicLista").addEventListener("change", function (ev) {
    var c = ev.target.closest("[data-lic]");
    if (!c) return;
    var lic = Object.assign({}, campana.licencias || {});
    if (c.checked) lic[c.dataset.lic] = new Date().toISOString().slice(0, 10); else delete lic[c.dataset.lic];
    L.guardarCampana(actual, { licencias: lic }).then(function (x) { campana = x; }).catch(error("#cpAvisoMedios"));
  });

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
