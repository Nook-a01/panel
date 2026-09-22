/* Los cinco dibujos de las baldosas del panel.
 *
 * Cada uno se usa como fondo con `background-size:cover` sobre una baldosa
 * que cambia mucho de forma: ancha y baja en el teléfono (≈347×210) y alta
 * y angosta en el panel de cinco columnas (≈300×640).
 *
 * Con ese recorte, sobre el lienzo de 900×1300 lo único que se ve SIEMPRE
 * es la caja x ∈ [190, 710], y ∈ [376, 924]:
 *   · teléfono  → escala por ancho  (347/900), sobra alto y se corta arriba
 *                 y abajo: queda y ∈ [376, 924].
 *   · 5 columnas → escala por alto  (640/1300), sobra ancho y se corta a los
 *                 costados: queda x ∈ [145, 755].
 * El motivo va adentro de esa caja. Lo de afuera es relleno que puede
 * cortarse sin que se note.
 *
 * Dos reglas más:
 *   · Formas macizas, no líneas finas: el dibujo se pinta a menos del 25%
 *     de opacidad y un trazo de 1px a esa altura no existe.
 *   · Sin fondo macizo: el lienzo queda transparente para que se vea el
 *     color propio de la baldosa y el velo que protege al texto.
 */
import fs from 'node:fs';

const W = 900, H = 1300;
const CX = 450;

const svg = (cuerpo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">\n` +
  cuerpo.trim() + '\n</svg>\n';

const r = (x, y, w, h, fill, o = 1, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${o !== 1 ? ` opacity="${o}"` : ''}${extra ? ' ' + extra : ''}/>`;
const c = (x, y, rad, fill, o = 1) =>
  `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"${o !== 1 ? ` opacity="${o}"` : ''}/>`;
const p = (d, fill, o = 1) =>
  `<path d="${d}" fill="${fill}"${o !== 1 ? ` opacity="${o}"` : ''}/>`;
const el = (x, y, rx, ry, fill, o = 1) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"${o !== 1 ? ` opacity="${o}"` : ''}/>`;

/* ══ 01 · DEPORTES ══════════════════════════════════════════════════
   Una tribuna con torres de luz. Las torres arriba, con la parrilla de
   reflectores y el cono de luz cayendo; la tribuna abajo, seis gradas
   con la gente como puntitos. */
function deportes(){
  const T = '#6cbdf2', A = '#f2c400';
  const s = [];

  // el cono de luz de cada torre
  s.push(p('M 258 500 L 342 500 L 452 760 L 148 760 Z', A, .13));
  s.push(p('M 642 500 L 558 500 L 448 760 L 752 760 Z', A, .13));

  // las dos torres
  for(const x of [300, 600]){
    s.push(r(x - 12, 470, 24, 250, T, .7));            // el mástil
    s.push(r(x - 74, 400, 148, 76, T, .85));           // la parrilla
    for(let f = 0; f < 3; f++)
      for(let col = 0; col < 5; col++)
        s.push(c(x - 57 + col * 28.5, 418 + f * 23, 8, A, .95));
  }

  // la tribuna: seis gradas que se abren hacia abajo
  for(let g = 0; g < 6; g++){
    const y = 726 + g * 33;
    const ancho = 420 + g * 82;
    const x0 = CX - ancho / 2;
    s.push(r(x0, y, ancho, 22, T, .2 + g * .06));
    const gente = Math.floor(ancho / 30);
    for(let i = 0; i < gente; i++)
      s.push(c(x0 + 15 + i * 30, y + 7, 6, T, .8));
  }

  // la línea del área: el borde de la cancha, abajo de todo
  s.push(`<path d="M 210 990 a 240 150 0 0 0 480 0" fill="none" stroke="${T}" stroke-width="10" opacity=".45"/>`);
  s.push(r(0, 1080, W, 10, T, .35));

  return svg(s.join('\n'));
}

/* ══ 02 · PLATA EN MANO ═════════════════════════════════════════════
   Un billete con su óvalo y sus guardas, y una pila de monedas. */
function plata(){
  const T = '#FF9A4D', A = '#FF6A33';
  const s = [];

  // el billete
  const bx = 186, by = 430, bw = 528, bh = 268;
  s.push(r(bx, by, bw, bh, T, .45, 'rx="8"'));
  s.push(r(bx + 16, by + 16, bw - 32, bh - 32, A, .3, 'rx="5"'));
  // el óvalo del medio, donde va la cara
  s.push(el(CX, by + bh / 2, 84, 98, A, .5));
  s.push(el(CX, by + bh / 2, 62, 76, T, .62));
  // las guardas a los costados
  for(let i = 0; i < 6; i++){
    s.push(r(bx + 38 + i * 15, by + 56, 6, bh - 112, A, .45));
    s.push(r(bx + bw - 44 - i * 15, by + 56, 6, bh - 112, A, .45));
  }
  // las cifras de las esquinas
  s.push(r(bx + 34, by + 34, 20, 20, A, .75));
  s.push(r(bx + bw - 54, by + bh - 54, 20, 20, A, .75));

  // la pila de monedas, a la derecha
  for(let i = 0; i < 6; i++){
    const y = 890 - i * 24;
    s.push(el(618, y, 86, 24, T, Number((.4 + i * .07).toFixed(2))));
    s.push(el(618, y - 6, 86, 24, A, .26));
  }
  // una moneda de frente, a la izquierda
  s.push(c(282, 830, 74, T, .45));
  s.push(c(282, 830, 52, A, .4));
  s.push(c(282, 830, 26, T, .5));

  return svg(s.join('\n'));
}

/* ══ 03 · INSTAGRAM ═════════════════════════════════════════════════
   Un teléfono con el retrato arriba y la grilla de nueve fotos. */
function instagram(){
  const T = '#E86FB5', A = '#FF8A5C';
  const s = [];

  const px = 276, py = 318, pw = 348, ph = 664;
  // el cuerpo del teléfono
  s.push(r(px, py, pw, ph, T, .5, 'rx="44"'));
  s.push(r(px + 15, py + 15, pw - 30, ph - 30, A, .26, 'rx="32"'));
  // el parlante
  s.push(r(CX - 42, py + 36, 84, 10, T, .75, 'rx="5"'));

  // el retrato: cabeza y hombros
  s.push(c(CX, 452, 48, T, .7));
  s.push(p(`M ${CX - 80} 560 a 80 80 0 0 1 160 0 Z`, T, .7));

  // la grilla de nueve fotos
  const lado = 82, sep = 12, g0x = px + 43, g0y = 594;
  for(let f = 0; f < 3; f++)
    for(let col = 0; col < 3; col++)
      s.push(r(g0x + col * (lado + sep), g0y + f * (lado + sep), lado, lado,
               (f + col) % 2 ? A : T, .65, 'rx="7"'));

  // el botón de abajo
  s.push(r(CX - 50, py + ph - 50, 100, 9, T, .6, 'rx="5"'));

  // la trama de puntos que rellena todo lo que quede fuera del teléfono
  for(let y = 50; y < H; y += 60)
    for(let x = 36; x < W; x += 60){
      if(x > px - 56 && x < px + pw + 56 && y > py - 56 && y < py + ph + 56) continue;
      s.push(c(x, y, 6.5, T, .32));
    }

  return svg(s.join('\n'));
}

/* ══ 04 · CAMPAMENTO ════════════════════════════════════════════════
   Una carpa con el fuego adelante y las montañas atrás. Todo entra en
   la caja que siempre se ve: el fuego es lo que lo hace reconocible y
   no puede quedar cortado abajo. */
function campamento(){
  const T = '#1D3FD6', A = '#E8402E', Y = '#FFD12E';
  const s = [];
  // La carpa va corrida a la izquierda y el fuego a la derecha. Centrados
  // los dos, la puerta roja de la carpa y la llama se fundían en una sola
  // mancha y no se entendía ni una cosa ni la otra.
  const TX = 366, FX = 646;

  // las montañas
  s.push(p('M -60 790 L 210 440 L 470 790 Z', T, .26));
  s.push(p('M 380 790 L 672 402 L 964 790 Z', T, .19));
  s.push(p('M 672 402 L 734 488 L 700 474 L 672 498 L 644 474 L 610 488 Z', Y, .4));

  // la carpa
  s.push(p(`M ${TX} 486 L ${TX + 176} 790 L ${TX - 176} 790 Z`, T, .82));
  s.push(p(`M ${TX} 572 L ${TX + 60} 790 L ${TX - 60} 790 Z`, A, .6));
  s.push(p(`M ${TX - 174} 788 L ${TX - 240} 790 L ${TX - 174} 776 Z`, T, .55));
  s.push(p(`M ${TX + 174} 788 L ${TX + 240} 790 L ${TX + 174} 776 Z`, T, .55));

  // el piso
  s.push(r(0, 790, W, 12, T, .5));

  // el fuego, adelante y a la derecha: los leños cruzados y las llamas
  s.push(r(FX - 86, 876, 172, 16, T, .6, `rx="8" transform="rotate(-13 ${FX} 884)"`));
  s.push(r(FX - 86, 876, 172, 16, T, .6, `rx="8" transform="rotate(13 ${FX} 884)"`));
  s.push(p(`M ${FX} 700 C ${FX + 64} 762 ${FX + 50} 842 ${FX} 878 C ${FX - 50} 842 ${FX - 64} 762 ${FX} 700 Z`, A, .8));
  s.push(p(`M ${FX} 762 C ${FX + 34} 800 ${FX + 27} 846 ${FX} 870 C ${FX - 27} 846 ${FX - 34} 800 ${FX} 762 Z`, Y, .88));

  // las chispas que suben del fuego
  for(const [x, y, rad] of [[FX - 66, 664, 7], [FX + 58, 686, 6], [FX - 34, 606, 5], [FX + 30, 628, 8], [FX, 560, 5]])
    s.push(c(x, y, rad, Y, .5));

  return svg(s.join('\n'));
}

/* ══ 05 · ESTUDIO ═══════════════════════════════════════════════════
   Una consola: la fila de perillas arriba y la de faders abajo. */
function musica(){
  const T = '#C6FF1F', B = '#F4F4F4';
  const s = [];

  // el panel
  s.push(r(186, 400, 528, 500, B, .1, 'rx="5"'));

  // las perillas, cada una girada distinto
  const perillas = [-2.2, -1.4, -0.6, 0.2, 1.0];
  perillas.forEach((ang, i) => {
    const x = 246 + i * 102;
    s.push(c(x, 470, 32, B, .26));
    s.push(c(x, 470, 20, T, .5));
    const lx = (x + Math.sin(ang) * 28).toFixed(0);
    const ly = (470 - Math.cos(ang) * 28).toFixed(0);
    s.push(`<line x1="${x}" y1="470" x2="${lx}" y2="${ly}" stroke="${B}" stroke-width="7" opacity=".8" stroke-linecap="round"/>`);
  });

  // los faders: el riel y el cabezal a distinta altura cada uno
  const alturas = [.72, .38, .86, .55, .64];
  alturas.forEach((a, i) => {
    const x = 246 + i * 102;
    s.push(r(x - 6, 552, 12, 300, B, .24, 'rx="6"'));
    const y = 552 + (1 - a) * 266;
    s.push(r(x - 29, y, 58, 32, T, .85, 'rx="4"'));
    s.push(r(x - 29, y + 14, 58, 4, '#000000', .5));
  });

  // los vúmetros de los costados, que pueden cortarse sin que se note
  for(const x of [66, 806]){
    for(let i = 0; i < 12; i++){
      const y = 852 - i * 25;
      s.push(r(x, y, 28, 15, i > 8 ? T : B, i > 8 ? .75 : .26, 'rx="2"'));
    }
  }

  // la tira del dembow abajo: el bombo cada cuatro tiempos, el hi-hat
  // en cada corchea. El mismo patrón que toca la pieza adentro de la app.
  for(let i = 0; i < 32; i++){
    const x = 30 + i * 27.2;
    const bombo = i % 8 === 0;
    s.push(r(x, 960, 19, bombo ? 28 : 15, bombo ? T : B, bombo ? .85 : .3));
  }

  return svg(s.join('\n'));
}

const salida = {
  'deportes.svg': deportes(),
  'plata.svg': plata(),
  'instagram.svg': instagram(),
  'campamento.svg': campamento(),
  'musica.svg': musica()
};

for(const [nombre, contenido] of Object.entries(salida)){
  fs.writeFileSync('docs/fondos/' + nombre, contenido);
  console.log(nombre.padEnd(18), String(contenido.length).padStart(6), 'bytes');
}
