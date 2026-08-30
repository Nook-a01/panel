# Panel

Mis páginas personales en una sola app: **nook-a01.github.io/panel**

| | Sección | Qué es |
|---|---|---|
| 01 | **Deportes** | Calendario anual de Boca, la Selección, Inter Miami, la Fórmula 1, los Pumas y el UFC, con avisos al celular antes de cada partido. |
| 02 | **Plata en Mano** | Sueldos, cuotas y gastos fijos: cuánto entra, cuánto sale y cuánto queda libre. |
| 03 | **Instagram** | El panel de la cuenta: quién no te sigue de vuelta, quién ve tus historias y cómo crece. |
| 04 | **Campamento** | El plan de 30 días de producción musical, día por día. |

Cada sección tiene su propia estética. La portada las muestra a las cuatro
con sus colores, así entrar en una no es un salto.

## Cómo se guarda cada cosa

- **Deportes** baja los datos solo (GitHub Actions y, de respaldo, el
  Programador de tareas de Windows) y los deja en `docs/deportes/data/`.
- **Plata en Mano** guarda en el teléfono o la computadora donde la usás.
  Para pasar los datos de un lado a otro está **Importar / Exportar**.
- **Instagram** y **Campamento** no guardan nada: se leen y listo.

## Los avisos

Una sola instalación y un solo permiso: el service worker vive en
`docs/sw.js` y manda en todo el Panel. Los avisos de Deportes abren
directamente esa sección.

Para que lleguen al iPhone hay que **agregar el Panel a la pantalla de
inicio** — Safari no deja mandar avisos a una pestaña común.

## Tocar el proyecto

Todo lo que se configura está en `config.mjs`: equipos, colores,
con cuánta anticipación avisar.

```
npm install
npm run serve      # levanta el Panel en localhost:8080
node scripts/fetch.mjs      # baja los datos de Deportes
node scripts/send-push.mjs --dry-run   # muestra qué avisos saldrían
```

Al publicar cambios de estilos o scripts, subir el número de
`panel-v…` en `docs/sw.js` y correr `node scripts/versionar.mjs`.
Sin eso el navegador sigue sirviendo los archivos viejos hasta diez
minutos.
