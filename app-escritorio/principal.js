// Panel de Instagram — programa de escritorio.
//
// QUÉ RESUELVE
// El panel necesita correr DENTRO de instagram.com con tu sesión abierta: los
// nombres de tus seguidores sólo existen ahí. Una página web no puede hacerlo
// (probado: Instagram manda `X-Frame-Options: DENY` y una política que bloquea
// todo script de afuera), y la única alternativa era pedirle a cada persona que
// instalara un gestor de userscripts.
//
// Este programa trae su propio navegador. Cuando abre Instagram lo abre como
// página principal, no metida adentro de otra — que es justo lo que ese DENY
// prohíbe. Desde ahí puede inyectar el panel, igual que haría una extensión.
//
// QUÉ NO HACE
// No te pide la contraseña ni la ve: quien te la pide es la pantalla de login
// real de Instagram, servida por Instagram. Tu sesión queda guardada en tu
// máquina y no sale de ahí. El programa no manda nada a ningún servidor nuestro
// más que el contador de uso, igual que la extensión.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const INSTAGRAM = "https://www.instagram.com/";
const PANEL = fs.readFileSync(path.join(__dirname, "panel.js"), "utf8");

let ventana = null;

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 380,
    title: "Panel de Instagram",
    backgroundColor: "#000000",
    icon: path.join(__dirname, "icono.png"),
    autoHideMenuBar: true,
    webPreferences: {
      // El panel corre en la página de Instagram, así que esa página NO debe
      // tener acceso a Node: sería darle a instagram.com permisos sobre tu
      // máquina. El panel se inyecta desde acá, que sí los tiene.
      nodeIntegration: false,
      contextIsolation: true,
      // Sesión persistente con nombre propio: no se mezcla con nada y sobrevive
      // a cerrar el programa, así no hay que loguearse cada vez.
      partition: "persist:instagram",
    },
  });

  quitarPoliticaDeSeguridad(ventana.webContents.session);

  ventana.loadURL(INSTAGRAM);

  // Instagram cambia de sección sin recargar, pero cada navegación real
  // (incluido el login) dispara esto. El panel se vuelve a poner si hace falta.
  ventana.webContents.on("did-finish-load", inyectar);

  // Los enlaces que Instagram abriría en otra ventana van al navegador de
  // verdad: este programa es para el panel, no para navegar.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  ventana.on("closed", () => { ventana = null; });
}

// Instagram sirve una política de seguridad que sólo permite recursos de sus
// propios dominios. El panel manda su conteo de uso a otro lado, así que esa
// política lo bloquearía. Se quita SÓLO en esta ventana, que es nuestra y sólo
// carga Instagram: no afecta a ningún otro navegador de la máquina.
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

async function inyectar() {
  if (!ventana) return;
  const url = ventana.webContents.getURL();
  if (!/^https:\/\/(www\.)?instagram\.com\//.test(url)) return;
  try {
    await ventana.webContents.executeJavaScript(PANEL, true);
  } catch (e) {
    console.error("No se pudo poner el panel:", e.message);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  crearVentana();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
