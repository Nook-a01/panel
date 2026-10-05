// Lista de aparatos a los que mandar avisos. La usan send-push.mjs
// (Deportes) y plata-diario.mjs (Plata), para que los dos lean lo mismo.
import { readFileSync, existsSync } from "node:fs";

// Las suscripciones salen del Worker: cada aparato se anota solo al
// activar la campanita. Antes había que copiar el JSON desde la pantalla
// del teléfono y pegarlo en un secreto de GitHub; se cortaba a la mitad.
//
// El secreto PUSH_SUBSCRIPTION sigue andando y tiene prioridad, para no
// romper nada si algún día el Worker no contesta.
const WORKER = "https://plata.hamcqc.workers.dev";

export async function suscripciones() {
  const crudo = process.env.PUSH_SUBSCRIPTION;
  if (crudo && crudo.trim()) {
    try {
      const v = JSON.parse(crudo);
      const lista = Array.isArray(v) ? v : [v];
      if (lista.length) return lista;
    } catch (e) {
      // Un secreto mal pegado no puede dejar mudos los avisos: se avisa
      // y se sigue con lo que tenga el Worker.
      console.warn("   ! PUSH_SUBSCRIPTION no es JSON válido (" + e.message + "). Uso las del Worker.");
    }
  }

  if (process.env.CLAVE_APP) {
    try {
      const r = await fetch(WORKER + "/push-subs", {
        headers: { authorization: "Bearer " + process.env.CLAVE_APP },
      });
      if (r.ok) {
        const v = await r.json();
        if (Array.isArray(v) && v.length) return v;
      } else {
        console.warn("   ! el Worker devolvió " + r.status + " al pedir las suscripciones");
      }
    } catch (e) {
      console.warn("   ! no se pudo hablar con el Worker: " + e.message);
    }
  }

  const f = new URL("../../.subscriptions.json", import.meta.url);
  if (existsSync(f)) {
    const v = JSON.parse(readFileSync(f, "utf8"));
    return Array.isArray(v) ? v : [v];
  }
  return [];
}

