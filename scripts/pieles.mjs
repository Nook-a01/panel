// Le cambia la piel a las tres secciones nuevas.
//
// Antes las tres eran lo mismo: tarjetas oscuras con la tipografía del
// sistema y esquinas redondeadas. Se distinguían por el color del acento
// y nada más. Ahora cada una vive en un mundo propio:
//
//   02 · Plata en Mano  → un diario. Papel crema, tipografía con serifa,
//                         filetes de un pelo, cero sombras, mucho aire.
//   03 · Instagram      → un afiche brutalista. Negro puro, verde ácido,
//                         bordes duros de 2 px, mayúsculas pesadas, cero
//                         redondeos y cero degradados.
//   04 · Campamento     → un cuaderno de taller. Papel arena, tinta
//                         marrón, bordes gruesos con sombra dura de
//                         calcomanía, esquinas bien redondeadas.
//
// Las tres se escriben al final del documento, así ganan por orden sin
// necesidad de llenar todo de !important: sólo lleva !important lo que
// tiene que barrer con una regla puesta en todos lados (los redondeos,
// las sombras, la tipografía base).
//
// Deportes no se toca: ya tiene su mundo, el retro maximalista.

import { readFileSync, writeFileSync } from "node:fs";

/* ═══════════════════════════════════════════════════════════════
   02 · PLATA EN MANO — el diario
   ═══════════════════════════════════════════════════════════════
   Referencia: pollen.design. Un balance es un documento, así que se
   ve como un documento impreso: papel, serifa, filetes, márgenes.
   Se queda en claro siempre, de día y de noche: los diarios no
   tienen modo oscuro. */
const PLATA = `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;500;600;700&display=swap">
<style id="piel-diario">
:root, :root[data-theme], :root:not([data-theme]){
  --bg:#F1ECE0;
  --surface:#FAF7EF; --surface-2:#EDE7D8; --surface-3:#E3DCC9;
  --ink:#171208; --ink-2:#4B4335; --ink-3:#6E6656;
  --line:#D4CCB8; --line-2:#B3AA93;
  --accent:#1C5B44; --accent-ink:#123B2C; --accent-soft:#DFE9E1;
  --warn:#8A5E10; --warn-soft:#F0E7D0;
  --crit:#8E2B22; --crit-soft:#F0DED9;
  --shadow:none;
  --radius:0;
  --f-display:'Fraunces', Georgia, 'Times New Roman', serif;
  --f-body:'IBM Plex Sans', system-ui, -apple-system, sans-serif;
  --f-mono:'IBM Plex Mono', ui-monospace, Menlo, monospace;
  color-scheme:light;
}

/* Un diario no tiene esquinas redondeadas ni sombras: tiene filetes.
   Esto barre con las dos cosas en toda la página de una vez. */
*, *::before, *::after{ border-radius:0 !important; box-shadow:none !important }

body{ background:var(--bg); color:var(--ink) }

/* ── la cabecera, como el encabezado de un diario ─────────────── */
header.top{
  background:var(--bg);
  border-bottom:3px double var(--ink);
  padding-bottom:.55rem;
}
header.top h1, header.top .marca, header.top strong:first-of-type{
  font-family:var(--f-display);
  font-weight:700;
  letter-spacing:-.025em;
}

/* ── la navegación: sin píldoras, subrayado como en un índice ─── */
nav.tabs{ border-bottom:1px solid var(--line); gap:0 }
nav.tabs a, nav.tabs button, .tabs .tab{
  background:none;
  border:0;
  border-bottom:2px solid transparent;
  padding:.55rem .9rem;
  font-family:var(--f-mono);
  font-size:.72rem;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:var(--ink-2);
}
nav.tabs a.on, nav.tabs a.active, nav.tabs .on, .tabs .tab.on{
  border-bottom-color:var(--ink);
  color:var(--ink);
  background:none;
}

/* ── nada de tarjetas: bloques separados por filetes ──────────── */
.card{
  background:transparent;
  border:0;
  border-top:1px solid var(--line);
  padding:1.4rem 0 1.6rem;
}
.card + .card{ margin-top:0 }

/* ── la cifra grande, en serifa y enorme ──────────────────────── */
.hero{
  background:transparent;
  border:0; border-top:3px double var(--ink); border-bottom:1px solid var(--line);
  /* El aire de la izquierda no es capricho: el bloque tiene una barra
     de color de 4 px pegada al borde (.hero::before, que marca si vas
     bien o mal de plata). Con menos relleno que eso, el texto arranca
     ABAJO de la barra y las primeras letras de cada renglón se ven
     tapadas, como si estuvieran cortadas. */
  padding:1.5rem 0 1.7rem 1.1rem;
}
.hero .big{
  font-family:var(--f-display);
  font-weight:600;
  font-size:clamp(3rem, 13vw, 5.6rem);
  letter-spacing:-.045em;
  line-height:.92;
  color:var(--ink);
  font-variant-numeric:lining-nums tabular-nums;
}
.hero .big.pos{ color:var(--accent) }
.hero .note{ font-family:var(--f-body); color:var(--ink-2); max-width:62ch }
.hero .note b{ color:var(--ink); font-weight:600 }

/* ── los recuadros de datos: columnas con filete, no cajas ────── */
.tiles{ border-top:1px solid var(--line) }
.tile{
  background:transparent;
  border:0;
  border-left:1px solid var(--line);
  padding:.9rem 1rem;
}
.tile:first-child{ border-left:0; padding-left:0 }
.tile .k{
  font-family:var(--f-mono);
  font-size:.63rem; letter-spacing:.14em; text-transform:uppercase;
  color:var(--ink-3);
}
.tile .v{
  font-family:var(--f-display);
  font-weight:600;
  letter-spacing:-.02em;
  color:var(--ink);
  font-variant-numeric:lining-nums tabular-nums;
}
.tile .v.pos{ color:var(--accent) }
.tile .s{ font-family:var(--f-body); color:var(--ink-3) }

/* ── títulos de sección: versalitas espaciadas, con filete ────── */
h2, h3, .card > h2:first-child{
  font-family:var(--f-display);
  font-weight:600;
  letter-spacing:-.015em;
  color:var(--ink);
}

/* ── botones: tipográficos, no de plástico ────────────────────── */
.btn{
  background:transparent;
  border:1px solid var(--ink);
  color:var(--ink);
  font-family:var(--f-mono);
  font-size:.72rem; letter-spacing:.08em; text-transform:uppercase;
  padding:.5em 1em;
  transition:background .18s ease, color .18s ease;
}
.btn:hover{ background:var(--ink); color:var(--bg) }
/* Va con :root adelante para empatarle en peso a la regla de modo
   oscuro de más arriba, que pinta este botón de verde muy oscuro. Sin
   esto quedaba texto casi negro sobre fondo casi negro: una mancha. */
:root .btn.pri{ background:var(--ink); color:var(--bg); border-color:var(--ink) }
:root .btn.pri:hover{ background:var(--accent); border-color:var(--accent); filter:none }
.btn.dgr{ border-color:var(--crit); color:var(--crit) }
/* Los botones chicos van en caja baja: en mayúsculas "Cobrado" no
   entra en su celda de la tabla y queda cortado a la mitad. */
.btn.sm{ text-transform:none; letter-spacing:.01em; padding:.4em .6em; font-size:.7rem }
.btn.dgr:hover{ background:var(--crit); color:var(--bg) }

/* ── tablas: como la tabla de cotizaciones de un diario ───────── */
table{ border-collapse:collapse; width:100% }
th{
  font-family:var(--f-mono);
  font-size:.63rem; letter-spacing:.13em; text-transform:uppercase;
  color:var(--ink-3);
  border-bottom:1px solid var(--ink);
  text-align:left; padding:.5rem .6rem;
}
td{ border-bottom:1px solid var(--line); padding:.6rem; }
tr:hover td{ background:var(--surface-2) }

/* ── etiquetas y píldoras: recuadro de un pelo ────────────────── */
.chip, .pill, .badge{
  background:transparent;
  border:1px solid var(--line-2);
  color:var(--ink-2);
  font-family:var(--f-mono);
  font-size:.65rem; letter-spacing:.08em; text-transform:uppercase;
  padding:.24em .6em;
}
.chip.ok{ border-color:var(--accent); color:var(--accent) }
.chip.warn{ border-color:var(--warn); color:var(--warn) }

/* ── las cifras, siempre en serifa y alineadas ────────────────── */
.money, .num, .v, .mono{
  font-variant-numeric:lining-nums tabular-nums;
}

/* ── el botón de volver, a tono ───────────────────────────────── */
.volver-panel{
  background:var(--bg);
  border:1px solid var(--ink);
  color:var(--ink);
  font-family:var(--f-mono);
  font-size:.68rem; letter-spacing:.1em; text-transform:uppercase;
}
</style>
<script>
  // El diario es siempre de papel: no tiene modo oscuro. Marcando el
  // documento como claro se desactivan de una las reglas nocturnas que
  // traía la app, en vez de ir peleándolas una por una.
  document.documentElement.dataset.theme = "light";
</script>
`;

/* ═══════════════════════════════════════════════════════════════
   03 · INSTAGRAM — el afiche brutalista
   ═══════════════════════════════════════════════════════════════
   Referencia: studio-size.com y animejs.com. Negro puro, verde
   ácido, bordes duros, mayúsculas pesadas. Se va el degradado
   violeta-naranja de Instagram a propósito: era lo que la hacía
   parecerse a las demás.

   Sin tipografías de Google: esta página tiene una política de
   contenido que prohíbe todo lo externo, y está bien que la tenga
   porque maneja datos de tu cuenta. Aflojarla para traer una fuente
   sería pagar privacidad por decoración. El peso brutalista se
   consigue igual con las del sistema: negrita máxima, mayúsculas y
   contraste. */
const INSTAGRAM = `
<style id="piel-afiche">
:root{
  --bg:#000; --card:#000; --chip:#0d0d0d;
  --text:#fff; --muted:#8b8b8b;
  --border:#fff;
  --g1:#CCFF00; --g2:#CCFF00; --g3:#FF2D7A;
  --red:#FF2D7A; --green:#CCFF00;
  --acido:#CCFF00; --shock:#FF2D7A;
  --f-tit:ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif;
  --f-mono:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme:dark;
}

/* Nada redondeado, nada difuminado: todo canto vivo. */
*, *::before, *::after{ border-radius:0 !important; box-shadow:none !important }

body{ background:#000; color:#fff }

/* ── títulos: mayúsculas, peso máximo, apretados ──────────────── */
/* El párrafo de entrada queda afuera de este grupo: un texto largo en
   mayúsculas no se lee, se descifra. Las mayúsculas son para lo que se
   mira, no para lo que se lee. */
h1, h2, h3, .big{
  font-family:var(--f-tit);
  font-weight:900;
  text-transform:uppercase;
  letter-spacing:-.02em;
  font-stretch:condensed;
  color:#fff;
  /* Se anula el degradado del título original: ahora el color es plano. */
  background:none;
  -webkit-background-clip:border-box;
  background-clip:border-box;
  -webkit-text-fill-color:#fff;
}
/* El título venía como fila flex sin permiso de cortar. Eso partía
   el texto en dos piezas sueltas: "Panel de" se acomodaba en dos
   renglones mientras "Instagram" seguía entero al costado, pegado al
   borde. Como bloque, el texto fluye como texto y corta donde toca. */
h1{
  display:block;
  font-size:clamp(1.55rem, 7.4vw, 3.4rem);
  line-height:.94;
}
h1 .dot{
  display:inline-block;
  vertical-align:-.08em;
  margin-right:.3em;
  width:.7em; height:.7em;
}
h2{
  font-size:clamp(1.1rem, 4vw, 1.5rem);
  border-bottom:3px solid #fff;
  padding-bottom:.3rem;
  margin-bottom:.9rem;
}
h3{ font-size:1rem; color:var(--acido) }

/* ── las tarjetas se vuelven bloques con borde duro ───────────── */
.card{
  background:#000;
  border:2px solid #fff;
  padding:1.1rem;
}

/* ── etiquetas al pie, en monoespaciada ───────────────────────── */
.muted, .kbd, .dot, small{
  font-family:var(--f-mono);
  font-size:.72rem;
  letter-spacing:.06em;
  color:var(--muted);
  text-transform:none;
}
.kbd{ border:1px solid #fff; color:#fff; padding:.1em .4em }

/* ── botones: bloque negro que se da vuelta al tocarlo ────────── */
.btn, button, .seg > *{
  background:#000;
  border:2px solid #fff;
  color:#fff;
  font-family:var(--f-tit);
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:.04em;
  padding:.55em 1.05em;
  transition:background .11s linear, color .11s linear;
}
.btn:hover, button:hover, .seg > *:hover{ background:var(--acido); color:#000 }
.btn:active, button:active{ background:var(--shock); color:#000 }

/* Las tres casillas de plataforma se reparten el ancho en partes
   iguales, así que en el celular cada una tiene unos 115 px. Con el
   espaciado de letras de los botones grandes, "COMPUTADORA" no entraba
   y quedaba cortada. Acá el texto manda sobre el estilo. */
.seg button{
  letter-spacing:0;
  font-size:clamp(.62rem, 3.1vw, .82rem);
  padding:.6em .25em;
  min-width:0;
}

/* El seleccionado va invertido: negro sobre ácido, sin medias tintas.
   Ojo con .plat.on: NO es una solapa, es el panel de contenido que se
   muestra debajo. Pintarlo dejaba media pantalla verde fosforescente. */
.seg button.on, .seg button.active, .tab.on{
  background:var(--acido);
  background-image:none;
  color:#000;
  border-color:var(--acido);
}
.lead{
  font-family:var(--f-tit);
  font-weight:500;
  color:var(--muted);
  max-width:62ch;
}

/* ── el botón grande de instalar: pierde el degradado ─────────── */
.bm, .bookmarklet, a[class*="bm"]{
  background:var(--acido) !important;
  color:#000 !important;
  border:2px solid var(--acido);
  font-family:var(--f-tit);
  font-weight:900;
  text-transform:uppercase;
  letter-spacing:.02em;
}

/* ── avisos: barra de color plano al costado ──────────────────── */
.warn, .tip, .safe{
  background:#0d0d0d;
  border:2px solid #fff;
  border-left:8px solid var(--shock);
  color:#fff;
}
.tip{ border-left-color:var(--acido) }

/* ── el punto de estado ───────────────────────────────────────── */
.dot{ background:var(--acido) }

/* ── enlaces: subrayado grueso, sin sutilezas ─────────────────── */
a{ color:var(--acido); text-decoration-thickness:2px; text-underline-offset:3px }

/* ── el botón de volver, invertido ────────────────────────────── */
.volver-panel{
  background:#000;
  border:2px solid var(--acido);
  color:var(--acido);
  font-family:var(--f-tit);
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:.06em;
}
.volver-panel:hover{ background:var(--acido); color:#000 }
</style>
`;

/* ═══════════════════════════════════════════════════════════════
   04 · CAMPAMENTO — el cuaderno de taller
   ═══════════════════════════════════════════════════════════════
   Papel arena, tinta marrón, bordes gruesos y sombra dura, sin
   difuminar, como una calcomanía pegada en la hoja. Es lo opuesto
   exacto del afiche de Instagram: allá cero redondeo y canto vivo,
   acá todo redondeado y con relieve. Y aunque también es claro como
   Plata, no se parecen en nada: Plata es serifa fina y filetes de
   un pelo; esto es palo seco gordo y bordes de 2 px. */
const CAMPAMENTO = `
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;700;800&display=swap">
<style id="piel-cuaderno">
:root{
  --bg:#E7DEC9;
  --surface:#FBF6E9; --surface2:#F3ECDA;
  --border:#241C13;
  --ink:#1F180F; --ink2:#5A4E3C; --ink3:#6D6150;
  --accent:#9C3D10; --accent-ink:#FFF7EC;
  --w1:#9C3D10; --w2:#6B4FA8; --w3:#2E7D5B; --w4:#C43B6B;
  --good:#2E7D5B;
  --resalte:#F5D547;
  --radius:16px;
  --f-tit:'Bricolage Grotesque', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color-scheme:light;
}

body{
  background:var(--bg);
  color:var(--ink);
  /* El renglón del cuaderno, muy tenue. */
  background-image:repeating-linear-gradient(
    to bottom, transparent 0 33px, rgba(36,28,19,.055) 33px 34px);
}

/* ── títulos con la palo seco gorda ───────────────────────────── */
h1, h2, h3, .day-title, .kicker, .dnum, .tab{
  font-family:var(--f-tit);
  letter-spacing:-.02em;
}
h1{ font-weight:800; font-size:clamp(1.8rem, 7vw, 2.9rem); line-height:1 }
h2{ font-weight:700 }
.kicker{
  font-weight:700; text-transform:uppercase; letter-spacing:.12em;
  font-size:.7rem; color:var(--accent);
}

/* ── todo bloque es una calcomanía: borde grueso y sombra dura ── */
.card, .res, .win, .note-grid > *, .day-head, section > div[class]{
  background:var(--surface);
  border:2px solid var(--border);
  border-radius:var(--radius);
  box-shadow:4px 4px 0 var(--border);
}

/* ── la cabecera ──────────────────────────────────────────────────
   Traía un degradado que arrancaba casi negro y terminaba en el color
   de fondo. Con el fondo oscuro de antes era una transición; con el
   papel arena queda una mancha oscura arriba y el título ilegible.
   Se reemplaza por el mismo papel, con un filete abajo que separa. */
header{
  background-image:none;
  background-color:var(--bg);
  border-bottom:2px solid var(--border);
}

/* ── el día de hoy, resaltado con marcador ────────────────────── */
.day-head{ background:var(--surface2) }
/* El resaltador va sobre el nombre del día, no sobre el bloque entero:
   .day-title es el contenedor de dos líneas, y pintarlo marcaba la de
   abajo. El trazo es una franja detrás del texto, no un recuadro, para
   que se lea como marcado a mano. */
.day-title .n{
  font-weight:800;
  background:linear-gradient(to top, var(--resalte) 0 42%, transparent 42%);
  display:inline;
  padding:0 .12em;
  color:var(--ink);
}
.day-title .g{ color:var(--ink2) }
.dnum{
  background:var(--accent);
  color:var(--accent-ink);
  border:2px solid var(--border);
  border-radius:12px;
  font-weight:800;
  box-shadow:3px 3px 0 var(--border);
}

/* ── la barra de solapas ──────────────────────────────────────────
   Tenía el gris escrito a mano, no por variable, así que no lo tocaba
   el cambio de paleta y quedaba una franja negra cruzando el papel. */
nav{
  background:var(--surface);
  border-bottom:2px solid var(--border);
  backdrop-filter:none; -webkit-backdrop-filter:none;
}

/* ── las solapas: botones gordos con relieve ──────────────────── */
.tabs{ gap:.55rem }
.tab{
  background:var(--surface);
  border:2px solid var(--border);
  border-radius:100px;
  color:var(--ink);
  font-weight:700;
  padding:.5em 1.05em;
  box-shadow:3px 3px 0 var(--border);
  transition:transform .13s cubic-bezier(.51,.01,.2,1), box-shadow .13s ease;
}
/* Al apretarlo se hunde: la sombra se achica y el botón baja. Es el
   gesto de un botón físico, que es de lo que va todo el cuaderno. */
.tab:hover{ transform:translate(-1px,-1px); box-shadow:4px 4px 0 var(--border) }
.tab:active{ transform:translate(3px,3px); box-shadow:0 0 0 var(--border) }
.tab.on, .tab.active{
  background:var(--accent);
  color:var(--accent-ink);
}

/* ── la barra de avance: un termómetro con borde ──────────────── */
.progress-row .prog, .prog{
  background:var(--surface);
  border:2px solid var(--border);
  border-radius:100px;
  overflow:hidden;
  box-shadow:3px 3px 0 var(--border);
}
.prog > *, .prog .bar{ background:var(--accent) }
.day-chip{
  background:var(--accent);
  color:var(--accent-ink);
  border:2px solid var(--border);
  border-radius:100px;
  font-family:var(--f-tit);
  font-weight:800;
  box-shadow:3px 3px 0 var(--border);
}

/* ── las etiquetas de color de cada semana ────────────────────── */
.pill, .week-dot{
  border:2px solid var(--border);
  border-radius:100px;
  font-family:var(--f-tit);
  font-weight:700;
  font-size:.7rem;
}

/* ── el monoespaciado de las notas musicales, como una etiqueta ─ */
.mono{
  background:var(--surface2);
  border:1px solid var(--border);
  border-radius:6px;
  padding:.1em .38em;
  color:var(--ink);
}

/* ── el recuadro de victoria del día ──────────────────────────── */
.win{
  background:#EAF3EC;
  border-color:var(--good);
  box-shadow:4px 4px 0 var(--good);
  color:var(--ink);
}

.muted{ color:var(--ink2) }

/* ── el botón de volver, con el mismo relieve ─────────────────── */
.volver-panel{
  background:var(--surface);
  border:2px solid var(--border);
  color:var(--accent);
  font-family:var(--f-tit);
  font-weight:800;
  box-shadow:3px 3px 0 var(--border);
}
.volver-panel:active{ transform:translate(3px,3px); box-shadow:0 0 0 var(--border) }
</style>
`;

/* ─────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════
   Lo que necesitan las tres por igual: el borde de la pantalla.
   ═══════════════════════════════════════════════════════════════
   Instalado en el iPhone, el Panel ocupa la pantalla entera y el
   reloj y la batería quedan ENCIMA de la página, no arriba. Sin
   contemplarlo, el título de la sección aparece abajo del reloj.
   Deportes ya lo tenía resuelto; estas tres no.

   Son dos cosas distintas y hacen falta las dos:
     · el relleno, para que el contenido arranque más abajo
     · la franja fija, porque el relleno se va con el desplazamiento
       y sin ella el texto vuelve a pasar por debajo del reloj

   Abajo pasa lo mismo con la barra del gesto de inicio, y encima
   está el botón de volver, que es fijo: por eso el relleno inferior
   suma su altura. */
const ZONA_SEGURA = (fondo, opciones = {}) => `
body{
  padding-top:env(safe-area-inset-top);
  padding-bottom:calc(env(safe-area-inset-bottom) + 3.6rem);
}
body::before{
  content:"";
  position:fixed; top:0; left:0; right:0;
  height:env(safe-area-inset-top);
  background:${fondo};
  z-index:9998;
  pointer-events:none;
}
${opciones.pegajoso ? `
/* La barra que queda pegada arriba tiene que frenar debajo del reloj,
   no en el borde de la pantalla. */
${opciones.pegajoso}{ top:env(safe-area-inset-top) }
` : ""}
/* El botón de volver se aparta al bajar. Es fijo, así que si se queda
   quieto tapa lo que haya debajo — y no es adorno lo que tapa: en
   Instagram cubría el botón de elegir plataforma, que hay que poder
   tocar. Baja al desplazarse hacia abajo y vuelve al subir, que es
   cuando lo estás buscando. */
.volver-panel{
  transition:transform .28s cubic-bezier(.51,.01,.2,1), opacity .2s ease;
}
.volver-panel.escondido{
  transform:translateY(160%);
  opacity:0;
  pointer-events:none;
}
@media (prefers-reduced-motion:reduce){
  .volver-panel.escondido{ transform:none; opacity:1; pointer-events:auto }
}
`;

/* El poquito de código que lo mueve. Va aparte del CSS porque hace
   falta saber para qué lado se está desplazando, y eso no se puede
   preguntar desde una hoja de estilos. */
const GUION_VOLVER = `
<script>
(() => {
  const b = document.querySelector(".volver-panel");
  if (!b) return;
  let ultimo = window.scrollY, pendiente = false;

  const revisar = () => {
    pendiente = false;
    const y = window.scrollY;
    // Arriba de todo siempre se muestra, y los movimientos de menos de
    // 6 px se ignoran: si no, el botón tiembla con el rebote del dedo.
    if (y < 60) b.classList.remove("escondido");
    else if (Math.abs(y - ultimo) > 6) b.classList.toggle("escondido", y > ultimo);
    ultimo = y;
  };

  addEventListener("scroll", () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(revisar);
  }, { passive: true });
})();
</script>
`;

const PIELES = [
  { archivo: "docs/plata/index.html",      marca: "piel-diario",   css: PLATA,      nombre: "02 Plata → diario",
    fondo: "var(--bg)" },
  { archivo: "docs/instagram/index.html",  marca: "piel-afiche",   css: INSTAGRAM,  nombre: "03 Instagram → afiche",
    fondo: "#000" },
  { archivo: "docs/campamento/index.html", marca: "piel-cuaderno", css: CAMPAMENTO, nombre: "04 Campamento → cuaderno",
    fondo: "var(--bg)", pegajoso: "nav" },
];

for (const p of PIELES) {
  let html = readFileSync(p.archivo, "utf8");

  // La piel es varias cosas seguidas: la fuente, los estilos y un poco
  // de código. Se envuelve entre dos comentarios para poder sacarla
  // entera y volver a ponerla sin que se duplique. Antes se buscaba
  // sólo el <style>, y todo lo que viniera después quedaba pegado dos
  // veces cada vez que se corría esto.
  const ABRE  = `<!-- piel: ${p.marca} -->`;
  const CIERRA = `<!-- /piel: ${p.marca} -->`;

  const i = html.indexOf(ABRE), j = html.indexOf(CIERRA);
  if (i >= 0 && j > i) {
    html = html.slice(0, i) + html.slice(j + CIERRA.length);
  } else {
    // Limpieza de la versión anterior, la que se ponía sin marcadores.
    // Sin esto, la primera corrida con el sistema nuevo dejaría las dos
    // pegadas una atrás de la otra.
    const e = html.indexOf(`<style id="${p.marca}">`);
    if (e >= 0) {
      let desde = e;
      const link = html.lastIndexOf("<link rel=\"preconnect\"", e);
      if (link >= 0 && e - link < 400) desde = link;   // la fuente venía justo antes

      let hasta = html.indexOf("</style>", e) + "</style>".length;
      // Plata traía además un <script> pegado atrás.
      const resto = html.slice(hasta, hasta + 300);
      const s = resto.indexOf("<script>");
      if (s >= 0 && s < 5) hasta = html.indexOf("</script>", hasta) + "</script>".length;

      html = html.slice(0, desde) + html.slice(hasta);
      console.log(`  · ${p.nombre}: saqué la versión anterior`);
    }
  }

  // Las reglas del borde de la pantalla entran adentro del mismo
  // <style>, justo antes de cerrarlo.
  const cuerpo = p.css.replace(
    "</style>",
    ZONA_SEGURA(p.fondo, { pegajoso: p.pegajoso }) + "</style>"
  ) + GUION_VOLVER;

  // Va al final del documento: así gana por orden, sin llenar de
  // !important reglas que ya estaban bien.
  const bloque = ABRE + cuerpo + CIERRA;
  const cierre = html.lastIndexOf("</body>");
  html = cierre >= 0
    ? html.slice(0, cierre) + bloque + html.slice(cierre)
    : html + bloque;

  writeFileSync(p.archivo, html);
  console.log(`✓ ${p.nombre}`);
}
