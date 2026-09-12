// ==UserScript==
// @name         Lector de Mercado Pago — Panel de plata
// @namespace    https://nook-a01.github.io/panel/
// @description  Lee tu saldo y tus movimientos desde tu propia sesión de Mercado Pago y los guarda en tu panel privado.
// @version      1.1.0
// @match        https://www.mercadopago.com.ar/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      plata.hamcqc.workers.dev
// @downloadURL  https://nook-a01.github.io/panel/plata/lector-mp.user.js
// @updateURL    https://nook-a01.github.io/panel/plata/lector-mp.user.js
// ==/UserScript==

// QUÉ HACE
// Corre dentro de mercadopago.com.ar con la sesión que vos ya tenés abierta, lee
// de la página tu saldo y tus movimientos, y los manda al Worker para que puedas
// verlos desde el celular.
//
// POR QUÉ NO USA LA API DE MERCADO PAGO
// Se probaron seis endpoints el 11/9/2026. Los movimientos de cuenta dan 404 y
// el saldo da 403: esa API está hecha para comercios que cobran, no para leer
// tus finanzas. La web sí muestra todo, así que se lee de ahí.
//
// DE DÓNDE SALE CADA DATO (verificado contra la página real)
//   id      → último tramo de  href="/banking/balance/movements/B33A2FG3HTPV8MEG4"
//   monto   → aria-label="-20000 pesos argentinos"   ← el signo viene acá
//   fecha   → <time datetime="2026-09-11">           ← ISO, lo más estable que hay
//   detalle → title="Nombre de quien cobra o paga"
//   tipo    → title="Transferencia enviada"
//   saldo   → primer importe que NO está dentro de un <li>
//
// Se usan atributos semánticos (datetime, title, aria-label) en vez de nombres
// de clases CSS, que Mercado Pago cambia en cada despliegue.
//
// QUÉ NO HACE
// No guarda tu contraseña, no usa tokens y no modifica nada de tu cuenta.

(function () {
  "use strict";

  const WORKER = "https://plata.hamcqc.workers.dev";
  const CLAVE_GUARDADA = "clave_panel_plata";

  // ------------------------------------------------------------------------
  // Lectura
  // ------------------------------------------------------------------------

  // "-20000 pesos argentinos con 50 centavos" → -20000.50
  function importeDesdeTexto(txt) {
    if (!txt) return null;
    const m = String(txt).match(
      /(-|\+)?\s*([\d.]+)\s*pesos(?:\s+argentinos)?(?:\s+con\s+(\d+)\s+centavos)?/i
    );
    if (!m) return null;
    const entero = Number(String(m[2]).replace(/\./g, ""));
    if (!Number.isFinite(entero)) return null;
    const centavos = m[3] ? Number(m[3]) / 100 : 0;
    return (m[1] === "-" ? -1 : 1) * (entero + centavos);
  }

  function importeDe(el) {
    for (const c of el.querySelectorAll('[aria-label*="pesos"], img[alt*="pesos"]')) {
      const v = importeDesdeTexto(c.getAttribute("aria-label") || c.getAttribute("alt"));
      if (v !== null) return v;
    }
    return null;
  }

  // La página tiene DOS <main>: el primero es el menú de perfil y está vacío.
  // Se elige el que realmente contiene importes.
  function contenido() {
    const mains = [...document.querySelectorAll("main")];
    return mains.filter(m => m.querySelectorAll('[aria-label*="pesos"]').length).pop() || document.body;
  }

  function leerMovimientos() {
    const enlaces = document.querySelectorAll(
      'a[href*="/banking/balance/movements/"], a[href*="/activities/detail/"]'
    );
    const porId = new Map();

    enlaces.forEach(a => {
      const id = (a.getAttribute("href") || "").split("/").filter(Boolean).pop();
      if (!id || id.length < 6) return;

      // El importe y la fecha son hermanos del enlace, no hijos: hay que subir al <li>.
      const caja = a.closest("li") || a.parentElement || a;

      const monto = importeDe(caja);
      if (monto === null) return;

      // La fecha viene en formato ISO dentro de <time datetime="...">
      const time = caja.querySelector("time[datetime]");
      const fecha = time ? String(time.getAttribute("datetime")).slice(0, 10) : null;
      if (!fecha) return;

      // Los textos descriptivos están en title=, no en el contenido visible.
      const titulos = [...caja.querySelectorAll("[title]")]
        .map(e => e.getAttribute("title"))
        .filter(t => t && !/pesos|^\d{2}:\d{2}$/i.test(t));

      const tipo = titulos.find(t =>
        /transferencia|dinero|pago|cobro|retiro|recarga|devoluci|ingreso|compra|débito|credito|crédito/i.test(t)
      ) || "";
      const detalle = titulos.find(t => t !== tipo) || tipo || "Movimiento";

      if (!porId.has(id)) {
        porId.set(id, {
          id,
          fecha,
          detalle,
          monto: Math.abs(monto),
          tipo: monto < 0 ? "gasto" : "ingreso",
          descripcionTipo: tipo,
          // Mover plata a una reserva no es gastar. Se marca acá, mirando TODOS
          // los textos de la fila y no sólo el que quedó como tipo: según el
          // orden del HTML, ese podría ser "Dinero disponible" y se escaparía.
          esReserva: titulos.some(t => /reservad/i.test(t)),
          origen: "lector-mp",
        });
      }
    });

    return [...porId.values()];
  }

  // El saldo y el resumen del mes son los únicos importes fuera de las listas.
  function leerFueraDeListas() {
    return [...contenido().querySelectorAll('[aria-label*="pesos"]')]
      .filter(e => !e.closest("li"))
      .map(e => ({ texto: e.getAttribute("aria-label"), valor: importeDesdeTexto(e.getAttribute("aria-label")) }))
      .filter(x => x.valor !== null);
  }

  function leerSaldo() {
    // El saldo no lleva signo; entradas y salidas sí. El primero sin signo es el saldo.
    const sueltos = leerFueraDeListas();
    const sinSigno = sueltos.find(x => !/^[+-]/.test(String(x.texto).trim()));
    return sinSigno ? sinSigno.valor : null;
  }

  // Las reservas son plata tuya que Mercado Pago aparta, cada una con el nombre
  // que le hayas puesto. NO están en el saldo disponible: si no se suman, el
  // panel te muestra de menos y encima parece que gastaste lo que guardaste.
  //
  // Se leen sólo en la pantalla de Inicio, que es la única donde figuran. Se
  // toman todos los importes sin signo de la página y se descartan los de la
  // tarjeta del saldo y los de Créditos, que se reconocen por su propio texto.
  // Lo que queda son las reservas, cada una con su nombre.
  function leerReservas() {
    let total = 0;
    for (const el of contenido().querySelectorAll('[aria-label*="pesos"]')) {
      if (el.closest("li")) continue;
      const texto = el.getAttribute("aria-label");
      if (/^[+-]/.test(String(texto).trim())) continue;
      const valor = importeDesdeTexto(texto);
      if (valor === null) continue;
      const caja = el.closest("section,article") || el.parentElement;
      const alrededor = ((caja && caja.innerText) || "").replace(/\s+/g, " ");
      if (/Transferir|Ir a Tu dinero|Cr[ée]ditos|Consultar l[íi]mite/i.test(alrededor)) continue;
      total += valor;
    }
    return total;
  }

  const enInicio = () => /\/home/.test(location.pathname);

  function leerAnalisisDelMes() {
    const sueltos = leerFueraDeListas();
    const entrada = sueltos.find(x => /^\+/.test(String(x.texto).trim()));
    const salida = sueltos.find(x => /^-/.test(String(x.texto).trim()));
    if (!entrada && !salida) return null;
    return {
      entradas: entrada ? Math.abs(entrada.valor) : null,
      salidas: salida ? Math.abs(salida.valor) : null,
    };
  }

  function leerCategorias() {
    const cats = [];
    document.querySelectorAll('a[href*="/finance/spending-tracking/detail/"]').forEach(a => {
      const caja = a.closest("li") || a.parentElement || a;
      const monto = importeDe(caja);
      if (monto === null) return;
      const texto = caja.textContent || "";
      // El porcentaje se saca del enlace (…&percentage=47), no del texto: ahí los
      // números quedan pegados al monto ("$578.670" + "47%") y se leía 67047%.
      const pct = (a.getAttribute("href").match(/[?&]percentage=(\d+)/) || [])[1];
      const nombre = ([...caja.querySelectorAll("[title]")]
        .map(e => e.getAttribute("title"))
        .find(t => t && !/pesos|%/i.test(t))) ||
        (texto.split(/\$|\d/)[0] || "").trim() || "Categoría";
      cats.push({ nombre, monto: Math.abs(monto), porcentaje: pct ? Number(pct) : null });
    });
    return cats.length ? cats : null;
  }

  // ------------------------------------------------------------------------
  // Envío
  // ------------------------------------------------------------------------

  function pedirClave() {
    let clave = GM_getValue(CLAVE_GUARDADA, "");
    if (!clave) {
      clave = prompt(
        "Panel de plata\n\n" +
        "Escribí una vez la clave de tu panel.\n" +
        "Queda guardada en este navegador y no se manda a ningún otro lado."
      );
      if (clave) GM_setValue(CLAVE_GUARDADA, clave.trim());
    }
    return clave ? clave.trim() : "";
  }

  function enviar(datos, clave) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: WORKER + "/guardar",
        headers: { "content-type": "application/json", authorization: "Bearer " + clave },
        data: JSON.stringify(datos),
        timeout: 20000,
        onload: r => {
          try { resolve({ status: r.status, cuerpo: JSON.parse(r.responseText) }); }
          catch { resolve({ status: r.status, cuerpo: r.responseText }); }
        },
        onerror: () => reject(new Error("no se pudo conectar con el panel")),
        ontimeout: () => reject(new Error("el panel tardó demasiado")),
      });
    });
  }

  // ------------------------------------------------------------------------
  // Interfaz
  // ------------------------------------------------------------------------

  function avisar(texto, color) {
    let caja = document.getElementById("plata-aviso");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "plata-aviso";
      caja.style.cssText =
        "position:fixed;right:18px;bottom:76px;z-index:2147483647;max-width:300px;" +
        "padding:12px 14px;border-radius:10px;font:600 13px/1.45 system-ui,sans-serif;" +
        "color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.28);white-space:pre-line";
      document.body.appendChild(caja);
    }
    caja.style.background = color || "#2d3748";
    caja.textContent = texto;
    clearTimeout(caja._t);
    caja._t = setTimeout(() => caja.remove(), 8000);
  }

  async function leerYEnviar(silencioso) {
    const movimientos = leerMovimientos();

    // El saldo completo sólo se puede armar en Inicio, porque es la única
    // pantalla que muestra las reservas. Desde las otras se manda null a
    // propósito: el panel conserva el último saldo bueno en vez de pisarlo
    // con el disponible solo, que es justamente el número que estaba mal.
    const disponible = leerSaldo();
    const reservas = enInicio() ? leerReservas() : null;
    const saldo = (enInicio() && disponible !== null) ? disponible + reservas : null;

    if (!movimientos.length && saldo === null) {
      if (!silencioso) {
        avisar("No encontré nada para leer acá.\n\nProbá en «Tu dinero» o en «Actividad».", "#b7791f");
      }
      return;
    }

    const clave = pedirClave();
    if (!clave) return;

    const datos = {
      leidoEn: new Date().toISOString(),
      saldo,
      movimientos,
      mes: leerAnalisisDelMes(),
      categorias: leerCategorias(),
    };

    try {
      const r = await enviar(datos, clave);
      if (r.status === 401) {
        GM_setValue(CLAVE_GUARDADA, "");
        avisar("La clave no es correcta.\nTocá el botón de nuevo para reescribirla.", "#c53030");
        return;
      }
      if (r.status !== 200) {
        avisar("El panel rechazó los datos.\n" + ((r.cuerpo && r.cuerpo.error) || r.status), "#c53030");
        return;
      }
      const c = r.cuerpo || {};
      const peso = n => "$" + Number(n).toLocaleString("es-AR");
      avisar(
        "✅ Panel actualizado\n" +
        (c.nuevos ? c.nuevos + " nuevo" + (c.nuevos === 1 ? "" : "s") : "sin movimientos nuevos") +
        " · " + (c.total || 0) + " en total" +
        // Se muestra el desglose y no sólo el total: si algún día Mercado Pago
        // cambia la pantalla y las reservas dejan de leerse, se ve acá al toque
        // en vez de aparecer como un saldo misteriosamente más chico.
        (saldo != null
          ? "\nSaldo: " + peso(saldo) +
            "\n(disponible " + peso(disponible) + " + reservas " + peso(reservas) + ")"
          : "\nSaldo: se lee desde Inicio"),
        "#276749"
      );
    } catch (e) {
      avisar("No se pudo conectar con el panel.\n" + e.message, "#c53030");
    }
  }

  function ponerBoton() {
    if (document.getElementById("plata-boton")) return;
    const b = document.createElement("button");
    b.id = "plata-boton";
    b.textContent = "💰 Actualizar panel";
    b.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:11px 16px;" +
      "border:0;border-radius:999px;background:#00a650;color:#fff;cursor:pointer;" +
      "font:700 13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,166,80,.42)";
    b.onclick = () => leerYEnviar(false);
    document.body.appendChild(b);
  }

  // Inicio entra en la lista porque es la única pantalla donde se ven las
  // reservas, y sin ellas el saldo queda incompleto.
  const paginaConDatos = () => /\/(home|banking\/balance|activities)/.test(location.pathname);

  function arrancar() {
    if (!paginaConDatos()) {
      const b = document.getElementById("plata-boton");
      if (b) b.remove();
      return;
    }
    ponerBoton();
    if (!window.__plataYaLeyo) {
      window.__plataYaLeyo = true;
      setTimeout(() => leerYEnviar(true), 2500);
    }
  }

  // Mercado Pago cambia de sección sin recargar la página.
  let ultimaRuta = location.pathname;
  setInterval(() => {
    if (location.pathname !== ultimaRuta) {
      ultimaRuta = location.pathname;
      window.__plataYaLeyo = false;
      setTimeout(arrancar, 1500);
    }
  }, 1000);

  arrancar();
})();
