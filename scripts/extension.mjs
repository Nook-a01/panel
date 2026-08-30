// Arma la extensión de navegador del Panel de Instagram.
//
// POR QUÉ EXISTE
// Instagram no deja que el panel hable con el contador: su política de
// seguridad (script-src, connect-src, img-src) sólo permite sus propios
// dominios. Por eso el marcador nunca pudo mandar los datos de uso, y
// por eso la dirección del contador estaba vacía en el código.
// Una extensión NO está sujeta a esa política: puede pedir a instagram
// con la sesión abierta y, además, mandarle los datos al contador desde
// su proceso de fondo. Es la única forma de que el tablero se llene solo.
//
// De paso arregla lo otro: instalarla es descomprimir y cargar, en vez
// de copiar 120 KB y pelear con la barra de marcadores.
//
// CÓMO SE ARMA
// El código del panel NO se copia: se extrae de docs/instagram/index.html,
// que es la única fuente. Si mañana tocás el panel, se corre esto de nuevo
// y la extensión queda igual. Copiarlo habría garantizado que en tres
// semanas fueran dos programas distintos.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";

const ORIGEN = "docs/instagram/index.html";
const SALIDA = "extension";
const CONTADOR = "https://wispy-poetry-97f9.hamcqc.workers.dev";
const VERSION = "1.0.0";

/* ─────────── 1. sacar el panel de la página ─────────── */

function extraerPanel(html) {
  const marca = "async function IGPanelPro(){";
  const desde = html.indexOf(marca);
  if (desde < 0) throw new Error("no encontré 'async function IGPanelPro('");

  // Se cuentan llaves para encontrar dónde cierra la función. Hay que
  // saltear las que viven adentro de textos, de expresiones regulares y
  // de comentarios: el panel tiene CSS en cadenas llenas de llaves, y
  // contarlas a lo bruto cortaba la función por la mitad.
  let i = desde + marca.length - 1;   // parado en la llave que abre
  let nivel = 0;
  let dentro = null;                  // ' " ` /regex/ // /* */
  let escapa = false;

  for (; i < html.length; i++) {
    const c = html[i], sig = html[i + 1], ant = html[i - 1];

    if (escapa) { escapa = false; continue; }
    if (dentro === "\\") { escapa = true; continue; }

    if (dentro) {
      if (dentro === "//" && c === "\n") dentro = null;
      else if (dentro === "/*" && c === "*" && sig === "/") { dentro = null; i++; }
      else if ((dentro === "'" || dentro === '"' || dentro === "`") && c === "\\") escapa = true;
      else if (c === dentro && dentro !== "//" && dentro !== "/*") dentro = null;
      continue;
    }

    if (c === "'" || c === '"' || c === "`") { dentro = c; continue; }
    if (c === "/" && sig === "/") { dentro = "//"; i++; continue; }
    if (c === "/" && sig === "*") { dentro = "/*"; i++; continue; }

    if (c === "{") nivel++;
    else if (c === "}") {
      nivel--;
      if (nivel === 0) return html.slice(desde, i + 1);
    }
  }
  throw new Error("la función no cierra: revisá el HTML");
}

/* ─────────── 2. el guion que corre adentro de Instagram ─────────── */

const contenido = panel => `// Panel de Instagram — se ejecuta adentro de instagram.com
//
// GENERADO. No lo edites a mano: se rehace con "node scripts/extension.mjs"
// a partir de docs/instagram/index.html, que es la única fuente.
//
// Vive en el "mundo aislado" de la extensión, así que la política de
// seguridad de Instagram no le aplica: puede definirse entero acá sin
// que la página lo bloquee.

(() => {
  "use strict";

  const CONTADOR = ${JSON.stringify(CONTADOR)};

  /* ── el puente del contador ──────────────────────────────────────
     Esto es el corazón del arreglo. El panel manda sus datos con
     fetch(). Un fetch hecho desde acá SIGUE sujeto al connect-src de
     Instagram, que no incluye el contador — o sea que se bloquearía
     igual que con el marcador.

     La salida es el proceso de fondo de la extensión: ese no está
     atado a ninguna página y sí puede. Acá se declara un 'fetch'
     propio que desvía SOLO lo que va al contador y deja pasar todo
     lo demás sin tocar. Como el panel se define dentro de este
     alcance, sus llamadas a fetch() encuentran ésta primero, y no
     hubo que modificar ni una línea del panel. */
  const fetchReal = window.fetch.bind(window);
  const fetch = (url, opciones) => {
    const dir = typeof url === "string" ? url : (url && url.url) || "";
    if (!dir.startsWith(CONTADOR)) return fetchReal(url, opciones);
    return new Promise(resolver => {
      chrome.runtime.sendMessage(
        { tipo: "contador", url: dir, cuerpo: opciones && opciones.body },
        r => resolver({ ok: !!(r && r.ok), status: r && r.ok ? 200 : 0,
                        json: async () => (r && r.datos) || {} })
      );
    });
  };

  let abriendo = false;

${panel}

  // El panel no arranca solo: espera a que toques el botón de la barra.
  // Meterse en pantalla sin que nadie lo pida sería peor que el marcador.
  chrome.runtime.onMessage.addListener(msg => {
    if (!msg || msg.tipo !== "abrir") return;
    const yaEsta = document.getElementById("igpp-root");
    if (yaEsta) { yaEsta.remove(); return; }   // segundo toque: se cierra
    if (abriendo) return;
    abriendo = true;
    Promise.resolve(IGPanelPro()).catch(e => {
      alert("No se pudo abrir el panel: " + (e && e.message ? e.message : e));
    }).finally(() => { abriendo = false; });
  });
})();
`;

/* ─────────── 3. el proceso de fondo ─────────── */

const fondo = `// Proceso de fondo de la extensión.
//
// Hace dos cosas y nada más:
//   1. abre el panel cuando tocás el botón de la barra
//   2. le pasa los datos de uso al contador
//
// El punto 2 es el que no se puede hacer desde la página: acá no rige la
// política de seguridad de Instagram, y el permiso al dominio del contador
// está declarado en el manifiesto.

const CONTADOR = ${JSON.stringify(CONTADOR)};

chrome.action.onClicked.addListener(tab => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { tipo: "abrir" }, () => {
    // Si la pestaña no tiene el guion cargado (por ejemplo, estaba
    // abierta desde antes de instalar la extensión), se avisa en vez
    // de no hacer nada, que es lo que más desconcierta.
    if (chrome.runtime.lastError) {
      chrome.tabs.reload(tab.id);
    }
  });
});

chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  if (!msg || msg.tipo !== "contador") return false;
  if (typeof msg.url !== "string" || !msg.url.startsWith(CONTADOR)) {
    responder({ ok: false });
    return false;
  }
  fetch(msg.url, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: msg.cuerpo || "{}",
  })
    .then(async r => responder({ ok: r.ok, datos: await r.json().catch(() => ({})) }))
    .catch(() => responder({ ok: false }));
  return true;   // la respuesta llega después: hay que dejar el canal abierto
});
`;

/* ─────────── 4. el manifiesto ─────────── */

const manifiesto = {
  manifest_version: 3,
  name: "Panel de Instagram",
  version: VERSION,
  description: "Quién no te sigue de vuelta, quién ve tus historias y cómo crece tu cuenta.",
  default_locale: undefined,
  permissions: ["activeTab"],
  host_permissions: [
    "https://www.instagram.com/*",
    CONTADOR + "/*",
  ],
  background: { service_worker: "fondo.js" },
  action: { default_title: "Abrir el Panel de Instagram" },
  content_scripts: [{
    matches: ["https://www.instagram.com/*"],
    js: ["contenido.js"],
    run_at: "document_idle",
  }],
  icons: { 16: "icono-16.png", 48: "icono-48.png", 128: "icono-128.png" },
};

/* ─────────── 5. los íconos ─────────── */
// Encoder PNG mínimo, el mismo que usa el ícono del Panel.

const tablaCrc = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; }
  return t;
})();
const crc32 = b => { let c = -1; for (const x of b) c = tablaCrc[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const trozo = (tipo, datos) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
};
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(raw, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// Un cuadrado con la esquina redondeada y el marco de una cámara: se
// reconoce como Instagram sin usar su logo, que no es nuestro.
const dibujo = (x, y, size) => {
  const NEGRO = [10, 10, 10], ACIDO = [204, 255, 0];
  const c = size / 2, dx = x - c + .5, dy = y - c + .5;

  const distRedondeado = (px, py, mitad, radio) => {
    const qx = Math.abs(px) - mitad + radio, qy = Math.abs(py) - mitad + radio;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radio;
  };

  if (distRedondeado(dx, dy, size * .5, size * .22) > 0) return [0, 0, 0, 0];

  const marco = distRedondeado(dx, dy, size * .34, size * .11);
  const grosor = Math.max(1.2, size * .075);
  if (marco > -grosor && marco < 0) return [...ACIDO, 255];

  const lente = Math.hypot(dx, dy) - size * .155;
  if (lente > -grosor && lente < 0) return [...ACIDO, 255];

  // el puntito de arriba a la derecha
  if (Math.hypot(dx - size * .21, dy + size * .21) < Math.max(1.4, size * .045)) return [...ACIDO, 255];

  return [...NEGRO, 255];
};

/* ─────────── 6. escribir todo ─────────── */

const html = readFileSync(ORIGEN, "utf8");
let panel = extraerPanel(html);

/* En el marcador la dirección del contador va VACÍA, y no es un olvido:
   desde adentro de instagram.com la política de la página bloquea tanto
   el fetch como el píxel de respaldo, así que el envío no llegaría nunca
   y el aviso de permiso estaría mintiendo.

   Acá sí funciona, porque el envío lo hace el proceso de fondo. Así que
   la extensión es la única versión que la lleva puesta. */
const VACIA = "var TELEMETRY_URL='';";
if (!panel.includes(VACIA)) {
  console.error("✗ no encontré 'var TELEMETRY_URL=\"\";' — ¿cambió el panel?");
  console.error("  Sin esto la extensión no reportaría nada y el tablero quedaría vacío.");
  process.exit(1);
}
panel = panel.replace(VACIA, `var TELEMETRY_URL=${JSON.stringify(CONTADOR)};`);

// Control antes de escribir: si lo extraído no compila, algo se cortó mal
// y es mejor enterarse acá que cuando la extensión no abre.
try { new Function(panel + "\nreturn IGPanelPro;"); }
catch (e) { console.error("✗ lo extraído no es válido: " + e.message); process.exit(1); }

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

writeFileSync(SALIDA + "/manifest.json", JSON.stringify(manifiesto, null, 2));
writeFileSync(SALIDA + "/contenido.js", contenido(panel));
writeFileSync(SALIDA + "/fondo.js", fondo);
for (const s of [16, 48, 128]) writeFileSync(`${SALIDA}/icono-${s}.png`, png(s, dibujo));

writeFileSync(SALIDA + "/LEEME.txt", `Panel de Instagram — extensión para Chrome, Edge, Brave y Opera
================================================================

CÓMO INSTALARLA (una sola vez, dos minutos)

  1. Descomprimí este archivo en una carpeta y NO la borres:
     el navegador la lee de ahí cada vez que arranca.

  2. Abrí tu navegador y entrá a:
       Chrome / Brave / Opera →  chrome://extensions
       Edge                   →  edge://extensions

  3. Arriba a la derecha, activá "Modo de desarrollador".

  4. Tocá "Cargar descomprimida" y elegí la carpeta del paso 1.

  5. Listo. Va a aparecer un ícono verde en la barra del navegador.
     Si no lo ves, tocá la piecita 🧩 y fijalo.

CÓMO USARLA

  Entrá a instagram.com con tu sesión abierta y tocá el ícono.
  Tocalo de nuevo para cerrar el panel.

SI ALGO NO ANDA

  · "No pasa nada al tocar el ícono": recargá la pestaña de Instagram.
    Las pestañas abiertas de antes de instalar no tienen el panel.

  · "Desactivá las extensiones en modo de desarrollador": es un aviso
    normal de Chrome. Tocá "Cancelar" y seguí. No rompe nada.

  · Si borrás o movés la carpeta, la extensión deja de funcionar.

QUÉ SE ENVÍA

  Cuando aceptás el aviso que aparece la primera vez, el panel avisa
  quién lo está usando (tu @usuario), cuándo lo abrís y qué secciones
  mirás. Nada más: no salen tus seguidores, ni tus mensajes, ni tus
  historias, ni ningún contenido de tu cuenta, y la contraseña no se
  pide nunca. Podés cambiar de idea desde el pie del panel.

Versión ${VERSION}
`);

const kb = f => (readFileSync(SALIDA + "/" + f).length / 1024).toFixed(1) + " KB";
console.log("✓ extensión armada en ./" + SALIDA);
console.log("   manifest.json  " + kb("manifest.json"));
console.log("   contenido.js   " + kb("contenido.js") + "   ← el panel, sacado del HTML");
console.log("   fondo.js       " + kb("fondo.js") + "    ← el puente con el contador");
console.log("   3 íconos + LEEME.txt");
