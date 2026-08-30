// Le cambia la piel al panel que se abre adentro de Instagram.
//
// Antes: fondo violeta a negro, degradado azul-rosa-naranja de Instagram,
// esquinas muy redondeadas, sombras difusas. Era el look de 2021 y no se
// parecía en nada al resto del Panel.
//
// Ahora: el mismo lenguaje que la sección de Instagram del Panel — negro,
// verde ácido, magenta, bordes duros de 2 px, cero redondeos, mayúsculas
// pesadas. Es un afiche, no una app de vidrio esmerilado.
//
// No se reescriben las noventa reglas que ya había: se agrega una capa al
// final de la hoja, que gana por orden. Reescribirlas habría sido más
// prolijo y mucho más fácil de romper.
//
// Sobre el contraste: la paleta es blanco o ácido sobre negro, y negro
// sobre ácido. Son las cuatro combinaciones que se leen sí o sí; no hay
// grises sobre grises, que es donde siempre se falla.

import { readFileSync, writeFileSync } from "node:fs";

const P = "docs/instagram/index.html";
let s = readFileSync(P, "utf8");

const ANCLA = "  var styleEl=document.createElement('style'); styleEl.id='igpp-style';";
if (!s.includes(ANCLA)) { console.error("✗ no encontré dónde se arma la hoja"); process.exit(1); }

// Se sacan TODAS las capas anteriores antes de poner la nueva.
//
// La marca tiene que ser la misma cadena que se escribe abajo. La primera
// versión buscaba "/* piel afiche */" pero escribía "// piel afiche": nunca
// coincidían, así que en vez de reemplazar la capa la apilaba, y con dos
// corridas el archivo ya tenía dos.
const MARCA = "  css+=''+  // piel afiche";
let quitadas = 0;
while (s.includes(MARCA)) {
  const d = s.indexOf(MARCA);
  const h = s.indexOf(ANCLA, d);
  if (h < 0) break;
  s = s.slice(0, d) + s.slice(h);
  quitadas++;
}
if (quitadas) console.log(`  · saqué ${quitadas} capa(s) anterior(es)`);

const capa = `  css+=''+  // piel afiche
  /* ── el fondo detrás del panel ── */
  '#igpp-root{background:rgba(0,0,0,.9);backdrop-filter:blur(3px)}'+

  /* ── la ventana ── */
  '.igpp-panel{background:#000;border:2px solid #fff;border-radius:0;box-shadow:none;color:#fff}'+

  /* ── la cabecera ── */
  '.igpp-head{background:#000;border-bottom:3px solid #fff;padding:14px 18px}'+
  '.igpp-logo{font-weight:900;text-transform:uppercase;letter-spacing:-.02em;font-size:1.1rem}'+
  '.igpp-logodot{background:#CCFF00;border-radius:0;box-shadow:none;width:22px;height:22px}'+
  '.igpp-close{background:#000;border:2px solid #fff;border-radius:0;color:#fff;font-weight:900}'+
  '.igpp-close:hover{background:#CCFF00;color:#000;border-color:#CCFF00}'+

  /* ── las solapas ── */
  '.igpp-tabs{background:#000;border-bottom:2px solid #333;gap:0}'+
  '.igpp-tab{background:#000;border:0;border-bottom:3px solid transparent;border-radius:0;'+
    'color:#8b8b8b;font-weight:800;text-transform:uppercase;letter-spacing:.02em;font-size:.8rem}'+
  '.igpp-tab:hover{background:#0d0d0d;color:#fff}'+
  '.igpp-tab.on{background:#000;color:#CCFF00;border-bottom-color:#CCFF00}'+

  /* ── el cuerpo ── */
  '.igpp-body{background:#000}'+
  '.igpp-card{background:#000;border:2px solid #fff;border-radius:0;box-shadow:none}'+
  '.igpp-row{background:#000;border:1px solid #2a2a2a;border-radius:0}'+
  '.igpp-row:hover{background:#0d0d0d;border-color:#CCFF00}'+
  '.igpp-note{background:#0d0d0d;border:2px solid #fff;border-left:8px solid #CCFF00;border-radius:0;color:#fff}'+

  /* ── botones ── */
  '.igpp-btn{background:#000;border:2px solid #fff;border-radius:0;color:#fff;'+
    'font-weight:800;text-transform:uppercase;letter-spacing:.03em;transition:background .11s linear,color .11s linear}'+
  '.igpp-btn:hover:not(:disabled){background:#CCFF00;color:#000;border-color:#CCFF00}'+
  '.igpp-primary{background:#CCFF00;border:2px solid #CCFF00;border-radius:0;color:#000;'+
    'font-weight:900;text-transform:uppercase}'+
  '.igpp-primary:hover:not(:disabled){background:#fff;border-color:#fff;color:#000}'+
  '.igpp-danger{background:#000;border:2px solid #FF2D7A;border-radius:0;color:#FF2D7A;'+
    'font-weight:900;text-transform:uppercase}'+
  '.igpp-danger:hover:not(:disabled){background:#FF2D7A;color:#000}'+

  /* ── píldoras y etiquetas ── */
  '.igpp-pill{background:#000;border:2px solid #fff;border-radius:0;color:#fff;font-weight:700}'+
  '.igpp-pill.on{background:#CCFF00;border-color:#CCFF00;color:#000}'+
  '.igpp-chip{background:#0d0d0d;border:1px solid #444;border-radius:0;color:#c9c9c9}'+
  '.igpp-badge{background:#CCFF00;border-radius:0;color:#000;font-weight:900}'+
  '.igpp-flab{background:#000;border:2px solid #333;border-radius:0;color:#fff}'+
  '.igpp-flab.on{border-color:#CCFF00;color:#CCFF00}'+

  /* ── campos ── */
  '.igpp-input{background:#0d0d0d;border:2px solid #333;border-radius:0;color:#fff}'+
  '.igpp-input:focus{border-color:#CCFF00;outline:none;box-shadow:none}'+

  /* ── barra de avance ── */
  '.igpp-progresswrap{background:#171717;border:1px solid #333;border-radius:0}'+
  '.igpp-progress{background:#CCFF00;border-radius:0}'+

  /* ── números grandes ── */
  '.igpp-stat{background:#000;border:2px solid #fff;border-radius:0;box-shadow:none}'+
  '.igpp-statnum{color:#CCFF00;font-weight:900}'+
  '.igpp-statlbl{color:#8b8b8b;text-transform:uppercase;letter-spacing:.08em;font-size:.62rem}'+

  /* ── las fotos de perfil siguen redondas: son caras, no cajas ── */
  '.igpp-av,.igpp-avfb{border-radius:50%;border:2px solid #333}'+
  '.igpp-av.nf{border-color:#FF2D7A}'+

  /* ── el usuario, en ácido ── */
  '.igpp-user{color:#fff;font-weight:700}'+
  '.igpp-meta{color:#8b8b8b}'+
  '';

`;

s = s.replace(ANCLA, capa + ANCLA);
writeFileSync(P, s);
console.log("✓ el panel usa la piel del afiche");
