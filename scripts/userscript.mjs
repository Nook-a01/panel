// Arma el userscript del Panel de Instagram.
//
// Sirve para los tres lados: computadora, iPhone y Android. Es un solo
// archivo y una sola dirección para repartir.
//
// POR QUÉ ES ESTO Y NO UN MARCADOR
// El marcador (javascript:) está muerto: Safari lo corta con un cartel
// que dice "no se admite el uso de JavaScript de este modo" — probado
// con un marcador de 28 caracteres, así que no es cuestión de tamaño.
// La acción de Atajos falla igual. Instagram, además, sirve una política
// de seguridad con lista blanca que bloquea cualquier script de afuera.
//
// Un gestor de userscripts es una extensión de verdad: corre en su
// propio ámbito, fuera del alcance de esa política. Los tres que usamos
// son gratis:
//   · computadora → Violentmonkey (tienda de Chrome)
//   · iPhone      → Userscripts (App Store)
//   · Android     → Violentmonkey en Firefox
//
// POR QUÉ REEMPLAZA A LA EXTENSIÓN PROPIA
// La extensión sin empaquetar necesitaba 5 pasos: bajar el zip,
// descomprimir, entrar a chrome://extensions, prender modo desarrollador
// y cargar la carpeta — que además no se puede mover ni borrar nunca.
// Con Violentmonkey son 2 clics y se actualiza solo. Se sigue armando la
// extensión por si algún día hace falta, pero ya no es el camino
// recomendado.
//
// El código del panel no se copia: se extrae de docs/instagram/index.html
// con el mismo extractor que usa la extensión.

import { readFileSync, writeFileSync } from "node:fs";
import { extraerPanel, reemplazarFuncion, AVISAR_DIRECTO } from "./lib/panel-codegen.mjs";

const ORIGEN = "docs/instagram/index.html";
const SALIDA = "docs/instagram/panel.user.js";
const CONTADOR = "https://wispy-poetry-97f9.hamcqc.workers.dev";
const VERSION = "1.2.0";

const html = readFileSync(ORIGEN, "utf8");
let panel = extraerPanel(html);

/* ── que el panel reporte al contador ───────────────────────────
   En el marcador la dirección va vacía a propósito: desde adentro de
   Instagram el envío no llega nunca. Acá sí llega, porque el fetch
   propio de más abajo lo desvía por GM_xmlhttpRequest, que sale del
   navegador sin pasar por la página. */
const VACIA = "var TELEMETRY_URL='';";
if (!panel.includes(VACIA)) {
  console.error("✗ no encontré 'var TELEMETRY_URL=\"\";' — ¿cambió el panel?");
  process.exit(1);
}
panel = panel.replace(VACIA, `var TELEMETRY_URL=${JSON.stringify(CONTADOR)};var CANAL='us';`);

/* ── y que no abra la pestaña puente ─────────────────────────── */
{
  const r = reemplazarFuncion(panel, "function avisar(){", AVISAR_DIRECTO);
  if (!r) {
    console.error("✗ no pude reemplazar avisar(): ¿cambió el panel?");
    console.error("  Sin esto se abriría una pestaña cada vez, que es lo que se quiso sacar.");
    process.exit(1);
  }
  panel = r;
}

// Control antes de escribir: si lo extraído no compila, mejor enterarse
// acá que con el botón ya instalado y roto en el teléfono.
try { new Function(panel + "\nreturn IGPanelPro;"); }
catch (e) { console.error("✗ lo extraído no es válido: " + e.message); process.exit(1); }

/* ── el encabezado ────────────────────────────────────────────── */
// Las líneas que parecen de más son las que hacen que esto funcione:
//
//   @grant GM_xmlhttpRequest
//     Permite salir al contador sin pasar por la página, así que la
//     política de Instagram no lo alcanza. Es lo que hace que el tablero
//     se llene también desde el celular.
//
//   @grant GM_info
//     No se usa. Está porque declarar CUALQUIER @grant obliga a
//     Tampermonkey y Violentmonkey a correr el script en su ámbito
//     aislado. Sin ningún @grant lo inyectan en la página, y ahí vuelve
//     a regir el bloqueo de Instagram — el mismo que mató al marcador.
//
//   @inject-into content
//     Lo mismo dicho como lo entienden Violentmonkey y el Userscripts de
//     iPhone. Redundante a propósito: son gestores distintos y no quiero
//     depender de que uno solo lo interprete bien.
//
//   @connect
//     Tampermonkey exige declarar a qué dominios se puede salir. Sin
//     esto le pregunta al usuario cada vez.
//
// @downloadURL y @updateURL cierran el otro problema: con el marcador el
// código viajaba adentro y actualizar era rehacer todo a mano. Acá el
// gestor revisa esa dirección cada tanto y se actualiza solo.
const cabecera = `// ==UserScript==
// @name         Panel de Instagram
// @description  Seguidores, historias, sin respuesta, estadísticas y estrategia.
// @namespace    https://nook-a01.github.io/panel/
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @connect      wispy-poetry-97f9.hamcqc.workers.dev
// @inject-into  content
// @version      ${VERSION}
// @downloadURL  https://nook-a01.github.io/panel/instagram/panel.user.js
// @updateURL    https://nook-a01.github.io/panel/instagram/panel.user.js
// ==/UserScript==
`;

const cuerpo = `
(() => {
  "use strict";

  const CONTADOR = ${JSON.stringify(CONTADOR)};

  /* ── el puente con el contador ────────────────────────────────
     El panel manda sus datos con fetch(). Un fetch normal, hecho desde
     acá, seguiría atado al connect-src de Instagram —que no incluye el
     contador— y se bloquearía igual que con el marcador.

     GM_xmlhttpRequest no: la pide el gestor de userscripts desde afuera
     de la página. Así que se declara un 'fetch' propio que desvía SOLO
     lo que va al contador y deja pasar todo lo demás sin tocar. Como el
     panel se define dentro de este alcance, sus llamadas encuentran
     ésta primero y no hubo que cambiarle una línea. */
  const fetchReal = window.fetch.bind(window);
  const pedir = typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest
              : (typeof GM !== "undefined" && GM.xmlHttpRequest) ? GM.xmlHttpRequest
              : null;

  const fetch = (url, opciones) => {
    const dir = typeof url === "string" ? url : (url && url.url) || "";
    if (!dir.startsWith(CONTADOR) || !pedir) return fetchReal(url, opciones);

    const o = opciones || {};
    return new Promise(resolver => {
      const responder = (ok, texto) => resolver({
        ok, status: ok ? 200 : 0,
        json: async () => { try { return JSON.parse(texto); } catch { return {}; } },
        text: async () => texto || "",
      });
      try {
        pedir({
          method: o.method || "GET",
          url: dir,
          headers: o.headers || {},
          data: o.body,
          onload: r => responder(r.status >= 200 && r.status < 300, r.responseText),
          onerror: () => responder(false, ""),
          ontimeout: () => responder(false, ""),
        });
      } catch { responder(false, ""); }
    });
  };

  /* ── el botón flotante ────────────────────────────────────────
     Es lo único que corre solo al entrar a instagram.com. El gestor no
     ofrece un "tocar el ícono para correr" propio, así que se arma acá.
     Sin esto el panel se abriría encima del feed cada vez que abrís
     Instagram — molesto ya la segunda vez. */
  if (document.getElementById("igpp-fab")) return;   // ya está puesto

  let abriendo = false;

  const fab = document.createElement("button");
  fab.id = "igpp-fab";
  fab.setAttribute("aria-label", "Abrir el Panel de Instagram");
  fab.textContent = "◐";
  fab.style.cssText = [
    "position:fixed", "z-index:2147483000",
    "right:14px", "bottom:calc(14px + env(safe-area-inset-bottom))",
    "width:46px", "height:46px",
    "border-radius:50%",
    "background:#000", "border:2px solid #CCFF00", "color:#CCFF00",
    "font-size:20px", "font-family:ui-monospace,monospace",
    "display:flex", "align-items:center", "justify-content:center",
    "box-shadow:0 2px 14px rgba(0,0,0,.45)",
    "opacity:.88", "cursor:pointer",
  ].join(";");

  fab.addEventListener("click", () => {
    const yaEsta = document.getElementById("igpp-root");
    if (yaEsta) { yaEsta.remove(); return; }   // segundo toque: se cierra
    if (abriendo) return;
    abriendo = true;
    Promise.resolve(IGPanelPro()).catch(e => {
      alert("No se pudo abrir el panel: " + (e && e.message ? e.message : e));
    }).finally(() => { abriendo = false; });
  });

  document.documentElement.appendChild(fab);

${panel}
})();
`;

writeFileSync(SALIDA, cabecera + cuerpo);

const kb = (Buffer.byteLength(cabecera) + Buffer.byteLength(cuerpo)) / 1024;
console.log(`✓ userscript armado en ${SALIDA}  (${kb.toFixed(1)} KB)`);
console.log(`   contador: encendido, vía GM_xmlhttpRequest`);
console.log(`   pestaña puente: no abre ninguna`);
