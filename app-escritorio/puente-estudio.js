// El único puente entre la pantalla del Estudio y la máquina.
//
// La pantalla NO recibe acceso a Node: recibe estas ocho puertas y nada más.
// Si mañana hace falta que toque algo nuevo del disco, se agrega acá y se ve
// en una línea, en vez de quedar suelto adentro de la interfaz.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("estudio", {
  plugins:         ()      => ipcRenderer.invoke("estudio:plugins"),
  carpetas:        ()      => ipcRenderer.invoke("estudio:carpetas"),
  elegirCarpeta:   ()      => ipcRenderer.invoke("estudio:elegir-carpeta"),
  olvidarCarpeta:  (ruta)  => ipcRenderer.invoke("estudio:olvidar-carpeta", ruta),
  samples:         (ruta)  => ipcRenderer.invoke("estudio:samples", ruta),
  leerPieza:       ()      => ipcRenderer.invoke("estudio:leer-pieza"),
  guardarPieza:    (pieza) => ipcRenderer.invoke("estudio:guardar-pieza", pieza),
  donde:           ()      => ipcRenderer.invoke("estudio:donde"),
  abrirCarpeta:    ()      => ipcRenderer.invoke("estudio:abrir-carpeta"),
});
