// Arma el panel.js que usa el programa de escritorio.
//
// Es el MISMO código del panel que la extensión y el userscript: se extrae de
// docs/instagram/index.html con el mismo extractor, así los tres caminos no se
// desincronizan nunca. (Ya pasó una vez: el zip publicado quedó tres arreglos
// atrás del código fuente porque se armaba a mano.)
//
// DIFERENCIA CON EL USERSCRIPT
// El userscript necesita GM_xmlhttpRequest para esquivar la política de
// seguridad de Instagram al mandar el conteo de uso. Acá no hace falta: el
// programa quita esa política de su propia ventana, así que `fetch` a secas
// funciona y el código queda más simple.

import { readFileSync, writeFileSync } from "node:fs";
import { extraerPanel } from "./lib/panel-codegen.mjs";

const ORIGEN = "docs/instagram/index.html";
const SALIDA = "app-escritorio/panel.js";
const VERSION = "1.3.0";

const panel = extraerPanel(readFileSync(ORIGEN, "utf8"));

const codigo = `// GENERADO por scripts/escritorio.mjs — no editar a mano.
// El original vive en ${ORIGEN}. Versión ${VERSION}.
(() => {
  "use strict";

  // Cada navegación de Instagram vuelve a ejecutar esto. Si el botón ya está,
  // no se duplica.
  if (document.getElementById("igpp-fab")) return;

  let abriendo = false;

  const fab = document.createElement("button");
  fab.id = "igpp-fab";
  fab.setAttribute("aria-label", "Abrir el Panel de Instagram");
  fab.textContent = "◐";
  fab.style.cssText = [
    "position:fixed", "z-index:2147483000",
    "right:14px", "bottom:14px",
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

writeFileSync(SALIDA, codigo);
console.log(`✓ panel del programa armado en ${SALIDA}  (${(Buffer.byteLength(codigo)/1024).toFixed(1)} KB)`);
