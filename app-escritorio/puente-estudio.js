// El único puente entre la pantalla del Estudio y la máquina.
//
// La pantalla NO recibe acceso a Node: recibe estas puertas y nada más. Si
// mañana hace falta que toque algo nuevo del disco, se agrega acá y se ve en
// una línea, en vez de quedar suelto adentro de la interfaz.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("estudio", {
  plugins:         ()      => ipcRenderer.invoke("estudio:plugins"),
  carpetas:        ()      => ipcRenderer.invoke("estudio:carpetas"),
  elegirCarpeta:   ()      => ipcRenderer.invoke("estudio:elegir-carpeta"),
  olvidarCarpeta:  (ruta)  => ipcRenderer.invoke("estudio:olvidar-carpeta", ruta),
  samples:         (ruta)  => ipcRenderer.invoke("estudio:samples", ruta),

  leerPieza:       ()      => ipcRenderer.invoke("estudio:leer-pieza"),
  guardarPieza:    (pieza) => ipcRenderer.invoke("estudio:guardar-pieza", pieza),

  versiones:       ()            => ipcRenderer.invoke("estudio:versiones"),
  abrirVersion:    (id)          => ipcRenderer.invoke("estudio:abrir-version", id),
  duplicarVersion: (desde, nom)  => ipcRenderer.invoke("estudio:duplicar-version", desde, nom),
  versionDesde:    (pieza)       => ipcRenderer.invoke("estudio:version-desde", pieza),
  renombrarVersion:(id, nom)     => ipcRenderer.invoke("estudio:renombrar-version", id, nom),
  borrarVersion:   (id)          => ipcRenderer.invoke("estudio:borrar-version", id),

  guardarMidi:     (nombre, bytes) => ipcRenderer.invoke("estudio:guardar-midi", nombre, bytes),

  donde:           ()      => ipcRenderer.invoke("estudio:donde"),
  abrirCarpeta:    ()      => ipcRenderer.invoke("estudio:abrir-carpeta"),
});
