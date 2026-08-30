// Deja la página de Instagram lista para repartir: sin nada tuyo a la vista
// y con la pestaña puente reducida a un parpadeo.
//
// Tres cosas:
//
//  1. Se van el botón "← Panel" y el enlace al Tablero. Esa página la ve la
//     gente a la que le pasás el panel: no tiene por qué encontrar la puerta
//     de tu tablero ni de tus otras secciones. El tablero sigue estando, pero
//     hay que saber la dirección.
//
//  2. La pestaña puente deja de mostrar el "¡Listo, @usuario!" y se cierra en
//     cuanto termina de mandar. Instagram no deja otra salida, así que la
//     pestaña TIENE que abrirse; lo que sí se puede es que no se note.
//
//  3. Una visita suelta a la página deja de contar como "abrió el panel".
//     Eso era lo que llenaba el tablero de gente "sin nombre": alguien mira
//     la página de instalación y quedaba anotado igual que quien usó el panel.
//     Ahora esas visitas van con su propio nombre y no se mezclan.

import { readFileSync, writeFileSync } from "node:fs";

const P = "docs/instagram/index.html";
let s = readFileSync(P, "utf8");
let hechos = 0;

const cambiar = (viejo, nuevo, que) => {
  if (!s.includes(viejo)) { console.error("  ✗ no encontré: " + que); return; }
  s = s.split(viejo).join(nuevo);
  hechos++;
  console.log("  ✓ " + que);
};

/* ─── 1. fuera el botón de volver ─── */
cambiar(
  `<a class="volver-panel" href="../" aria-label="Volver al Panel"><span aria-hidden="true">←</span>Panel</a>`,
  `<!-- El botón de volver al Panel no va acá: esta página la ve gente de
       afuera y no tiene por qué llegar a tus otras secciones. -->`,
  "sacado el botón ← Panel"
);

/* ─── 2. fuera el enlace al tablero ─── */
{
  const desde = s.indexOf(`<div id="ir-al-tablero"`);
  if (desde < 0) console.error("  ✗ no encontré el enlace al Tablero");
  else {
    const hasta = s.indexOf("</div>", s.indexOf("</a>", desde)) + "</div>".length;
    s = s.slice(0, desde) +
      `<!-- El enlace al Tablero se sacó a propósito: es tuyo, no de quien
     instala el panel. Se entra por la dirección directa. -->` +
      s.slice(hasta);
    hechos++;
    console.log("  ✓ sacado el enlace al Tablero");
  }
}

/* ─── 3 y 4. la pestaña puente: sin cartel y cerrándose enseguida ─── */
cambiar(
`if(usuarioPanel){
  var w=document.querySelector('.wrap');
  if(w){
    w.innerHTML='<div style="text-align:center;padding:70px 20px">'+
      '<div style="font-size:2.8rem">💜</div>'+
      '<h2 style="margin:16px 0 8px;border:0;padding:0">¡Listo, @'+usuarioPanel+'!</h2>'+
      '<p class="muted">Ya podés volver al panel.<br>Esta pestaña se cierra sola.</p></div>';
  }
  programarCierre(2500); // se posterga solo si arranca una sincronización
} else if(esSyncTab){
  var w2=document.querySelector('.wrap');
  if(w2) w2.innerHTML='<div style="text-align:center;padding:70px 20px"><div style="font-size:2.8rem">🔄</div>'+
    '<h2 style="margin:16px 0 8px;border:0;padding:0">Sincronizando…</h2>'+
    '<p class="muted">Esta pestaña se cierra sola.</p></div>';
}`,
`if(usuarioPanel || esSyncTab){
  // Sin cartel y sin espera. Instagram no deja otra salida que abrir esta
  // pestaña, así que va a aparecer sí o sí; lo que sí se puede es que no se
  // note. Antes mostraba "¡Listo, @usuario!" durante 2,5 segundos: está bien
  // la primera vez y molesta todas las demás.
  var w=document.querySelector('.wrap');
  if(w) w.innerHTML='';
  document.title='…';

  // Se cierra apenas termina de mandar, no a los 2,5 segundos fijos.
  // Se define ANTES de usarla: una función declarada adentro de un bloque
  // no está garantizada arriba del bloque en todos los navegadores.
  var cerrarPronto=function(){ programarCierre(80); };
  envio.then(cerrarPronto, cerrarPronto);
  programarCierre(1500);   // tope, por si el envío queda colgado
}`,
  "la pestaña puente es un parpadeo, sin cartel ni espera"
);

/* ─── 5. una visita suelta ya no es "abrió el panel" ─── */
cambiar(
  `var eventos=[{ev:'open'}]; contado['open']=1;`,
  `// Sólo cuenta como apertura del panel si viene con el usuario: eso quiere
// decir que la abrió el panel para mandar sus datos. Una visita suelta a esta
// página es otra cosa —alguien mirando cómo instalarlo— y va con su propio
// nombre. Mezclarlas era lo que llenaba el tablero de gente "sin nombre".
var eventos=[{ev: usuarioPanel ? 'open' : 'visita_pagina'}];
contado[usuarioPanel ? 'open' : 'visita_pagina']=1;`,
  "una visita a la página ya no cuenta como uso del panel"
);

writeFileSync(P, s);
console.log(`\n${hechos}/4 cambios aplicados`);
process.exit(hechos === 4 ? 0 : 1);
