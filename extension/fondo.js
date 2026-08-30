// Proceso de fondo de la extensión.
//
// Hace dos cosas y nada más:
//   1. abre el panel cuando tocás el botón de la barra
//   2. le pasa los datos de uso al contador
//
// El punto 2 es el que no se puede hacer desde la página: acá no rige la
// política de seguridad de Instagram, y el permiso al dominio del contador
// está declarado en el manifiesto.

const CONTADOR = "https://wispy-poetry-97f9.hamcqc.workers.dev";

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
