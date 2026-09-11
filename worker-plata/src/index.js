// Worker de Plata — el depósito compartido entre tu compu y tu celular.
//
// POR QUÉ EXISTE
// La app de plata es un sitio estático y público, y tiene que funcionar en los
// dos aparatos. Este Worker guarda tus datos financieros en un lugar privado al
// que ambos acceden con una clave.
//
// POR QUÉ NO CONSULTA A MERCADO PAGO
// La primera versión llamaba a la API de MP Developers. El diagnóstico del
// 11/9/2026 demostró que no sirve para esto:
//   /v1/account/movements/search  → 404, el endpoint no existe públicamente
//   /users/me/.../balance         → 403, vedado para tokens de aplicación
//   /v1/payments/search           → 200 pero vacío: es para comercios que cobran
// Esa API está hecha para vender, no para leer tus finanzas personales.
//
// CÓMO LLEGAN LOS DATOS AHORA
// Un script que corre dentro de mercadopago.com.ar, con tu sesión ya iniciada,
// lee la página y manda acá lo que encuentra. Es la misma técnica del Panel de
// Instagram. Nadie necesita tu contraseña ni un token de MP.
//
// SECRETO (se carga con `wrangler secret put`, nunca en el código)
//   CLAVE_APP  → la clave que autoriza guardar y leer
//
// RUTAS (todas piden  Authorization: Bearer <CLAVE_APP>)
//   POST /guardar  → el lector manda lo que leyó de Mercado Pago
//   GET  /datos    → la app pide lo último guardado
//   GET  /estado   → cuándo se actualizó por última vez, sin exponer importes
//   GET  /semilla  → la configuración inicial (categorías, pagos fijos, historial)
//
// POR QUÉ LA SEMILLA ESTÁ ACÁ Y NO EN LA PÁGINA
// Hasta el 11/9/2026 esa configuración venía incrustada en docs/plata/index.html,
// que se publica en un repositorio PÚBLICO. Incluía 96 movimientos con importes y
// los nombres de 38 personas reales. Ahora vive acá, detrás de la clave.

const cabeceras = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",          // que nadie guarde datos financieros en caché
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: cabeceras });

// Comparación en tiempo constante: que no se pueda adivinar la clave midiendo
// cuánto tarda en responder.
function claveValida(recibida, esperada) {
  if (!recibida || !esperada || recibida.length !== esperada.length) return false;
  let dif = 0;
  for (let i = 0; i < recibida.length; i++) dif |= recibida.charCodeAt(i) ^ esperada.charCodeAt(i);
  return dif === 0;
}

function autorizado(request, env) {
  const h = request.headers.get("authorization") || "";
  return claveValida(h.startsWith("Bearer ") ? h.slice(7).trim() : "", env.CLAVE_APP);
}

// --------------------------------------------------------------------------
// Fusionar lo nuevo con lo que ya había
// --------------------------------------------------------------------------
//
// El lector manda lo que ve en pantalla, que son los últimos movimientos. Si
// reemplazáramos todo, cada lectura borraría el historial. Por eso se fusiona
// usando el id que Mercado Pago le da a cada movimiento.

function fusionar(viejo, nuevo) {
  const previos = (viejo && viejo.movimientos) || [];
  const entrantes = nuevo.movimientos || [];

  const porId = new Map();
  for (const m of previos) porId.set(m.id, m);
  // Los entrantes pisan a los viejos: si un movimiento cambió de estado, vale el nuevo.
  for (const m of entrantes) porId.set(m.id, m);

  const movimientos = [...porId.values()]
    .filter(m => m && m.fecha)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  return {
    actualizado: new Date().toISOString(),
    saldo: nuevo.saldo ?? (viejo ? viejo.saldo : null),
    mes: nuevo.mes ?? (viejo ? viejo.mes : null),
    categorias: nuevo.categorias ?? (viejo ? viejo.categorias : null),
    movimientos,
    nuevosEnEstaLectura: entrantes.filter(m => !previos.some(p => p.id === m.id)).length,
  };
}

// --------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return json({ ok: true });
    if (!env.CLAVE_APP) return json({ error: "Falta el secreto CLAVE_APP en el Worker." }, 500);
    if (!autorizado(request, env)) return json({ error: "Clave incorrecta o ausente." }, 401);

    try {
      // ---- el lector manda datos ----
      if (url.pathname === "/guardar" && request.method === "POST") {
        const entrante = await request.json();

        if (!entrante || typeof entrante !== "object")
          return json({ error: "Cuerpo inválido." }, 400);

        // Guarda anti-pisada: una lectura vacía no debe borrar el historial.
        const hayAlgo = (entrante.movimientos && entrante.movimientos.length) || entrante.saldo != null;
        if (!hayAlgo) return json({ error: "La lectura vino vacía, no se guardó nada." }, 400);

        const previo = JSON.parse((await env.PLATA.get("datos")) || "null");
        const fusionado = fusionar(previo, entrante);
        await env.PLATA.put("datos", JSON.stringify(fusionado));

        return json({
          ok: true,
          total: fusionado.movimientos.length,
          nuevos: fusionado.nuevosEnEstaLectura,
          saldo: fusionado.saldo,
        });
      }

      // ---- la app pide los datos ----
      if (url.pathname === "/datos") {
        const guardado = await env.PLATA.get("datos");
        if (!guardado) {
          return json({
            error: "Todavía no hay datos.",
            comoArreglarlo: "Abrí mercadopago.com.ar en la compu con el lector instalado.",
          }, 404);
        }
        return new Response(guardado, { headers: cabeceras });
      }

      // ---- estado, sin exponer importes ----
      if (url.pathname === "/estado") {
        const guardado = JSON.parse((await env.PLATA.get("datos")) || "null");
        if (!guardado) return json({ hayDatos: false });
        const horas = (Date.now() - new Date(guardado.actualizado).getTime()) / 3600e3;
        return json({
          hayDatos: true,
          actualizado: guardado.actualizado,
          horasDesdeLaUltimaLectura: Math.round(horas),
          movimientos: guardado.movimientos.length,
          // Si pasaron más de 3 días, la app avisa en vez de mostrar datos viejos como si fueran de hoy.
          estaViejo: horas > 72,
        });
      }

      // ---- configuración inicial (categorías, pagos fijos, reglas, historial) ----
      if (url.pathname === "/semilla") {
        const guardado = await env.PLATA.get("semilla");
        if (!guardado) return json({ error: "No hay semilla cargada." }, 404);
        return new Response(guardado, { headers: cabeceras });
      }

      return json({ error: "Ruta desconocida", rutas: ["POST /guardar", "GET /datos", "GET /estado", "GET /semilla"] }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
