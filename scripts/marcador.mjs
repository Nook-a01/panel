// Arma los favoritos del Panel de Instagram para el asistente del celular.
//
// Salen tres archivos, todos desde la misma fuente (IGPanelPro):
//
//   docs/instagram/marcador.txt         el favorito ENTERO (javascript:…, ~133 KB).
//                                        Es el que se usa en iPhone: Safari lo corre.
//   docs/instagram/panel-marcador.js    el panel solo, como archivo de script.
//   docs/instagram/marcador-corto.txt   un favorito de pocos cientos de caracteres
//                                        que carga panel-marcador.js. Es el de Android.
//
// POR QUÉ EL CORTO
// Chrome de Android corre un favorito chico adentro de Instagram (probado con
// un alert), pero uno de 130 KB no hace nada: lo corta por largo. Y un favorito
// no puede traer código de afuera así nomás, porque la política de seguridad de
// Instagram sólo acepta scripts de sus dominios... salvo los que llevan su
// "nonce", la contraseña de un solo uso que ponen en sus propios scripts. El
// favorito la lee de uno de ellos y se la pone al script que carga el panel.
// Probado en Chromium sobre instagram.com: sin nonce, bloqueado
// (script-src-elem); con nonce, carga.
//
// Hay que volver a correrlo cada vez que cambia el panel:
//   npm run marcador

import { readFileSync, writeFileSync } from "node:fs";
import { extraerPanel } from "./lib/panel-codegen.mjs";

const ORIGEN = "docs/instagram/index.html";
const PANEL_JS = "https://nook-a01.github.io/panel/instagram/panel-marcador.js";

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

// 1) el favorito entero (iPhone)
const entero = "javascript:" + encodeURIComponent(code);
writeFileSync("docs/instagram/marcador.txt", entero);

// 2) el panel como script
writeFileSync("docs/instagram/panel-marcador.js", "/* Panel de Instagram — lo carga el favorito corto. Generado por scripts/marcador.mjs: no editar a mano. */\n" + code + "\n");

// 3b) código para la app Atajos de iPhone. La acción "Ejecutar JavaScript en la
// página web" EXIGE llamar completion() al terminar, o aborta con "JavaScript no
// válido". Y el loader corto no sirve ahí: Atajos corre en un mundo aislado donde
// la CSP de Instagram bloquea el <script> externo. Así que va el panel ENTERO,
// inline, y al final completion(). Se pega tal cual en la acción.
const ios = "/* Panel de Instagram para la app Atajos de iPhone. Pegá TODO esto en la " +
  "accion 'Ejecutar JavaScript en la pagina web'. Generado por scripts/marcador.mjs. */\n" +
  code + "\ntry{completion()}catch(e){}\n";
writeFileSync("docs/instagram/panel-ios.js", ios);

// 3) el favorito corto (Android). Sin espacios ni caracteres raros, así se
// puede pegar tal cual. ?t= evita que el navegador use una copia vieja.
const corto = "javascript:(function(){" +
  "if(!/(^|\\.)instagram\\.com$/.test(location.hostname)){alert('Abrí esto adentro de instagram.com');return;}" +
  "if(document.getElementById('igpp-root'))return;" +
  "var n='',t=document.getElementsByTagName('script');" +
  "for(var i=0;i<t.length;i++){if(t[i].nonce){n=t[i].nonce;break;}}" +
  "var s=document.createElement('script');s.nonce=n;" +
  "s.src='" + PANEL_JS + "?t='+Date.now();" +
  "s.onerror=function(){alert('No se pudo cargar el panel. Revisá la conexión y probá de nuevo.');};" +
  "document.head.appendChild(s);" +
  "})();";
new Function(corto.slice("javascript:".length));
// Los espacios de los mensajes van como %20: un favorito con espacios sueltos
// puede cortarse al pegarlo. El navegador los vuelve a espacios al correrlo.
const cortoFavorito = corto.replace(/ /g, "%20").replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
if (/\s/.test(cortoFavorito)) throw new Error("el favorito corto quedó con espacios");
new Function(decodeURIComponent(cortoFavorito.slice("javascript:".length)));
writeFileSync("docs/instagram/marcador-corto.txt", cortoFavorito);

console.log(`✓ marcador.txt ${(entero.length / 1024).toFixed(0)} KB · panel-marcador.js ${(code.length / 1024).toFixed(0)} KB · marcador-corto.txt ${cortoFavorito.length} caracteres`);
