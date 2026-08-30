// Service worker único de todo el Panel.
//
// Antes vivía adentro de Deportes y sólo mandaba en esa carpeta. Ahora
// está acá arriba y su alcance es el Panel entero, que es lo que hace
// que las cuatro secciones sean una sola app instalada y no cuatro
// páginas sueltas: una sola instalación, un solo permiso de avisos.
//
// Estrategia: la app SIEMPRE se pide a la red primero, y la copia
// guardada queda sólo como respaldo para cuando no hay conexión.
// Al revés (primero la caché) el teléfono seguía mostrando la versión
// vieja después de publicar, hasta limpiar la caché a mano.
// Los escudos sí se guardan para siempre: no cambian nunca.

const CACHE   = "panel-v2";
const ESCUDOS = "panel-escudos";

const BASICOS = [
  // la portada
  "./", "./index.html", "./hub.css", "./hub.js", "./manifest.webmanifest",

  // deportes
  "./deportes/", "./deportes/index.html",
  "./deportes/styles.css", "./deportes/detalle.css", "./deportes/escudos.css",
  "./deportes/extras.css", "./deportes/movimiento.css", "./deportes/iphone.css",
  "./deportes/semana.css", "./deportes/tema.css", "./deportes/clubes.css",
  "./deportes/app.js", "./deportes/fx.js", "./deportes/api.js", "./deportes/f1-datos.js",
  "./deportes/icons/icon-192.png",

  // las otras tres son un archivo cada una
  "./plata/", "./plata/index.html",
  "./instagram/", "./instagram/index.html",
  "./campamento/", "./campamento/index.html",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      // Si algún archivo falla no queremos que se caiga la instalación entera.
      .then(c => Promise.allSettled(BASICOS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        ks.filter(k => k !== CACHE && k !== ESCUDOS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Los escudos vienen del CDN de ESPN. Se guardan aparte y para siempre.
  if (url.hostname === "a.espncdn.com") {
    e.respondWith(
      caches.open(ESCUDOS).then(c =>
        c.match(e.request).then(guardado =>
          guardado || fetch(e.request)
            .then(r => { c.put(e.request, r.clone()); return r; })
            .catch(() => guardado)))
    );
    return;
  }

  // Las consultas en vivo a las APIs no se tocan: siempre a la red.
  if (url.hostname !== location.hostname) return;

  // Todo lo del Panel: red primero, caché como red de emergencia.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then(g => g || caches.match("./")))
  );
});

/* ---------- notificación push entrante ---------- */
self.addEventListener("push", e => {
  // Por ahora los avisos son todos de Deportes, así que si el mensaje no
  // dice a dónde ir, va ahí y no a la portada.
  let d = { title: "Panel", body: "Tenés un evento próximo", url: "./deportes/" };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch { if (e.data) d.body = e.data.text(); }

  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: "./deportes/icons/icon-192.png",
    badge: "./deportes/icons/icon-192.png",
    tag: d.tag || undefined,
    renotify: false,
    data: { url: d.url || "./deportes/" },
    vibrate: [200, 80, 200],
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "./deportes/", self.location).href;

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
      // Si ya hay una ventana abierta, la llevamos al lugar del aviso en
      // vez de dejarla donde estaba: tocaste el aviso para ver eso.
      for (const c of lista) {
        if ("focus" in c) {
          if (c.url !== destino && "navigate" in c) return c.navigate(destino).then(v => v && v.focus());
          return c.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
