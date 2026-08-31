// Arma el userscript del Panel de Instagram para iPhone.
//
// POR QUÉ EXISTE
// En Safari/iOS, tanto el marcador (javascript:) como la acción de Atajos
// "Ejecutar JavaScript en la página web" dejaron de funcionar contra
// Instagram: verificado a fondo con un usuario real — todos los permisos
// del lado de iOS activados (JavaScript, Automatización remota, Permitir
// ejecutar scripts), reinicio de Safari, reinicio del teléfono, y ningún
// método corrió ni una sola vez, ni siquiera un alert() de una línea.
// La explicación que más encaja: Instagram sirve una política de
// seguridad con lista blanca estricta (CSP con nonce en script-src), y
// las versiones nuevas de WebKit dejaron de darle a los marcadores y a
// Atajos la excepción que sí tienen las extensiones de verdad.
//
// La salida es "Userscripts" (github.com/quoid/userscripts), una
// extensión de Safari gratuita y de código abierto ya publicada en la
// App Store, hecha justo para este problema: correr scripts propios en
// sitios de terceros. Al ser una extensión de verdad —no un truco de
// marcador— corre en el mismo nivel de privilegio que nuestra extensión
// de Chrome, y no lo alcanza la política de Instagram.
//
// A diferencia del bookmarklet, un userscript se activa solo al entrar a
// instagram.com (el gestor no ofrece un "tocar para correr" propio). Por
// eso este archivo NO abre el panel de una: agrega un botón flotante
// chico en la esquina, y el panel recién arranca cuando lo tocás — el
// mismo trato que la extensión de escritorio.
//
// El código del panel tampoco se copia acá: se extrae de
// docs/instagram/index.html con el mismo extractor que usa la extensión.

import { readFileSync, writeFileSync } from "node:fs";
import { extraerPanel } from "./lib/panel-codegen.mjs";

const ORIGEN = "docs/instagram/index.html";
const SALIDA = "docs/instagram/panel.user.js";
const VERSION = "1.1.0";

const html = readFileSync(ORIGEN, "utf8");
const panel = extraerPanel(html);

// Control antes de escribir: si lo extraído no compila, mejor enterarse
// acá que con el botón flotante ya instalado y roto en el teléfono.
try { new Function(panel + "\nreturn IGPanelPro;"); }
catch (e) { console.error("✗ lo extraído no es válido: " + e.message); process.exit(1); }

// El encabezado. @match cubre las dos formas del dominio; el panel ya
// valida el subdominio exacto por su cuenta y avisa si hace falta ir a
// www.instagram.com.
//
// Las dos líneas que parecen de más son las que hacen que esto funcione:
//
//   @grant GM_info
//     No es que necesitemos esa API. Es que Tampermonkey y Violentmonkey
//     (los gestores de Android), cuando un script NO declara ningún
//     @grant, lo inyectan directo en la página — y ahí vuelve a regir la
//     política de seguridad de Instagram, que es exactamente lo que nos
//     bloqueó el marcador y Atajos. Declarar cualquier @grant los obliga
//     a correrlo en su propio ámbito aislado, que es donde sí anda.
//     Se elige GM_info porque los tres gestores lo soportan y no hace
//     nada: es sólo metadatos.
//
//   @inject-into content
//     Lo mismo, dicho de la forma que entienden Violentmonkey y el
//     Userscripts de iPhone. Redundante a propósito: son gestores
//     distintos y no quiero depender de que uno solo interprete bien.
//
// @downloadURL y @updateURL cierran el otro problema: con el marcador y
// con Atajos, el código viajaba adentro y la única forma de actualizar
// era rehacer la instalación a mano. Acá el gestor mira esa dirección
// cada tanto y se actualiza solo.
const cabecera = `// ==UserScript==
// @name         Panel de Instagram
// @description  Seguidores, historias, sin respuesta, estadísticas y estrategia — desde el celular.
// @namespace    https://nook-a01.github.io/panel/
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @run-at       document-idle
// @grant        GM_info
// @inject-into  content
// @version      ${VERSION}
// @downloadURL  https://nook-a01.github.io/panel/instagram/panel.user.js
// @updateURL    https://nook-a01.github.io/panel/instagram/panel.user.js
// ==/UserScript==
`;

const cuerpo = `
(() => {
  "use strict";

  // El botón flotante: lo único que corre solo al entrar a instagram.com.
  // El userscript manager no tiene un "tocar el ícono para correr"
  // propio (ver instrucciones arriba), así que se arma acá. Sin esto,
  // el panel se abriría encima del feed cada vez que abrís Instagram —
  // molesto ya la segunda vez.
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
    "opacity:.88",
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
