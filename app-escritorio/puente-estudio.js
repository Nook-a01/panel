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

  refListar:       ()      => ipcRenderer.invoke("estudio:ref-listar"),
  refAgregar:      ()      => ipcRenderer.invoke("estudio:ref-agregar"),
  refCarpeta:      ()      => ipcRenderer.invoke("estudio:ref-carpeta"),
  bancoRitmos:     ()      => ipcRenderer.invoke("estudio:banco-ritmos"),
  aprenderRitmos:  ()      => ipcRenderer.invoke("estudio:aprender-ritmos"),
  refQuitar:       (ruta)  => ipcRenderer.invoke("estudio:ref-quitar", ruta),
  refLeer:         (ruta)  => ipcRenderer.invoke("estudio:ref-leer", ruta),
  fichas:          ()      => ipcRenderer.invoke("estudio:fichas"),
  guardarFicha:    (ruta, ficha) => ipcRenderer.invoke("estudio:ficha-guardar", ruta, ficha),

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

// Mezcla, Videoclip, Campaña y Métricas (lanzamiento-motor.js). Todas trabajan
// sobre una canción de Mis canciones, que se nombra por su carpeta relativa.
contextBridge.exposeInMainWorld("lanzamiento", {
  canciones:       ()            => ipcRenderer.invoke("lz:canciones"),
  abrir:           (id, rel)     => ipcRenderer.invoke("lz:abrir", id, rel),

  mezcla:          (id)          => ipcRenderer.invoke("lz:mezcla", id),
  medirMaster:     (id)          => ipcRenderer.invoke("lz:medir-master", id),
  elegirWav:       (id)          => ipcRenderer.invoke("lz:elegir-wav", id),
  usarMaster:      (id, wav)     => ipcRenderer.invoke("lz:usar-master", id, wav),

  videoclip:       (id)          => ipcRenderer.invoke("lz:videoclip", id),
  pasoVideoclip:   (id, paso, o) => ipcRenderer.invoke("lz:videoclip-paso", id, paso, o),

  campana:         (id)          => ipcRenderer.invoke("lz:campana", id),
  armarPlan:       (id, fecha)   => ipcRenderer.invoke("lz:campana-plan", id, fecha),
  guardarCampana:  (id, cambios) => ipcRenderer.invoke("lz:campana-guardar", id, cambios),
  exportarIcs:     (id)          => ipcRenderer.invoke("lz:campana-ics", id),
  armarTapa:       (id, o)       => ipcRenderer.invoke("lz:campana-tapa", id, o),
  armarClips:      (id)          => ipcRenderer.invoke("lz:campana-clips", id),
  licencias:       (id)          => ipcRenderer.invoke("lz:licencias", id),

  metricas:        ()            => ipcRenderer.invoke("lz:metricas"),
  agregarMetrica:  (e)           => ipcRenderer.invoke("lz:metrica-agregar", e),
  borrarMetrica:   (i)           => ipcRenderer.invoke("lz:metrica-borrar", i),
  videosYoutube:   (ids)         => ipcRenderer.invoke("lz:youtube-videos", ids),
  claveYoutube:    (clave)       => ipcRenderer.invoke("lz:youtube-clave", clave),
  hayClaveYoutube: ()            => ipcRenderer.invoke("lz:youtube-hay-clave"),
  actualizarYoutube: ()          => ipcRenderer.invoke("lz:youtube-actualizar"),
  importarCsv:     (red)         => ipcRenderer.invoke("lz:importar-csv", red),
});
