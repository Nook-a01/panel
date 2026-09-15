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
const PANEL_WORKER = "https://plata.hamcqc.workers.dev";

chrome.action.onClicked.addListener(tab => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { tipo: "abrir" }, () => {
    const err = chrome.runtime.lastError;
    if (!err) return;

    // Sólo se recarga cuando el error dice que NO HAY NADIE del otro
    // lado, que es el caso real: la pestaña estaba abierta desde antes
    // de instalar la extensión y no tiene el guion.
    //
    // Antes se recargaba ante cualquier error, y eso rompía el uso
    // normal: si el guion abría el panel pero no contestaba a tiempo,
    // Chrome avisaba "el canal se cerró", y la recarga se llevaba
    // puesto el panel que se acababa de abrir.
    const sinNadie = /Receiving end does not exist|Could not establish connection/i
      .test(err.message || "");
    if (sinNadie) chrome.tabs.reload(tab.id);
  });
});

chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  if (!msg || msg.tipo !== "salir" || typeof msg.url !== "string") return false;

  const alContador = msg.url.startsWith(CONTADOR + "/");
  const alPanel = msg.url.startsWith(PANEL_WORKER + "/");
  if (!alContador && !alPanel) { responder({ ok: false, status: 0 }); return false; }

  // Al contador, igual que siempre: POST de texto plano. Al servidor del
  // Panel, sólo lo que usa el enlace del celular: leer, subir y borrar.
  const metodo = alContador ? "POST" : String(msg.metodo || "GET").toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(metodo)) { responder({ ok: false, status: 0 }); return false; }

  const pedido = { method: metodo };
  if (alContador) {
    pedido.headers = { "content-type": "text/plain" };
    pedido.body = msg.cuerpo || "{}";
  } else {
    if (msg.cabeceras && typeof msg.cabeceras === "object") pedido.headers = msg.cabeceras;
    if (metodo === "POST") pedido.body = msg.cuerpo || "{}";
  }

  fetch(msg.url, pedido)
    .then(async r => responder({ ok: r.ok, status: r.status, datos: await r.json().catch(() => ({})) }))
    .catch(() => responder({ ok: false, status: 0 }));
  return true;   // la respuesta llega después: hay que dejar el canal abierto
});
