// Estudio — el movimiento.
//
// Sólo efectos visuales: no toca datos ni el disco. Si algo de acá fallara, la
// app sigue funcionando igual (estudio.js y lanzamiento.js no dependen de esto).
//   - anillo 3D de texto gigante detrás de todo, que gira y acelera con el scroll
//   - scroll suave con inercia en el escenario
//   - portada con el título de cada sección, letra por letra
//   - tarjetas que suben cuando entran en pantalla
//   - la pastilla de secciones con una bola rosa que se desliza
//   - cursor propio (anillo + punto) que crece sobre lo que se puede tocar
//   - botones principales "imantados" al cursor
// Con "reducir movimiento" en Windows, todo queda quieto.

(function () {
  "use strict";
  var quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var main = document.querySelector("main");
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  var SECCIONES = {
    componer: ["01", "Componer", "La app arma la canción entera y se la manda a FL Studio. Vos elegís el estilo y la escuchás."],
    ref: ["01", "Referencias", "Canciones que te gustan, medidas en tu compu: tempo, groove, acordes y energía."],
    tocar: ["01", "Tocar", "Escuchala, probá otra vuelta y mandala a FL por loopMIDI."],
    plugins: ["01", "Plugins", "Lo que tenés instalado, para elegir con qué suena cada pista."],
    samples: ["01", "Samples", "Tus carpetas de sonidos, contadas por tipo."],
    mezcla: ["02", "Mezcla", "Exportá el WAV de FL y medilo acá. Cuando llegue a −14 LUFS y −1 dBTP, queda el master."],
    videoclip: ["03", "Videoclip", "Tu estudio en Blender, con la canción en las pantallas. Cuatro pasos y se hace solo."],
    campana: ["04", "Campaña", "Tapa, clips y el plan de salida post por post. Vos aprobás; el Estudio no publica nada solo."],
    metricas: ["05", "Métricas", "Cómo le va a cada lanzamiento, semana a semana."],
  };

  /* ---------------- anillo de texto 3D ---------------- */
  var anillo = document.createElement("div");
  anillo.id = "anillo";
  anillo.innerHTML = '<div class="rueda"></div>';
  document.body.prepend(anillo);
  var rueda = anillo.firstChild, angulo = 0, velocidad = 0, inclinacion = -8;

  function armarAnillo(texto) {
    var copias = 8, radio = Math.max(window.innerWidth * 0.55, 700);
    rueda.innerHTML = "";
    for (var i = 0; i < copias; i++) {
      var s = document.createElement("span");
      s.textContent = texto + " ✦ ";
      if (i % 2) s.className = "lleno";
      s.style.transform = "translate(-50%,-50%) rotateY(" + (i * 360 / copias) + "deg) translateZ(" + radio + "px)";
      rueda.appendChild(s);
    }
  }
  function cambiarAnillo(texto) {
    anillo.classList.add("cambia");
    setTimeout(function () { armarAnillo(texto); anillo.classList.remove("cambia"); }, 450);
  }
  armarAnillo("Estudio Nook");

  /* ---------------- scroll suave ---------------- */
  var objetivo = 0, actual = 0, ultimoAlto = 0;
  function puedeScrollear(el, dy) {
    // Las listas con su propio scroll (y los textarea) se mueven solas, como siempre.
    for (; el && el !== main; el = el.parentElement) {
      var st = getComputedStyle(el);
      if ((st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
      }
      if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
    }
    return false;
  }
  if (!quieto && main) {
    main.addEventListener("wheel", function (e) {
      if (e.ctrlKey || puedeScrollear(e.target, e.deltaY)) return;
      e.preventDefault();
      var paso = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      objetivo = Math.max(0, Math.min(main.scrollHeight - main.clientHeight, objetivo + paso));
    }, { passive: false });
    // Si algo mueve el scroll por su cuenta (teclado, foco, cambio de hoja), se adopta.
    main.addEventListener("scroll", function () {
      if (Math.abs(main.scrollTop - actual) > 2) { objetivo = actual = main.scrollTop; }
    });
  }

  /* ---------------- pastilla con bola ---------------- */
  var pastilla = document.querySelector("nav.secciones");
  var bola = document.createElement("i");
  bola.className = "bola";
  pastilla.prepend(bola);
  pastilla.querySelectorAll("button").forEach(function (b) {
    var s = SECCIONES[b.dataset.s];
    if (s) b.innerHTML = '<span class="num">' + s[0] + "</span>" + b.textContent;
  });
  function moverBola() {
    var on = pastilla.querySelector("button.on");
    if (!on) return;
    bola.style.left = on.offsetLeft + "px";
    bola.style.width = on.offsetWidth + "px";
  }

  /* ---------------- portada de cada hoja ---------------- */
  function portada(hoja, clave) {
    var s = SECCIONES[clave];
    if (!s) return;
    var vieja = hoja.querySelector(".portada");
    if (vieja) vieja.remove();
    var p = document.createElement("div");
    p.className = "portada";
    var letras = s[1].split("").map(function (c, i) {
      return '<span class="letra" style="animation-delay:' + (0.05 + i * 0.035) + 's">' + (c === " " ? "&nbsp;" : c) + "</span>";
    }).join("");
    p.innerHTML = '<div class="n">' + s[0] + '</div><h2><span class="linea">' + letras + "</span></h2><p>" + s[2] + "</p>";
    hoja.prepend(p);
  }

  /* ---------------- tarjetas que suben ---------------- */
  var mira = "IntersectionObserver" in window && !quieto ? new IntersectionObserver(function (entradas) {
    entradas.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.remove("oculta"); mira.unobserve(en.target); }
    });
  }, { root: main, threshold: 0.08 }) : null;
  function prepararTarjetas(hoja) {
    if (!mira) return;
    hoja.querySelectorAll(".caja").forEach(function (c, i) {
      c.classList.add("oculta");
      c.style.transitionDelay = Math.min(i, 6) * 0.07 + "s";
      mira.observe(c);
    });
  }
  // Las tarjetas que las secciones agregan después (listas, mediciones) también suben.
  new MutationObserver(function (cambios) {
    cambios.forEach(function (c) {
      c.addedNodes.forEach(function (n) {
        if (n.nodeType === 1 && n.classList && n.classList.contains("caja") && mira) { n.classList.add("oculta"); mira.observe(n); }
      });
    });
  }).observe(main, { childList: true, subtree: true });

  function alCambiarHoja() {
    var hoja = document.querySelector(".hoja.on");
    if (!hoja) return;
    var clave = hoja.id.replace(/^h-/, "");
    portada(hoja, clave);
    prepararTarjetas(hoja);
    cambiarAnillo((SECCIONES[clave] || ["", "Estudio"])[1]);
    objetivo = actual = 0;
    main.scrollTop = 0;
    requestAnimationFrame(moverBola);
  }
  // estudio.js cambia la clase "on" de las hojas: se mira ese cambio.
  new MutationObserver(function (cambios) {
    if (cambios.some(function (c) { return c.target.classList.contains("hoja") && c.target.classList.contains("on") && c.oldValue && c.oldValue.indexOf("on") < 0; })) alCambiarHoja();
  }).observe(main, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true });

  /* ---------------- cursor propio ---------------- */
  var cursor = null, punto = null, mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
  if (window.matchMedia("(pointer: fine)").matches && !quieto) {
    document.body.classList.add("cursor-propio");
    cursor = document.createElement("div"); cursor.id = "cursor";
    punto = document.createElement("div"); punto.id = "cursor-punto";
    document.body.append(cursor, punto);
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      document.body.style.setProperty("--mx", (mx / innerWidth * 100) + "%");
      document.body.style.setProperty("--my", (my / innerHeight * 100) + "%");
      var t = e.target.closest ? e.target.closest("button:not(:disabled), a, [data-abrir], .post, label.campo") : null;
      var escribir = e.target.closest && e.target.closest("input, textarea, select");
      cursor.classList.toggle("sobre", !!t && !escribir);
      cursor.classList.toggle("texto", !!escribir);
    });
    document.addEventListener("mouseleave", function () { cursor.style.opacity = punto.style.opacity = 0; });
    document.addEventListener("mouseenter", function () { cursor.style.opacity = punto.style.opacity = 1; });
  }

  /* ---------------- botones imantados ---------------- */
  if (!quieto) {
    document.addEventListener("mousemove", function (e) {
      document.querySelectorAll(".hoja.on button.pri").forEach(function (b) {
        var r = b.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        var d = Math.hypot(dx, dy);
        b.style.transform = d < 110 && !b.disabled ? "translate(" + dx * 0.18 + "px," + dy * 0.25 + "px)" : "";
      });
    });
  }

  /* ---------------- barra de avance ---------------- */
  var avance = document.createElement("div");
  avance.id = "avance";
  avance.innerHTML = "<i></i>";
  document.body.append(avance);

  /* ---------------- el reloj de todo ---------------- */
  var antes = performance.now(), scrollAntes = 0;
  function cuadro(ahora) {
    var dt = Math.min(64, ahora - antes) / 16.67;
    antes = ahora;
    if (!quieto && main) {
      actual = lerp(actual, objetivo, 1 - Math.pow(1 - 0.12, dt));
      if (Math.abs(actual - objetivo) < 0.3) actual = objetivo;
      if (Math.abs(main.scrollTop - actual) > 0.5) main.scrollTop = actual;
    }
    // El anillo gira solo y se acelera con la velocidad del scroll.
    var vScroll = (main ? main.scrollTop : 0) - scrollAntes;
    scrollAntes = main ? main.scrollTop : 0;
    velocidad = lerp(velocidad, vScroll * 0.08, 0.08);
    angulo += (0.035 + velocidad) * dt;
    inclinacion = lerp(inclinacion, -8 + Math.max(-10, Math.min(10, velocidad * 6)), 0.06);
    if (!quieto) rueda.style.transform = "rotateX(" + inclinacion + "deg) rotateY(" + (-angulo) + "deg)";
    // Barra de avance.
    if (main) {
      var max = main.scrollHeight - main.clientHeight;
      avance.style.opacity = max > 40 ? 1 : 0;
      avance.firstChild.style.transform = "translateY(" + (max > 0 ? (main.scrollTop / max) * 96 : 0) + "px)";
      if (main.scrollHeight !== ultimoAlto) { ultimoAlto = main.scrollHeight; objetivo = Math.min(objetivo, max); }
    }
    // Cursor con un poco de retraso: el anillo sigue al punto.
    if (cursor) {
      cx = lerp(cx, mx, 1 - Math.pow(1 - 0.2, dt)); cy = lerp(cy, my, 1 - Math.pow(1 - 0.2, dt));
      cursor.style.transform = "translate(" + cx + "px," + cy + "px)";
      punto.style.transform = "translate(" + mx + "px," + my + "px)";
    }
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);

  window.addEventListener("resize", function () { moverBola(); armarAnillo(rueda.firstChild ? rueda.firstChild.textContent.replace(" ✦ ", "") : "Estudio"); });
  // Primera hoja.
  document.querySelector("header h1").innerHTML = 'NO<span class="o">Ø</span>K <span style="font-weight:400;opacity:.6">Estudio</span>';
  requestAnimationFrame(function () { alCambiarHoja(); moverBola(); });
})();
