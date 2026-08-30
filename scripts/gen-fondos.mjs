// Genera la imagen de fondo de cada tira de la portada.
//
// Son dibujos hechos acá, no fotos: así no dependemos de que un servidor
// ajeno siga sirviendo la imagen dentro de un año, pesan pocos KB y
// podemos afinarles el contraste hasta que el texto encima se lea
// siempre. Cada uno cuenta de qué va su sección:
//
//   deportes    → una cancha vista desde arriba
//   plata       → el grabado de guilloche de un billete
//   instagram   → una trama de semitonos, como una foto ampliada
//   campamento  → un piano roll con la onda de audio abajo
//
// Van en formato vertical porque en pantalla ancha las tiras son
// columnas altas y angostas: dibujados apaisados, el recorte se comía
// todo menos una franja del medio.

import { writeFileSync, mkdirSync } from "node:fs";

const n = x => Math.round(x * 100) / 100;

const svg = (W, H, piezas, defs = "") =>
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">
${defs}
${piezas}
</svg>
`;

/* ── 01 · Deportes: una cancha vista desde arriba ─────────────
   Vertical, como se ve una cancha en el celular. El círculo central
   queda en el medio de la tira, que es lo que se ve siempre, se
   recorte como se recorte. */
function deportes() {
  const W = 900, H = 1300, c = "#6cbdf2";
  const m = 60, cx = W / 2, cy = H / 2;
  const areaAncho = 400, areaAlto = 150;      // el área grande
  const chicoAncho = 190, chicoAlto = 62;     // el área chica

  const franjas = [];
  for (let i = 0; i < 12; i += 2) {
    const y = m + i * ((H - m * 2) / 12);
    franjas.push(`<rect x="${m}" y="${n(y)}" width="${W - m * 2}" height="${n((H - m * 2) / 12)}" fill="${c}" opacity=".06"/>`);
  }

  const p = [
    `<rect x="${m}" y="${m}" width="${W - m * 2}" height="${H - m * 2}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<line x1="${m}" y1="${cy}" x2="${W - m}" y2="${cy}" stroke="${c}" stroke-width="3"/>`,
    `<circle cx="${cx}" cy="${cy}" r="130" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<circle cx="${cx}" cy="${cy}" r="9" fill="${c}"/>`,
    // el arco de arriba
    `<rect x="${cx - areaAncho / 2}" y="${m}" width="${areaAncho}" height="${areaAlto}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<rect x="${cx - chicoAncho / 2}" y="${m}" width="${chicoAncho}" height="${chicoAlto}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<circle cx="${cx}" cy="${m + 108}" r="7" fill="${c}"/>`,
    // el arco de abajo
    `<rect x="${cx - areaAncho / 2}" y="${H - m - areaAlto}" width="${areaAncho}" height="${areaAlto}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<rect x="${cx - chicoAncho / 2}" y="${H - m - chicoAlto}" width="${chicoAncho}" height="${chicoAlto}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<circle cx="${cx}" cy="${H - m - 108}" r="7" fill="${c}"/>`,
    // los cuatro córners
    `<path d="M${m} ${m + 34} A34 34 0 0 0 ${m + 34} ${m}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<path d="M${W - m - 34} ${m} A34 34 0 0 0 ${W - m} ${m + 34}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<path d="M${m} ${H - m - 34} A34 34 0 0 1 ${m + 34} ${H - m}" fill="none" stroke="${c}" stroke-width="3"/>`,
    `<path d="M${W - m - 34} ${H - m} A34 34 0 0 1 ${W - m} ${H - m - 34}" fill="none" stroke="${c}" stroke-width="3"/>`,
  ];
  return svg(W, H, franjas.join("\n") + "\n" + p.join("\n"));
}

/* ── 02 · Plata: el guilloche de un billete ───────────────────
   El entramado fino de los billetes es una rosácea: una figura
   simple repetida girando sobre el centro. Se dibuja UNA elipse y
   se la repite con <use>, en vez de calcular la curva punto por
   punto — así el archivo pasa de 240 KB a menos de 5. */
function plata() {
  const W = 900, H = 1300, c = "#0A7A6C";
  const cx = W / 2, cy = H / 2;

  const anillo = (id, rx, ry, cuantas, opac) => {
    const usos = [];
    for (let i = 0; i < cuantas; i++)
      usos.push(`<use href="#${id}" transform="rotate(${n(360 / cuantas * i)} ${cx} ${cy})"/>`);
    return `<ellipse id="${id}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="1.6" opacity="${opac}"/>
<g opacity="${opac}">${usos.join("")}</g>`;
  };

  const p = [
    anillo("a", 400, 118, 34, ".5"),
    anillo("b", 284, 78, 26, ".45"),
    anillo("c", 172, 46, 18, ".4"),
    `<circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${c}" stroke-width="3" opacity=".55"/>`,
    // el marco del billete
    `<rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none" stroke="${c}" stroke-width="3" opacity=".5"/>`,
    `<rect x="64" y="64" width="${W - 128}" height="${H - 128}" fill="none" stroke="${c}" stroke-width="1.5" opacity=".35"/>`,
  ];
  return svg(W, H, p.join("\n"));
}

/* ── 03 · Instagram: trama de semitonos ───────────────────────
   La retícula de puntos de una foto impresa, ampliada hasta que se
   ve el punto. Es un <pattern> que se repite solo, así que se ve
   igual de bien con cualquier recorte y pesa menos de 1 KB. */
function instagram() {
  const W = 900, H = 1300;
  return svg(W, H,
    `<rect width="${W}" height="${H}" fill="url(#trama)"/>
<rect width="${W}" height="${H}" fill="url(#relieve)"/>`,
    `<defs>
  <pattern id="trama" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(22)">
    <circle cx="11.5" cy="11.5" r="8.4" fill="#c13584"/>
    <circle cx="34.5" cy="34.5" r="8.4" fill="#f56040"/>
    <circle cx="34.5" cy="11.5" r="4" fill="#f56040"/>
    <circle cx="11.5" cy="34.5" r="4" fill="#c13584"/>
  </pattern>
  <radialGradient id="relieve" cx="34%" cy="26%" r="86%">
    <stop offset="0" stop-color="#000" stop-opacity="0"/>
    <stop offset=".5" stop-color="#000" stop-opacity=".35"/>
    <stop offset="1" stop-color="#000" stop-opacity=".8"/>
  </radialGradient>
</defs>`);
}

/* ── 04 · Campamento: piano roll y forma de onda ──────────────
   Arriba las notas como las ves en FL Studio; abajo, la onda del
   audio. Es literalmente la pantalla en la que trabajás. */
function campamento() {
  const W = 900, H = 1300, c1 = "#ff9a4d", c2 = "#b48cff";
  const p = [];

  const filas = 26, altoFila = 34, top = 40, compas = 108;
  const negras = new Set([1, 3, 6, 8, 10, 13, 15, 18, 20, 22, 25]);
  for (let i = 0; i < filas; i++) {
    const y = top + i * altoFila;
    if (negras.has(i)) p.push(`<rect x="0" y="${y}" width="${W}" height="${altoFila}" fill="${c1}" opacity=".07"/>`);
    p.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${c1}" stroke-width="1" opacity=".18"/>`);
  }
  for (let x = 0; x <= W; x += compas) {
    const fuerte = (x / compas) % 4 === 0;
    p.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + filas * altoFila}" stroke="${c1}" stroke-width="${fuerte ? 2.5 : 1}" opacity="${fuerte ? .32 : .15}"/>`);
  }

  // Un patrón fijo de notas, para que el dibujo sea siempre el mismo.
  const notas = [
    [0, 17, 2], [2, 14, 1], [3, 12, 3], [5, 17, 2], [6, 9, 1], [7, 15, 4],
    [0, 23, 1], [2, 23, 1], [4, 23, 1], [6, 23, 1],
    [1, 6, 2], [4, 4, 3], [7, 2, 1], [3, 20, 2], [6, 18, 2], [0, 11, 1], [5, 7, 2],
  ];
  for (const [cm, fila, largo] of notas) {
    const x = cm * compas + 4, y = top + fila * altoFila + 5;
    p.push(`<rect x="${x}" y="${y}" width="${largo * compas - 8}" height="${altoFila - 10}" rx="5" fill="${fila >= 22 ? c2 : c1}" opacity=".6"/>`);
  }

  // La forma de onda, abajo de todo.
  const base = top + filas * altoFila + 150, amp = 105;
  const arriba = [], abajo = [];
  for (let x = 0; x <= W; x += 5) {
    const t = x / W;
    const env = Math.sin(t * Math.PI) * .55 + .45;   // el ataque y la caída
    const v = (Math.sin(t * 61) * .5 + Math.sin(t * 23) * .32 + Math.sin(t * 7) * .18) * env;
    arriba.push(n(x) + "," + n(base - v * amp));
    abajo.unshift(n(x) + "," + n(base + v * amp));
  }
  p.push(`<polygon points="${arriba.concat(abajo).join(" ")}" fill="${c1}" opacity=".5"/>`);
  p.push(`<line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="${c1}" stroke-width="1.5" opacity=".4"/>`);

  return svg(W, H, p.join("\n"));
}

mkdirSync(new URL("../docs/fondos/", import.meta.url), { recursive: true });
for (const [nombre, hacer] of Object.entries({ deportes, plata, instagram, campamento })) {
  const contenido = hacer();
  writeFileSync(new URL(`../docs/fondos/${nombre}.svg`, import.meta.url), contenido);
  console.log(`  ✓ fondos/${nombre}.svg  ${(contenido.length / 1024).toFixed(1)} KB`);
}
