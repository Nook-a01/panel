// Arma el marcador del Panel de Instagram para el asistente del celular.
//
// Sale a docs/instagram/marcador.txt: una sola línea con el texto que se
// pega como dirección del marcador (javascript:…). El asistente
// (celular.html) lo baja al abrir la página y lo copia al tocar el botón.
//
// Es exactamente lo mismo que arma docs/instagram/index.html en el
// navegador para su botón "Código para marcador": la función IGPanelPro
// sin comentarios de línea completa ni sangría. Se genera acá en vez de en
// el navegador porque el asistente es otra página y no tiene el panel.
//
// Hay que volver a correrlo cada vez que cambia el panel:
//   npm run marcador

import { readFileSync, writeFileSync } from "node:fs";
import { extraerPanel } from "./lib/panel-codegen.mjs";

const ORIGEN = "docs/instagram/index.html";
const SALIDA = "docs/instagram/marcador.txt";

const panel = extraerPanel(readFileSync(ORIGEN, "utf8"));

const crudo = "(" + panel + ")();";
let code = crudo
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\n[ \t]+/g, "\n")
  .replace(/\n{2,}/g, "\n");

// Misma red de seguridad que index.html: si el achicado rompiera algo,
// se usa el original.
try { new Function(code); } catch (e) {
  console.warn("! el código achicado no compila, se usa el original:", e.message);
  code = crudo;
}
new Function(code);   // si el original tampoco compila, que corte acá

const marcador = "javascript:" + encodeURIComponent(code);
writeFileSync(SALIDA, marcador);
console.log(`✓ ${SALIDA} — ${(marcador.length / 1024).toFixed(0)} KB`);
