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
//   GET  /app      → el estado completo de la app (lo que ves en pantalla)
//   POST /app      → la app guarda su estado acá para que el otro aparato lo vea
//   GET/POST /tarjeta    → el consumo del resumen en curso de la tarjeta de crédito
//   GET/POST /campamento → los días marcados del plan de 30 días
//   GET/POST /vivos      → último marcador avisado de cada partido en juego
//   GET/POST /instagram  → lo último que leyó el panel de Instagram, para verlo en el celular
//   GET  /foto?u=       → la foto de perfil de esa cuenta, traída por el Worker
//   GET/POST/DELETE /ig/<código> → el panel de Instagram de otra persona (SIN clave:
//                          el código de 32 caracteres al azar ES la llave)

//
// POR QUÉ LA SEMILLA ESTÁ ACÁ Y NO EN LA PÁGINA
// Hasta el 11/9/2026 esa configuración venía incrustada en docs/plata/index.html,
// que se publica en un repositorio PÚBLICO. Incluía 96 movimientos con importes y
// los nombres de 38 personas reales. Ahora vive acá, detrás de la clave.

const cabeceras = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
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
    // Cuándo se leyó el SALDO, que no es lo mismo que cuándo llegó algo: desde
    // Actividad el lector manda movimientos sin saldo, y la app creía que el
    // saldo viejo era de recién.
    saldoLeidoEn: nuevo.saldo != null
      ? new Date().toISOString()
      : (viejo ? (viejo.saldoLeidoEn || viejo.actualizado || null) : null),
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
    // ---- fotos de perfil ----
    //
    // Instagram bloquea que otro sitio muestre sus fotos: cargan desde
    // instagram.com y no desde nook-a01.github.io (probado). El bloqueo mira
    // de qué página viene el pedido, y el Worker no es una página: pide la
    // imagen de servidor a servidor y se la pasa al teléfono.
    //
    // Esta ruta NO pide clave a propósito: va en el atributo src de una
    // imagen, donde no se pueden mandar cabeceras. A cambio no expone nada:
    // recibe un nombre de usuario y devuelve una foto de perfil, que ya es
    // pública en Instagram.
    if (url.pathname === "/foto") {
      const quien = (url.searchParams.get("u") || "").toLowerCase();
      if (!/^[a-z0-9._]{1,40}$/.test(quien)) return new Response("", { status: 400 });
      // Con ?c= la foto sale del escaneo de esa persona; sin él, del tuyo.
      const cod = (url.searchParams.get("c") || "").toLowerCase();
      const deQuien = /^[a-f0-9]{32}$/.test(cod) ? "ig:" + cod : "instagram";
      const guardado = JSON.parse((await env.PLATA.get(deQuien)) || "null");
      const cuenta = guardado && (guardado.users || []).find(u => (u.username||"").toLowerCase() === quien);
      const foto = cuenta && cuenta.profile_pic_url;
      if (!foto) return new Response("", { status: 404 });
      const r = await fetch(foto, {
        headers: { "user-agent": "Mozilla/5.0", referer: "https://www.instagram.com/" },
        cf: { cacheTtl: 3600, cacheEverything: true },
      });
      if (!r.ok) return new Response("", { status: 404 });
      return new Response(r.body, {
        headers: {
          "content-type": r.headers.get("content-type") || "image/jpeg",
          "cache-control": "public, max-age=3600",
          "access-control-allow-origin": "*",
        },
      });
    }

    // ---- el panel de Instagram de cada persona ----
    //
    // A quien le pasás el panel no le das tu clave (con ella vería tu plata).
    // Cada uno ve SUS resultados en SU celular con un enlace propio que lleva un
    // código de 32 caracteres al azar: ese código es la llave, así que esta ruta
    // no pide clave. Lo arma su compu la primera vez, después de pedirle permiso.
    //
    // Frenos, porque esta ruta está abierta y comparte depósito con Plata:
    //   · el código tiene que ser 32 hexadecimales (no se adivina);
    //   · el cuerpo tiene que tener forma de escaneo y un tope de tamaño;
    //   · un enlace no se puede pisar con OTRA cuenta de Instagram;
    //   · una subida cada 10 minutos por enlace (el depósito gratis tiene
    //     1.000 escrituras por día y Plata también las usa);
    //   · se borra solo a los 90 días sin escanear, y la persona lo puede
    //     borrar cuando quiera (DELETE).
    const mIg = /^\/ig\/([a-f0-9]{32})$/.exec(url.pathname);
    if (mIg) {
      const k = "ig:" + mIg[1];
      if (request.method === "GET") {
        const g = await env.PLATA.get(k);
        if (!g) return json({ error: "Todavía no hay nada con este enlace." }, 404);
        return new Response(g, { headers: cabeceras });
      }
      if (request.method === "DELETE") {
        await env.PLATA.delete(k);
        return json({ ok: true, borrado: true });
      }
      if (request.method === "POST") {
        if (Number(request.headers.get("content-length") || 0) > 6000000)
          return json({ error: "Demasiado grande." }, 413);
        let e;
        try { e = await request.json(); } catch { return json({ error: "Eso no parece un escaneo." }, 400); }
        if (!e || !Array.isArray(e.users) || e.users.length > 20000 ||
            typeof e.usuario !== "string" || !/^[A-Za-z0-9._]{1,30}$/.test(e.usuario))
          return json({ error: "Eso no parece un escaneo." }, 400);
        const previo = JSON.parse((await env.PLATA.get(k)) || "null");
        if (previo && previo.usuario && previo.usuario.toLowerCase() !== e.usuario.toLowerCase())
          return json({ error: "Este enlace es de otra cuenta de Instagram." }, 409);
        if (previo && !e.users.length) return json({ ok: true, conservado: true });
        if (previo && previo.actualizado && Date.now() - Date.parse(previo.actualizado) < 10 * 60e3)
          return json({ ok: true, conservado: true, motivo: "Se subió hace menos de 10 minutos." });
        e.actualizado = new Date().toISOString();
        await env.PLATA.put(k, JSON.stringify(e), { expirationTtl: 90 * 24 * 3600 });
        return json({ ok: true, cuentas: e.users.length });
      }
      return json({ error: "Usá GET, POST o DELETE." }, 405);
    }

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

      // ---- el estado de la app, compartido entre el celular y la compu ----
      //
      // Antes la app intentaba guardar con la API de Artifacts de Claude, que no
      // existe en GitHub Pages: siempre fallaba y quedaba “guardado en este
      // dispositivo”. Cada aparato tenía su propia copia y nunca se encontraban.
      if (url.pathname === "/app") {
        if (request.method === "GET") {
          const guardado = await env.PLATA.get("app");
          if (!guardado) return json({ error: "Todavía no hay estado guardado." }, 404);
          return new Response(guardado, { headers: cabeceras });
        }
        if (request.method === "POST") {
          const entrante = await request.json();
          if (!entrante || !Array.isArray(entrante.cats))
            return json({ error: "Eso no parece un estado de la app." }, 400);

          const previo = JSON.parse((await env.PLATA.get("app")) || "null");

          // Una pestaña abierta hace horas tiene el estado viejo en memoria. Al
          // guardar le pone la fecha de ahora, así que "gana el más nuevo" la
          // dejaba pisar todo lo que se había hecho mientras tanto. Por eso el
          // que escribe manda también la versión sobre la que venía trabajando
          // (baseUpdatedAt): si mientras tanto otro guardó algo distinto, no se
          // pisa, se le devuelve lo guardado para que lo adopte.
          const base = entrante.baseUpdatedAt;
          if (previo && base !== undefined && (previo.updatedAt || null) !== (base || null))
            return json({ ok: true, conservado: true, estado: previo });

          // Sin baseUpdatedAt (una app vieja que todavía no se actualizó) queda
          // la regla anterior: gana el más nuevo.
          const tPrevio   = previo   ? new Date(previo.updatedAt   || 0).getTime() : -1;
          const tEntrante = new Date(entrante.updatedAt || 0).getTime();
          if (previo && base === undefined && tPrevio > tEntrante)
            return json({ ok: true, conservado: true, estado: previo });

          delete entrante.baseUpdatedAt;

          await env.PLATA.put("app", JSON.stringify(entrante));
          return json({ ok: true, conservado: false, guardadoEn: entrante.updatedAt });
        }
        return json({ error: "Usá GET o POST." }, 405);
      }

      // ---- la tarjeta de crédito: cuánto va del resumen en curso ----
      //
      // Lo que gasta con la tarjeta no sale de su saldo: se le descuenta de la
      // plata que le pasan el mes siguiente. El único que tiene el total del
      // resumen en curso es el banco, así que lo manda el lector desde su
      // página de BBVA.
      if (url.pathname === "/tarjeta") {
        if (request.method === "GET") {
          const g = await env.PLATA.get("tarjeta");
          if (!g) return json({ error: "Todavía no se leyó la tarjeta." }, 404);
          return new Response(g, { headers: cabeceras });
        }
        if (request.method === "POST") {
          const e = await request.json();
          if (!e || typeof e.pesos !== "number") return json({ error: "Eso no parece un consumo de tarjeta." }, 400);
          e.leidoEn = new Date().toISOString();
          await env.PLATA.put("tarjeta", JSON.stringify(e));
          return json({ ok: true, pesos: e.pesos, cierre: e.cierre || null });
        }
        return json({ error: "Usá GET o POST." }, 405);
      }

      // ---- campamento: qué días del plan marcaste ----
      if (url.pathname === "/campamento") {
        if (request.method === "GET") {
          const g = await env.PLATA.get("campamento");
          return new Response(g || JSON.stringify({ hechos: [] }), { headers: cabeceras });
        }
        if (request.method === "POST") {
          const e = await request.json();
          if (!e || !Array.isArray(e.hechos)) return json({ error: "Falta la lista de días." }, 400);
          // Unión con lo guardado: marcar en un aparato no desmarca en el otro.
          const previo = JSON.parse((await env.PLATA.get("campamento")) || "null");
          const juntos = new Set([...(previo && previo.hechos || []), ...e.hechos]
            .map(Number).filter(n => n >= 1 && n <= 30));
          const guardar = { hechos: [...juntos].sort((a, b) => a - b), actualizado: new Date().toISOString() };
          await env.PLATA.put("campamento", JSON.stringify(guardar));
          return json({ ok: true, hechos: guardar.hechos.length });
        }
        return json({ error: "Usá GET o POST." }, 405);
      }

      // ---- marcador en vivo: qué resultado se avisó por última vez ----
      //
      // Vive acá y no en el repositorio a propósito: la tarea corre cada 5
      // minutos y guardar el estado en git dejaría decenas de commits por
      // partido, que es justo el ruido que ya hubo que limpiar una vez.
      if (url.pathname === "/vivos") {
        if (request.method === "GET") {
          const g = await env.PLATA.get("vivos");
          return new Response(g || "{}", { headers: cabeceras });
        }
        if (request.method === "POST") {
          const e = await request.json();
          if (!e || typeof e !== "object") return json({ error: "Cuerpo inválido." }, 400);
          await env.PLATA.put("vivos", JSON.stringify(e));
          return json({ ok: true, partidos: Object.keys(e).length });
        }
        return json({ error: "Usá GET o POST." }, 405);
      }

      // ---- panel de Instagram: lo leído desde la computadora ----
      //
      // En iPhone no hay forma de leer Instagram: Apple no deja instalar apps
      // fuera de su tienda, y una página web no puede entrar a la sesión de
      // Instagram (X-Frame-Options: DENY, y sin CORS). Así que lee la compu y
      // el teléfono muestra lo leído. Es la misma idea que el lector de
      // Mercado Pago.
      if (url.pathname === "/instagram") {
        if (request.method === "GET") {
          const g = await env.PLATA.get("instagram");
          if (!g) return json({ error: "Todavía no escaneaste desde la computadora." }, 404);
          return new Response(g, { headers: cabeceras });
        }
        if (request.method === "POST") {
          const e = await request.json();
          if (!e || !Array.isArray(e.users))
            return json({ error: "Eso no parece un escaneo." }, 400);
          // Una lectura vacía no debe borrar la anterior: si el escaneo falló,
          // mejor mostrar en el celular lo de ayer que nada.
          if (!e.users.length) {
            const previo = await env.PLATA.get("instagram");
            if (previo) return json({ ok: true, conservado: true });
          }
          e.actualizado = new Date().toISOString();
          await env.PLATA.put("instagram", JSON.stringify(e));
          return json({ ok: true, cuentas: e.users.length });
        }
        return json({ error: "Usá GET o POST." }, 405);
      }

      return json({ error: "Ruta desconocida", rutas: ["POST /guardar", "GET /datos", "GET/POST /tarjeta", "GET /estado", "GET /semilla", "GET/POST /app", "GET/POST /campamento", "GET/POST /vivos", "GET/POST /instagram"] }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
