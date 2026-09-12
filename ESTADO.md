# Dónde quedó el panel

Resumen para retomar desde cualquier lado (celular, otra PC, otra sesión).
Sin datos personales: este repo es público.

## Las cinco apps

| App | Dónde | Estado |
|---|---|---|
| Deportes | `docs/deportes/` | Andando. Marcador en vivo por ESPN + aviso push que se actualiza solo. |
| Plata | `docs/plata/` | Andando. Responsive arreglado, historial arreglado, sección Consultas contesta sin pagar nada. |
| Campamento | `docs/campamento/` | Andando. Diseño rehecho; el día actual es el primero sin marcar, no la fecha del calendario. |
| Instagram | `docs/instagram/` | Andando. `resultados.html` es el panel del teléfono: 6 pestañas, fotos por proxy, de a 20 perfiles. |
| Estudio | `docs/musica/` | Empezada. Suena la idea, se la manda a FL Studio por MIDI y la baja en `.mid`. La conversación va por Claude, no hay modelo adentro. |

Publicado en `nook-a01.github.io/panel/`.

## Reglas que no se rompen

1. **Nada de plata en `docs/`.** El repo es público. Los datos financieros van al KV del Worker.
   Se filtraron una vez (96 movimientos, 38 nombres reales, 12 días expuestos) y hubo que reescribir el historial de git.
2. **Nada que haya que pagar.** Todo lo que se sume tiene que ser gratis.
3. Los `.exe` se arman en GitHub Actions, no localmente: la regla ASR de Windows bloquea leer un ejecutable recién compilado.

## El Worker

`worker-plata/` en Cloudflare. Rutas: `/guardar`, `/datos`, `/estado`, `/semilla`, `/app`,
`/campamento`, `/vivos`, `/instagram`, `/foto`.

Todas piden `Authorization: Bearer <CLAVE_APP>` **menos `/foto`**, que va suelta a propósito:
un `<img src>` no puede mandar encabezados.

## Automático

- `.github/workflows/vivo.yml` — avisa los goles mientras hay partido.
- `.github/workflows/programa.yml` — compila el programa de escritorio.
- Los reportes salen solos el día 1 de cada mes.

## Lo que falta

- **Estudio**: falta el envío en vivo probado contra FL Studio de verdad, y Blender, que quedó para después.
- Ticket de GitHub #4748144: esperando respuesta, no hay nada que hacer.
- Ofrecidos y sin contestar: un `.apk` de Android, y una versión Mac del programa de escritorio.
