# Worker de Plata

El depósito compartido entre tu computadora y tu celular.

## Por qué existe

La app de plata es un sitio estático **público**, y tiene que funcionar en los dos
aparatos. Tus movimientos no pueden vivir en el repositorio: cualquiera los vería.
Este Worker los guarda en un lugar privado de Cloudflare al que la app entra con
una clave que vos escribís una sola vez en cada aparato.

## Por qué no habla con la API de Mercado Pago

La primera versión la usaba. El diagnóstico del 11/9/2026 mostró que no sirve
para esto:

| Endpoint | Respuesta |
|---|---|
| `/v1/account/movements/search` | 404 — no existe públicamente |
| `/users/me/mercadopago_account/balance` | 403 — vedado para tokens de aplicación |
| `/v1/payments/search` | 200 pero vacío — es para comercios que cobran |

Esa API está hecha para vender, no para leer tus finanzas personales. **No hace
falta ningún token de Mercado Pago.**

## Cómo llegan los datos entonces

```
Vos entrás a mercadopago.com.ar en la computadora
        ↓  el lector corre dentro de la página, con tu sesión ya abierta
        ↓  lee saldo, movimientos, resumen del mes y categorías
   POST /guardar  →  este Worker
        ↓
   GET /datos  ←  la app, en la compu y en el celular
```

El lector es `docs/plata/lector-mp.user.js` y corre con Violentmonkey. Misma
técnica que el Panel de Instagram: no necesita tu contraseña ni un token.

## Qué es público y qué no

| | Dónde vive | ¿Es público? |
|---|---|---|
| Código del Worker | este repositorio | **sí**, y está bien: no tiene secretos |
| `CLAVE_APP` | secreto de Cloudflare + tu navegador | no |
| Tus movimientos | KV de Cloudflare | no, se piden con la clave |

**Nunca** pongas la clave en `wrangler.toml`, en el código, ni en un commit.

## Puesta en marcha

Desde `worker-plata/`:

```bash
# 1. Entrar a tu cuenta de Cloudflare (abre el navegador)
npx wrangler login

# 2. Crear el almacenamiento y copiar el id que devuelve a wrangler.toml
npx wrangler kv namespace create PLATA

# 3. Cargar la clave (la pide por teclado, no queda en el historial)
npx wrangler secret put CLAVE_APP

# 4. Publicar
npx wrangler deploy
```

## Rutas

Todas piden la cabecera `Authorization: Bearer <CLAVE_APP>`.

| Ruta | Para qué |
|---|---|
| `POST /guardar` | El lector manda lo que leyó de Mercado Pago |
| `GET /datos` | La app pide lo último guardado |
| `GET /estado` | Cuándo se leyó por última vez, sin exponer importes |

No hay tarea programada: los datos llegan cuando el lector corre en tu navegador.

## Por qué fusiona en vez de reemplazar

El lector manda lo que ve en pantalla, que son los últimos movimientos. Si cada
lectura reemplazara todo, el historial se borraría. Por eso se fusionan por el id
que Mercado Pago le da a cada movimiento, y los entrantes pisan a los viejos
(si un movimiento cambió de estado, vale el nuevo).

Además, una lectura vacía se rechaza con 400 en vez de guardarse: si la página
todavía no cargó, no tiene que borrar lo que ya había.
