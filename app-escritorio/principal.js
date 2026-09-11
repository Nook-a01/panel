// Panel — programa de escritorio.
//
// QUÉ ES
// Las cuatro secciones del Panel (Deportes, Plata, Campamento e Instagram) en
// una sola ventana. Las tres primeras son páginas web normales y podrían verse
// en cualquier navegador; Instagram es la que obliga a que esto sea un programa.
//
// POR QUÉ INSTAGRAM OBLIGA A UN PROGRAMA
// Los nombres de tus seguidores sólo existen dentro de una sesión de Instagram
// abierta. Una página web no los puede leer, y quedó probado:
//   · meter instagram.com en un iframe → responde `X-Frame-Options: DENY`
//   · pedirle la API desde otro sitio  → no manda ninguna cabecera CORS
//   · inyectar un script en su página  → su política sólo permite sus dominios
// Un programa trae su propio navegador, así que abre Instagram como página
// PRINCIPAL —no metida adentro de otra, que es lo que ese DENY prohíbe— y desde
// ahí puede mostrar el panel, con la misma potestad que una extensión.
//
// QUÉ NO HACE
// No te pide la contraseña ni la ve: quien te la pide es la pantalla de login
// real de Instagram, servida por Instagram. La sesión queda en tu máquina.

const { app, BaseWindow, WebContentsView, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const PANEL_WEB = "https://nook-a01.github.io/panel/";
const INSTAGRAM = "https://www.instagram.com/";
const CODIGO_PANEL = fs.readFileSync(path.join(__dirname, "panel.js"), "utf8");

const ALTO_BARRA = 46;

const SECCIONES = [
  { id: "deportes",   texto: "⚽ Deportes",   url: PANEL_WEB + "deportes/" },
  { id: "plata",      texto: "💸 Plata",      url: PANEL_WEB + "plata/" },
  { id: "campamento", texto: "🎹 Campamento", url: PANEL_WEB + "campamento/" },
  { id: "instagram",  texto: "📸 Instagram",  url: INSTAGRAM },
];

let ventana = null, barra = null, contenido = null;

function crear() {
  ventana = new BaseWindow({
    width: 1180, height: 880, minWidth: 420,
    title: "Panel",
    backgroundColor: "#0b0b0f",
    icon: path.join(__dirname, "icono.png"),
  });

  // La barra de secciones es una página nuestra, local: no depende de internet
  // ni de que el sitio cargue.
  barra = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, "puente.js"), contextIsolation: true },
  });
  barra.webContents.loadFile(path.join(__dirname, "barra.html"));

  contenido = new WebContentsView({
    webPreferences: {
      // La página que se carga (Instagram incluido) NO debe tener acceso a Node:
      // sería darle permisos sobre la máquina de quien usa el programa.
      nodeIntegration: false,
      contextIsolation: true,
      partition: "persist:panel",
    },
  });

  quitarPoliticaDeSeguridad(contenido.webContents.session);

  ventana.contentView.addChildView(barra);
  ventana.contentView.addChildView(contenido);

  acomodar();
  ventana.on("resize", acomodar);

  // El panel se vuelve a poner en cada navegación de Instagram. Las otras
  // secciones no lo necesitan.
  contenido.webContents.on("did-finish-load", inyectarSiEsInstagram);

  // Los enlaces que abrirían otra ventana van al navegador de verdad.
  contenido.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Para que la barra pueda marcar dónde estás parado.
  contenido.webContents.on("did-navigate", avisarSeccion);
  contenido.webContents.on("did-navigate-in-page", avisarSeccion);

  ir("deportes");
  ventana.on("closed", () => { ventana = barra = contenido = null; });
}

function acomodar() {
  if (!ventana) return;
  const { width, height } = ventana.getContentBounds();
  barra.setBounds({ x: 0, y: 0, width, height: ALTO_BARRA });
  contenido.setBounds({ x: 0, y: ALTO_BARRA, width, height: height - ALTO_BARRA });
}

function ir(id) {
  const s = SECCIONES.find(x => x.id === id);
  if (!s || !contenido) return;
  contenido.webContents.loadURL(s.url);
}

function avisarSeccion() {
  if (!barra || !contenido) return;
  const url = contenido.webContents.getURL();
  const actual = esInstagram(url)
    ? "instagram"
    : (SECCIONES.find(s => s.id !== "instagram" && url.startsWith(s.url)) || {}).id;
  barra.webContents.send("seccion", actual || "");
}

const esInstagram = url => /^https:\/\/(www\.)?instagram\.com\//.test(url || "");

// Instagram sirve una política que sólo permite recursos de sus propios
// dominios, y el panel manda su conteo de uso a otro lado. Se quita SÓLO en la
// sesión de este programa, que es nuestra: no afecta a ningún otro navegador
// de la máquina.
function quitarPoliticaDeSeguridad(sesion) {
  sesion.webRequest.onHeadersReceived((detalles, seguir) => {
    const cabeceras = detalles.responseHeaders || {};
    for (const nombre of Object.keys(cabeceras)) {
      const n = nombre.toLowerCase();
      if (n === "content-security-policy" ||
          n === "content-security-policy-report-only" ||
          n === "x-frame-options") {
        delete cabeceras[nombre];
      }
    }
    seguir({ responseHeaders: cabeceras });
  });
}

async function inyectarSiEsInstagram() {
  if (!contenido) return;
  if (!esInstagram(contenido.webContents.getURL())) return;
  try {
    await contenido.webContents.executeJavaScript(CODIGO_PANEL, true);
  } catch (e) {
    console.error("No se pudo poner el panel de Instagram:", e.message);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // La barra pide cambiar de sección por acá.
  const { ipcMain } = require("electron");
  ipcMain.on("ir", (_e, id) => ir(id));
  ipcMain.on("atras", () => { if (contenido?.webContents.canGoBack()) contenido.webContents.goBack(); });
  ipcMain.on("recargar", () => contenido?.webContents.reload());

  crear();
  app.on("activate", () => { if (!ventana) crear(); });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

module.exports = { SECCIONES };
