// Reescribe las instrucciones de iPhone de la página de instalación.
//
// POR QUÉ
// Instalarlo en el celular era lo peor de todo: copiar 110 KB, crear un
// marcador, editarlo, borrarle la dirección, pegar, renombrarlo, y después
// escribir "panel" en la barra cada vez que lo querés usar.
//
// La app Atajos hace eso mucho mejor y ya estaba en la página, pero
// escondida en un desplegable como si fuera el plan B. Es al revés:
//
//   · para USARLO   → Compartir → el atajo. Dos toques, sin escribir nada.
//   · para PASARLO  → un atajo se comparte por un enlace de iCloud. La otra
//                     persona lo abre, toca Añadir, y ya está. Nunca ve un
//                     código ni pega nada.
//
// Ese segundo punto es el que cambia el juego: vos lo armás UNA vez y todos
// los demás lo instalan en tres toques.

import { readFileSync, writeFileSync } from "node:fs";

const P = "docs/instagram/index.html";
let s = readFileSync(P, "utf8");

const desde = s.indexOf(`    <div class="plat" id="p-ios">`);
if (desde < 0) { console.error("✗ no encontré la solapa de iPhone"); process.exit(1); }
const cierre = s.indexOf(`\n    </div>`, desde);
if (cierre < 0) { console.error("✗ no encontré dónde cierra"); process.exit(1); }

const nuevo = `    <div class="plat" id="p-ios">
      <p class="muted" style="margin:0 0 16px">Tenés que tener la sesión abierta en <b>Safari</b> (instagram.com), no en la app de Instagram.</p>

      <div style="border:2px solid #CCFF00;padding:14px;margin-bottom:18px">
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">
          <span style="background:#CCFF00;color:#000;font-weight:900;font-size:.6rem;letter-spacing:.1em;padding:.2em .5em">Recomendado</span>
          <b>Con la app Atajos</b>
        </div>
        <p class="muted" style="margin:0 0 12px;font-size:.9rem">
          Se arma una vez y después se usa desde <b>Compartir</b>, con dos toques.
          Sin escribir nada en la barra de direcciones.
        </p>
        <button class="big" id="copyRawI">📋 Copiar el código</button>
        <ol style="margin-top:16px">
          <li>Abrí la app <b>Atajos</b> (viene con el iPhone) y tocá <b>+</b> arriba a la derecha.</li>
          <li>Tocá <b>Añadir acción</b>, buscá <code>JavaScript</code> y elegí <b>Ejecutar JavaScript en la página web</b>.</li>
          <li>Tocá el recuadro del código, borrá lo que diga, y <b>pegá</b> lo que copiaste arriba.</li>
          <li>Tocá la <b>flechita ⌄</b> arriba → <b>Detalles</b> → activá <b>Mostrar en menú de compartir</b>.</li>
          <li>Ponele de nombre <code>Panel</code> y tocá <b>Listo</b>.</li>
        </ol>
        <p class="tip" style="margin-top:14px">
          <b>Para usarlo:</b> entrá a instagram.com en Safari, tocá <b>compartir</b> (el cuadradito con la flecha)
          y elegí <b>Panel</b>. La primera vez te va a pedir permiso: aceptá.
        </p>
      </div>

      <details>
        <summary>Otra opción: como marcador (más pasos)</summary>
        <p style="margin:12px 0"><button class="btn" id="copyBmI">📋 Copiar el código del marcador</button></p>
        <ol>
          <li>En Safari, entrá a cualquier página, tocá <b>compartir</b> y elegí <b>"Añadir marcador"</b>. Guardalo.</li>
          <li>Tocá el ícono de <b>marcadores 📖</b>, después <b>Editar</b>, y elegí el que creaste.</li>
          <li>Borrá la dirección, pegá el código, y ponele de nombre <code>panel</code>.</li>
          <li>Entrá a instagram.com, escribí <code>panel</code> en la barra de direcciones y tocá el marcador que aparece.</li>
        </ol>
        <p class="tip"><b>Lo que más falla:</b> el código tiene que empezar con <code>javascript:</code>. Si al pegar te lo borra, escribilo a mano justo antes de lo que pegaste.</p>
      </details>

      <div style="border:2px solid #333;padding:14px;margin-top:18px">
        <b style="display:block;margin-bottom:.5rem">📤 Pasárselo a otra persona</b>
        <p class="muted" style="margin:0;font-size:.9rem;line-height:1.6">
          Una vez que tenés el atajo armado, no hace falta que nadie más repita todo esto.
          En <b>Atajos</b>, mantené apretado el tuyo → <b>Compartir</b> → <b>Copiar enlace de iCloud</b>.
          Pasá ese enlace y la otra persona sólo abre, toca <b>Añadir atajo</b>, y listo:
          nunca ve un código ni pega nada.
        </p>
        <p class="muted" style="margin:.7rem 0 0;font-size:.82rem">
          Ojo: el atajo lleva el código adentro. Si más adelante sale una versión nueva,
          hay que rehacerlo y volver a compartir el enlace.
        </p>
      </div>
    </div>`;

s = s.slice(0, desde) + nuevo + s.slice(cierre + "\n    </div>".length);
writeFileSync(P, s);
console.log("✓ iPhone: los Atajos pasan al frente, con cómo compartirlo");
