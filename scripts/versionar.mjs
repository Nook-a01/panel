// Le pone un número de versión a cada hoja de estilo y script del Panel.
//
// Sin esto, el navegador guarda los .css y .js hasta diez minutos
// (GitHub Pages los marca así) y después de publicar seguís viendo la
// versión anterior aunque el servidor ya tenga la nueva. Con la versión
// en la URL, cada publicación estrena archivos.
//
// Se ejecuta solo antes de cada commit de datos y en el workflow.

import { readFileSync, writeFileSync } from "node:fs";

const SW = "docs/sw.js";

// La versión sale del contador que ya lleva el service worker.
const sw = readFileSync(SW, "utf8");
const version = (sw.match(/panel-v(\d+)/) || [])[1];
if (!version) { console.error("✗ no encontré la versión en sw.js"); process.exit(1); }

// Las páginas que cargan sus estilos y scripts por separado. Plata,
// Instagram y Campamento son un archivo único cada una: no tienen nada
// que sellar.
const PAGINAS = ["docs/index.html", "docs/deportes/index.html"];
const MODULOS = ["docs/deportes/app.js", "docs/deportes/api.js", "docs/deportes/fx.js"];

let total = 0;

for (const pagina of PAGINAS) {
  let html;
  try { html = readFileSync(pagina, "utf8"); } catch { continue; }

  // Sella sólo los archivos propios: los de Google Fonts llevan dominio
  // y no entran en esta expresión, y el manifest no se cachea así.
  const nuevo = html.replace(
    /(href|src)="((?:[\w-]+)\.(?:css|js))(\?v=\d+)?"/g,
    (m, attr, archivo) => `${attr}="${archivo}?v=${version}"`
  );

  if (nuevo !== html) writeFileSync(pagina, nuevo);
  const sellados = [...nuevo.matchAll(/[\w-]+\.(?:css|js)\?v=\d+/g)].map(m => m[0]);
  total += sellados.length;
  console.log(`${pagina}: ${sellados.length} archivo(s)`);
  for (const s of sellados) console.log("    " + s);
}

// app.js importa api.js y f1-datos.js como módulos. Esas rutas también
// tienen que llevar versión: si no, el navegador sirve las viejas aunque
// app.js sea nuevo.
for (const archivo of MODULOS) {
  let js;
  try { js = readFileSync(archivo, "utf8"); } catch { continue; }
  const antes = js;
  js = js.replace(
    /from\s+"\.\/([\w-]+)\.js(\?v=\d+)?"/g,
    (m, mod) => `from "./${mod}.js?v=${version}"`
  );
  if (js !== antes) {
    writeFileSync(archivo, js);
    const n = [...js.matchAll(/from "\.\/[\w-]+\.js\?v=\d+"/g)].length;
    console.log(`${archivo}: ${n} import(s) sellados`);
  }
}

console.log(`\nversión ${version} aplicada a ${total} archivo(s) enlazados.`);
