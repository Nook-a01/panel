// El único puente entre la barra y el programa. La barra es una página nuestra
// y aun así no recibe acceso a Node: sólo estos tres avisos, nada más.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("panel", {
  ir: (id) => ipcRenderer.send("ir", id),
  atras: () => ipcRenderer.send("atras"),
  recargar: () => ipcRenderer.send("recargar"),
  alCambiarSeccion: (fn) => ipcRenderer.on("seccion", (_e, id) => fn(id)),
});
